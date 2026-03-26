// Patient profile page — patient info, status editor, therapist editor, status history.

import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import Breadcrumb from "../../components/ui/Breadcrumb";
import PatientStatusBadge from "../../components/patients/PatientStatusBadge";
import StatusHistoryLog from "../../components/patients/StatusHistoryLog";
import StatusHistoryModal from "../../components/patients/StatusHistoryModal";
import Spinner from "../../components/ui/Spinner";
import type { Patient, PatientStatusLog, TeamMember, TherapySession } from "../../types/index";
import { STATUS_LABELS, STATUS_TRANSITIONS, STATUS_NEXT_ACTION_HINT } from "../../constants/statuses";
import { getPatient, getStatusLogs, updatePatientStatus, updatePatientTherapist, updatePatientInfo, deletePatient } from "../../api/patients";
import { listTeamMembers } from "../../api/teamMembers";
import { listSessions, cancelSession, completeSession, deleteSession, rescheduleSession, markNoShow, updatePaymentStatus } from "../../api/therapySessions";
import { getNotesForSession } from "../../api/clinicalNotes";
import type { ClinicalNote } from "../../api/clinicalNotes";
import SessionsTable from "../../components/schedule/SessionsTable";
import ClinicalNotesPanel from "../../components/schedule/ClinicalNotesPanel";
import AddSessionModal from "../../components/schedule/AddSessionModal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import { useIsMobile } from "../../hooks/useIsMobile";
import type { PaymentStatus } from "../../types/index";

function getAdminName(): string {
  try {
    const stored = localStorage.getItem("admin_name");
    if (stored) return stored;
  } catch {}
  return "Admin";
}

function avatarColor(name: string): string {
  const colors = ["#6366F1","#1A7A6E","#F59E0B","#EF4444","#8B5CF6","#EC4899","#10B981","#0EA5E9"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function initialsOf(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function setAdminName(name: string) {
  try { localStorage.setItem("admin_name", name); } catch {}
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function CollapsibleCard({
  title, children, defaultOpen = true, storageKey,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
}) {
  const key = storageKey ?? title;
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const stored = sessionStorage.getItem(`collapse_${key}`);
      return stored !== null ? stored === "true" : defaultOpen;
    } catch { return defaultOpen; }
  });

  function toggle() {
    const next = !open;
    setOpen(next);
    try { sessionStorage.setItem(`collapse_${key}`, String(next)); } catch {}
  }

  return (
    <div style={{ background: "#fff", borderRadius: 12, marginBottom: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.05), 0 4px 14px rgba(0,0,0,0.04)", border: "1px solid #ddd5cb", overflow: "hidden" }}>
      <button
        onClick={toggle}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 24px", background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: "#1a2535" }}>{title}</span>
        <span style={{ fontSize: 14, color: "#94a3b8", transition: "transform 0.2s ease", transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}>
          ›
        </span>
      </button>
      {open && (
        <div style={{ padding: "0 24px 24px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "#b8c4cc", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
      <span style={{ fontSize: 12, color: "#1a2535" }}>{value ?? <span style={{ color: "#b8c4cc" }}>—</span>}</span>
    </div>
  );
}

export default function PatientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const patientId = parseInt(id ?? "", 10);
  const { showToast } = useToast();
  const isMobile = useIsMobile();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [logs, setLogs] = useState<PatientStatusLog[]>([]);
  const [sessions, setSessions] = useState<TherapySession[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [therapists, setTherapists] = useState<TeamMember[]>([]);
  const [adminName, setAdminNameState] = useState(() => getAdminName());
  const [allPatientNotes, setAllPatientNotes] = useState<ClinicalNote[]>([]);

  // Status update form
  const [newStatus, setNewStatus] = useState("");
  const [changedByName, setChangedByName] = useState("");
  const [notes, setNotes] = useState("");
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [statusFieldError, setStatusFieldError] = useState<string | null>(null);
  const [nameFieldError, setNameFieldError] = useState<string | null>(null);

  // Modal states
  const [showStatusHistory, setShowStatusHistory] = useState(false);
  const [showCurrentStatus, setShowCurrentStatus] = useState(false);

  // Patient info collapsible
  const [infoOpen, setInfoOpen] = useState(true);

  // Patient info edit
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoValues, setInfoValues] = useState({ name: "", mobile: "", email: "", age: "", source: "", referred_by: "" });
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);

  // Delete patient confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Clinical notes panel
  const [notesSession, setNotesSession] = useState<TherapySession | null>(null);

  // Add session modal
  const [showAddSession, setShowAddSession] = useState(false);

  // Therapist edit form
  const [selectedTherapistId, setSelectedTherapistId] = useState<string>("");
  const [therapistChangedBy, setTherapistChangedBy] = useState("");
  const [therapistError, setTherapistError] = useState<string | null>(null);
  const [updatingTherapist, setUpdatingTherapist] = useState(false);
  const [therapistNameError, setTherapistNameError] = useState<string | null>(null);

  useEffect(() => {
    if (isNaN(patientId)) { setLoadError("Invalid patient ID."); return; }
    void (async () => {
      try {
        const [p, l, members, sessResult] = await Promise.all([
          getPatient(patientId),
          getStatusLogs(patientId),
          listTeamMembers(),
          listSessions({ patient_id: patientId, limit: 200 }),
        ]);
        setPatient(p);
        setLogs(l);
        setSessions(sessResult.sessions);
        setNewStatus(p.currentStatus);
        setSelectedTherapistId(p.therapistId ? String(p.therapistId) : "");
        setInfoValues({ name: p.name, mobile: p.mobile, email: p.email, age: String(p.age), source: p.source ?? "", referred_by: p.referredBy ?? "" });
        setTherapists(members.filter((m) => m.isActive));

        // After loading sessions, collect all notes
        const allNotes: ClinicalNote[] = [];
        for (const sess of sessResult.sessions) {
          try {
            const notes = await getNotesForSession(sess.id);
            allNotes.push(...notes);
          } catch {}
        }
        setAllPatientNotes(allNotes);
      } catch {
        setLoadError("Patient not found or failed to load.");
      }
    })();
  }, [patientId]);

  async function handleStatusUpdate(e: React.FormEvent) {
    e.preventDefault();
    let valid = true;
    if (!newStatus) { setStatusFieldError("Please select a status."); valid = false; } else setStatusFieldError(null);
    const nameToSubmit = changedByName.trim() || adminName;
    if (!nameToSubmit.trim()) { setNameFieldError("Your name is required."); valid = false; } else setNameFieldError(null);
    if (!valid) return;

    setUpdating(true);
    setUpdateError(null);
    try {
      const updated = await updatePatientStatus(patientId, { new_status: newStatus as any, changed_by_name: nameToSubmit, notes: notes.trim() || undefined });
      setPatient(updated);
      setLogs(await getStatusLogs(patientId));
      setAdminName(nameToSubmit);
      setChangedByName("");
      setNotes("");
      setNewStatus("");
      setShowCurrentStatus(false);
    } catch {
      setUpdateError("Failed to update status. Please try again.");
    } finally {
      setUpdating(false);
    }
  }

  // Combined save — updates both patient info AND therapist in one CTA
  async function handleSaveAll(e: React.FormEvent) {
    e.preventDefault();
    const nameToSubmit = therapistChangedBy.trim() || adminName;
    setSavingInfo(true);
    setInfoError(null);
    setTherapistError(null);
    try {
      // Always save patient info
      const updatedPatient = await updatePatientInfo(patientId, {
        name: infoValues.name.trim() || undefined,
        mobile: infoValues.mobile.trim() || undefined,
        email: infoValues.email.trim() || undefined,
        age: infoValues.age ? parseInt(infoValues.age, 10) : undefined,
        source: infoValues.source.trim() || null,
        referred_by: infoValues.referred_by.trim() || null,
      });
      // Save therapist if selection differs from current or name provided
      const currentTherapistId = updatedPatient.therapistId ? String(updatedPatient.therapistId) : "";
      if (selectedTherapistId !== currentTherapistId || therapistChangedBy.trim()) {
        const updated = await updatePatientTherapist(patientId, {
          therapist_id: selectedTherapistId ? parseInt(selectedTherapistId, 10) : null,
          changed_by_name: nameToSubmit,
        });
        setPatient(updated);
        setLogs(await getStatusLogs(patientId));
        try { localStorage.setItem("admin_name", nameToSubmit); } catch {}
      } else {
        setPatient(updatedPatient);
      }
      setEditingInfo(false);
    } catch {
      setInfoError("Failed to save changes. Please try again.");
    } finally {
      setSavingInfo(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deletePatient(patientId);
      navigate("/patients");
    } catch {
      showToast("Failed to delete patient.", "error");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  async function refreshSessions() {
    const r = await listSessions({ patient_id: patientId, limit: 200 });
    setSessions(r.sessions);
  }

  async function refreshPatientAndSessions() {
    const [p, r] = await Promise.all([
      getPatient(patientId),
      listSessions({ patient_id: patientId, limit: 200 }),
    ]);
    setPatient(p);
    setSessions(r.sessions);
    setNewStatus("");
  }

  async function handleSessionReschedule(id: number, payload: { session_date: string; start_time: string; duration_mins: number; notes?: string }) {
    try { await rescheduleSession(id, payload); await refreshPatientAndSessions(); showToast("Session rescheduled.", "success"); }
    catch { showToast("Failed to reschedule session.", "error"); }
  }

  async function handleSessionNoShow(id: number, no_show_fee?: number) {
    try { await markNoShow(id, no_show_fee); await refreshSessions(); showToast("Session marked as no-show.", "success"); }
    catch { showToast("Failed to mark no-show.", "error"); }
  }

  async function handleSessionPaymentStatus(id: number, payment_status: PaymentStatus, changed_by_name: string) {
    try { await updatePaymentStatus(id, payment_status, changed_by_name); await refreshSessions(); showToast("Payment status updated.", "success"); }
    catch { showToast("Failed to update payment status.", "error"); }
  }

  if (loadError) {
    return (
      <Layout title="Patient Profile">
        <p style={{ color: "#c53030" }}>{loadError}</p>
        <button style={s.backBtn} onClick={() => navigate("/patients")}>← Back to Patients</button>
      </Layout>
    );
  }

  if (!patient) {
    return <Layout title="Patient Profile"><p style={{ color: "#718096" }}><Spinner /></p></Layout>;
  }

  // ── Mobile render ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <Layout title={patient.name}>
        {/* Mobile breadcrumb row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <button style={s.backBtn} onClick={() => navigate("/patients")}>← Patients</button>
          <button style={s.dangerBtn} onClick={() => setShowDeleteConfirm(true)}>Delete</button>
        </div>

        {/* Patient info card — always visible on mobile */}
        <div style={{ ...s.card, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
            {/* Large avatar circle */}
            <div style={{
              width: 52, height: 52, borderRadius: "50%",
              background: avatarColor(patient.name) + "22",
              color: avatarColor(patient.name),
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontWeight: 800, flexShrink: 0,
            }}>
              {initialsOf(patient.name)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", lineHeight: 1.2 }}>{patient.name}</div>
              <div style={{ fontSize: 13, color: "#64748B", marginTop: 3 }}>#{patient.patientNumber}</div>
              <div style={{ marginTop: 6 }}>
                <PatientStatusBadge status={patient.currentStatus} />
              </div>
            </div>
          </div>
          <div className="section-label" style={{ marginTop: 0, marginBottom: 8 }}>Patient Details</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <InfoRow label="Mobile" value={patient.mobile} />
            <InfoRow label="Age" value={`${patient.age} yrs`} />
            <InfoRow label="Email" value={patient.email} />
            <InfoRow label="Source" value={patient.source} />
            <InfoRow label="Referred By" value={patient.referredBy} />
            <InfoRow label="Therapist" value={patient.therapist ? patient.therapist.name : null} />
            <InfoRow label="Registered" value={formatDate(patient.createdAt)} />
          </div>

          {!editingInfo ? (
            <button
              style={{ ...s.editBtn, marginTop: 12, width: "100%" }}
              onClick={() => setEditingInfo(true)}
            >
              Edit Info
            </button>
          ) : (
            <form onSubmit={handleSaveAll} style={{ marginTop: 12 }}>
              {infoError && <p style={s.apiError}>{infoError}</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { field: "name", label: "Full Name" },
                  { field: "mobile", label: "Mobile" },
                  { field: "email", label: "Email" },
                  { field: "age", label: "Age" },
                  { field: "referred_by", label: "Referred By" },
                ].map(({ field, label }) => (
                  <div key={field} style={s.fieldCol}>
                    <label style={s.label}>{label}</label>
                    <input
                      style={{ ...s.input, width: "100%", boxSizing: "border-box" }}
                      value={(infoValues as Record<string, string>)[field]}
                      onChange={(e) => setInfoValues((v) => ({ ...v, [field]: e.target.value }))}
                    />
                  </div>
                ))}
                <div style={s.fieldCol}>
                  <label style={s.label}>Source</label>
                  <select style={{ ...s.select, width: "100%", boxSizing: "border-box" }} value={infoValues.source} onChange={(e) => setInfoValues((v) => ({ ...v, source: e.target.value }))}>
                    <option value="">—</option>
                    <option value="Patient referral">Patient referral</option>
                    <option value="Doctor referral">Doctor referral</option>
                    <option value="Other referral">Other referral</option>
                    <option value="Events">Events</option>
                  </select>
                </div>
                <div style={s.fieldCol}>
                  <label style={s.label}>Therapist</label>
                  <select style={{ ...s.select, width: "100%", boxSizing: "border-box" }} value={selectedTherapistId} onChange={(e) => setSelectedTherapistId(e.target.value)}>
                    <option value="">No therapist assigned</option>
                    {therapists.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button type="submit" style={{ ...s.updateBtn, flex: 2 }} disabled={savingInfo}>
                  {savingInfo ? "Saving…" : "Save Changes"}
                </button>
                <button type="button" style={{ ...s.secondaryBtn, flex: 1 }} onClick={() => { setEditingInfo(false); setInfoError(null); }}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Schedule CTA — context-aware based on patient status */}
        {(patient.currentStatus === "created" ||
          patient.currentStatus === "discovery_scheduled" ||
          patient.currentStatus === "discovery_completed" ||
          patient.currentStatus === "started_therapy" ||
          patient.currentStatus === "therapy_paused") && (
          <button
            style={{ width: "100%", padding: "11px 16px", borderRadius: 10, border: "none", background: (patient.currentStatus === "created" || patient.currentStatus === "discovery_scheduled") ? "#0369a1" : "#1A7A6E", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}
            onClick={() => setShowAddSession(true)}
          >
            {patient.currentStatus === "created" ? "📅 Schedule Discovery Call" :
             patient.currentStatus === "discovery_scheduled" ? "📅 Reschedule Discovery Call" :
             "📅 Schedule Session"}
          </button>
        )}

        {/* Status action buttons */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            style={{ flex: 1, padding: "10px 16px", borderRadius: 10, border: "none", background: "#1A7A6E", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            onClick={() => setShowCurrentStatus(true)}
          >
            Change Status
          </button>
          <button
            style={{ flex: 1, padding: "10px 16px", borderRadius: 10, border: "2px solid #1A7A6E", background: "#fff", color: "#1A7A6E", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            onClick={() => setShowStatusHistory(true)}
          >
            View History
          </button>
        </div>

        {/* Clinical notes summary */}
        {allPatientNotes.length > 0 && (
          <div style={{ ...s.card, marginBottom: 10 }}>
            <div className="section-label" style={{ marginTop: 0, marginBottom: 8 }}>
              Clinical Notes ({allPatientNotes.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {allPatientNotes.slice(0, 3).map((note) => (
                <div key={note.id} style={{ fontSize: 12, color: "#334155", background: "#fdfbf9", padding: "8px 10px", borderRadius: 6, borderLeft: "2px solid #2d6b5f" }}>
                  <p style={{ margin: 0, marginBottom: 4 }}>{note.content.length > 100 ? note.content.substring(0, 100) + "..." : note.content}</p>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>
                    {note.createdByName} · {new Date(note.createdAt).toLocaleDateString("en-IN")}
                  </div>
                </div>
              ))}
              {allPatientNotes.length > 3 && (
                <div style={{ fontSize: 11, color: "#2d6b5f", fontWeight: 600 }}>+{allPatientNotes.length - 3} more notes</div>
              )}
            </div>
          </div>
        )}

        {/* Therapy Sessions — collapsible */}
        {sessions.length > 0 && (
          <CollapsibleCard title={`Therapy Sessions (${sessions.length})`} storageKey="sessions" defaultOpen={false}>
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <SessionsTable
                sessions={sessions}
                showPatient={false}
                onCancel={async (id, reason) => { await cancelSession(id, reason); await refreshPatientAndSessions(); showToast("Session cancelled.", "success"); }}
                onComplete={async (id, charges, notes) => { await completeSession(id, charges, notes); await refreshPatientAndSessions(); showToast("Session completed.", "success"); }}
                onDelete={async (id) => { await deleteSession(id); await refreshSessions(); showToast("Session deleted.", "success"); }}
                onReschedule={handleSessionReschedule}
                onNoShow={handleSessionNoShow}
                onPaymentStatusChange={handleSessionPaymentStatus}
                onNotes={(session) => setNotesSession(session)}
              />
            </div>
          </CollapsibleCard>
        )}

        {/* Change Status Modal */}
        {showCurrentStatus && (
          <>
            <div onClick={() => setShowCurrentStatus(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200 }} />
            <div style={{
              position: "fixed", bottom: 0, left: 0, right: 0,
              background: "#fff", borderRadius: "16px 16px 0 0", zIndex: 201,
              padding: "24px 20px", boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
              maxHeight: "90vh", overflowY: "auto",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1a2535" }}>Update Status</h2>
                <button onClick={() => setShowCurrentStatus(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#94a3b8" }}>✕</button>
              </div>
              {(() => {
                const validNext = STATUS_TRANSITIONS[patient.currentStatus] ?? [];
                const hint = STATUS_NEXT_ACTION_HINT[patient.currentStatus];
                if (validNext.length === 0) {
                  return (
                    <div>
                      {hint && (
                        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12, color: "#1d4ed8" }}>
                          {hint}
                        </div>
                      )}
                      {!hint && (
                        <div style={{ background: "#f1f5f9", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#64748b" }}>
                          This status has no further transitions.
                        </div>
                      )}
                      <button type="button" onClick={() => setShowCurrentStatus(false)} style={{ ...s.secondaryBtn, marginTop: 10, width: "100%" }}>
                        Close
                      </button>
                    </div>
                  );
                }
                return (
                  <form onSubmit={handleStatusUpdate}>
                    {updateError && <p style={s.apiError}>{updateError}</p>}
                    {hint && (
                      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12, color: "#1d4ed8" }}>
                        {hint}
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                      <div style={s.fieldCol}>
                        <label style={s.label}>New Status *</label>
                        <select style={{ ...s.select, width: "100%", boxSizing: "border-box" }} value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                          <option value="">— Select —</option>
                          {validNext.map((st) => <option key={st} value={st}>{STATUS_LABELS[st]}</option>)}
                        </select>
                        {statusFieldError && <span style={s.fieldErr}>{statusFieldError}</span>}
                      </div>
                      <div style={s.fieldCol}>
                        <label style={s.label}>Changed By *</label>
                        <input
                          style={{ ...s.input, width: "100%", boxSizing: "border-box" }}
                          value={changedByName || adminName}
                          onChange={(e) => setChangedByName(e.target.value)}
                          placeholder={adminName}
                        />
                        {nameFieldError && <span style={s.fieldErr}>{nameFieldError}</span>}
                      </div>
                      <div style={s.fieldCol}>
                        <label style={s.label}>Notes / Reason</label>
                        <textarea
                          style={{ ...s.input, width: "100%", boxSizing: "border-box", minHeight: 80, resize: "vertical" }}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Add context…"
                        />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button type="submit" style={{ ...s.updateBtn, flex: 2 }} disabled={updating}>
                        {updating ? "Updating…" : "Update Status"}
                      </button>
                      <button type="button" onClick={() => setShowCurrentStatus(false)} style={{ ...s.secondaryBtn, flex: 1 }}>
                        Cancel
                      </button>
                    </div>
                  </form>
                );
              })()}
            </div>
          </>
        )}

        <StatusHistoryModal open={showStatusHistory} logs={logs} onClose={() => setShowStatusHistory(false)} />

        <ConfirmDialog
          open={showDeleteConfirm}
          title="Delete Patient"
          message={`Permanently delete ${patient?.name}? All sessions and history will be removed. This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />

        {notesSession && (
          <ClinicalNotesPanel
            sessionId={notesSession.id}
            patientName={notesSession.patient.name}
            sessionDate={notesSession.startTime}
            onClose={() => setNotesSession(null)}
          />
        )}

        {showAddSession && (
          <AddSessionModal
            initialPatientId={patient.id}
            initialSessionType={(patient.currentStatus === "created" || patient.currentStatus === "discovery_scheduled") ? "discovery" : "therapy"}
            onClose={() => setShowAddSession(false)}
            onCreated={() => { setShowAddSession(false); void refreshPatientAndSessions(); showToast("Session scheduled.", "success"); }}
          />
        )}
      </Layout>
    );
  }

  // ── Desktop render ─────────────────────────────────────────────────────────
  return (
    <Layout title={`Patient ${patient.patientNumber}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <Breadcrumb crumbs={[
          { label: "Dashboard", to: "/" },
          { label: "Patients", to: "/patients" },
          { label: patient ? `${patient.name} (${patient.patientNumber})` : "Profile" },
        ]} />
        <button style={s.dangerBtn} onClick={() => setShowDeleteConfirm(true)}>Delete Patient</button>
      </div>

      {/* ── Patient Info ── */}
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: infoOpen ? 18 : 0 }}>
          <button onClick={() => setInfoOpen((o) => !o)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1a2535" }}>Patient Information</span>
            <span style={{ fontSize: 14, color: "#94a3b8", transition: "transform 0.2s", transform: infoOpen ? "rotate(0deg)" : "rotate(-90deg)" }}>›</span>
          </button>
          {!editingInfo
            ? <button style={s.editBtn} onClick={() => setEditingInfo(true)}>Edit</button>
            : <button style={s.editBtn} onClick={() => { setEditingInfo(false); setInfoError(null); }}>Cancel</button>
          }
        </div>
        {infoOpen && (!editingInfo ? (
          <div>
            <div style={s.infoGrid}>
              <InfoRow label="Patient #" value={<span style={{ fontFamily: "monospace", color: "#2d6b5f", fontWeight: 700 }}>{patient.patientNumber}</span>} />
              <InfoRow label="Current Status" value={<PatientStatusBadge status={patient.currentStatus} />} />
              <InfoRow label="Full Name" value={patient.name} />
              <InfoRow label="Mobile" value={patient.mobile} />
              <InfoRow label="Email" value={patient.email} />
              <InfoRow label="Age" value={`${patient.age} yrs`} />
              <InfoRow label="Source" value={patient.source} />
              <InfoRow label="Referred By" value={patient.referredBy} />
              <InfoRow label="Therapist" value={patient.therapist ? `${patient.therapist.name} (${patient.therapist.employeeType})` : null} />
              <InfoRow label="Registered On" value={formatDate(patient.createdAt)} />
            </div>
            {allPatientNotes.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #ede7df" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  Clinical Notes ({allPatientNotes.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {allPatientNotes.slice(0, 3).map((note) => (
                    <div key={note.id} style={{ fontSize: 11, color: "#334155", background: "#fdfbf9", padding: 8, borderRadius: 6, borderLeft: "2px solid #2d6b5f" }}>
                      <p style={{ margin: 0, marginBottom: 4, fontWeight: 500 }}>{note.content.length > 80 ? note.content.substring(0, 80) + "..." : note.content}</p>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>
                        {note.createdByName} · {new Date(note.createdAt).toLocaleDateString("en-IN")}
                      </div>
                    </div>
                  ))}
                  {allPatientNotes.length > 3 && (
                    <div style={{ fontSize: 10, color: "#2d6b5f", fontWeight: 600 }}>
                      +{allPatientNotes.length - 3} more notes
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSaveAll}>
            {infoError && <p style={s.apiError}>{infoError}</p>}
            <div className="form-grid" style={{ marginBottom: 16 }}>
              {[
                { field: "name", label: "Full Name" },
                { field: "mobile", label: "Mobile" },
                { field: "email", label: "Email" },
                { field: "age", label: "Age" },
                { field: "referred_by", label: "Referred By" },
              ].map(({ field, label }) => (
                <div key={field} style={s.fieldCol}>
                  <label style={s.label}>{label}</label>
                  <input
                    style={s.input}
                    value={(infoValues as Record<string, string>)[field]}
                    onChange={(e) => setInfoValues((v) => ({ ...v, [field]: e.target.value }))}
                  />
                </div>
              ))}
              <div style={s.fieldCol}>
                <label style={s.label}>Source</label>
                <select style={s.select} value={infoValues.source} onChange={(e) => setInfoValues((v) => ({ ...v, source: e.target.value }))}>
                  <option value="">—</option>
                  <option value="Patient referral">Patient referral</option>
                  <option value="Doctor referral">Doctor referral</option>
                  <option value="Other referral">Other referral</option>
                  <option value="Events">Events</option>
                </select>
              </div>
              {/* Therapist — inline in same form */}
              <div style={s.fieldCol}>
                <label style={s.label}>Therapist</label>
                <select style={s.select} value={selectedTherapistId} onChange={(e) => setSelectedTherapistId(e.target.value)}>
                  <option value="">No therapist assigned</option>
                  {therapists.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
            {/* Single unified Save CTA */}
            <button type="submit" style={s.updateBtn} disabled={savingInfo}>
              {savingInfo ? "Saving…" : "Save Changes"}
            </button>
          </form>
        ))}
      </div>

      {/* ── Status Action Buttons ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button style={{ ...s.secondaryBtn, flex: 1 }} onClick={() => setShowCurrentStatus(true)}>
          Change Status
        </button>
        <button style={{ ...s.secondaryBtn, flex: 1 }} onClick={() => setShowStatusHistory(true)}>
          View History
        </button>
      </div>

      {/* ── Schedule CTA — context-aware based on patient status ── */}
      {(patient.currentStatus === "created" ||
        patient.currentStatus === "discovery_scheduled" ||
        patient.currentStatus === "discovery_completed" ||
        patient.currentStatus === "started_therapy" ||
        patient.currentStatus === "therapy_paused") && (
        <div style={{ marginBottom: 20 }}>
          <button
            style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: (patient.currentStatus === "created" || patient.currentStatus === "discovery_scheduled") ? "#0369a1" : "#1A7A6E", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            onClick={() => setShowAddSession(true)}
          >
            {patient.currentStatus === "created" ? "📅 Schedule Discovery Call" :
             patient.currentStatus === "discovery_scheduled" ? "📅 Reschedule Discovery Call" :
             "📅 Schedule Session"}
          </button>
        </div>
      )}

      {/* ── Therapy Sessions ── */}
      {sessions.length > 0 && (
        <CollapsibleCard title="Therapy Sessions" storageKey="sessions">
          <SessionsTable
            sessions={sessions}
            showPatient={false}
            onCancel={async (id, reason) => { await cancelSession(id, reason); await refreshPatientAndSessions(); showToast("Session cancelled.", "success"); }}
            onComplete={async (id, charges, notes) => { await completeSession(id, charges, notes); await refreshPatientAndSessions(); showToast("Session completed.", "success"); }}
            onDelete={async (id) => { await deleteSession(id); await refreshSessions(); showToast("Session deleted.", "success"); }}
            onReschedule={handleSessionReschedule}
            onNoShow={handleSessionNoShow}
            onPaymentStatusChange={handleSessionPaymentStatus}
            onNotes={(session) => setNotesSession(session)}
          />
        </CollapsibleCard>
      )}

      {/* ── Change Status Modal ── */}
      {showCurrentStatus && (
        <>
          <div onClick={() => setShowCurrentStatus(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200 }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            background: "#fff", borderRadius: 14, maxWidth: 680, width: "92vw", zIndex: 201,
            padding: "28px 32px", boxShadow: "0 24px 48px rgba(0,0,0,0.18)",
            maxHeight: "90vh", overflowY: "auto",
          }}>
            {/* Modal header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1a2535" }}>Update Patient Status</h2>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                  Current: <strong style={{ color: "#2d6b5f" }}><PatientStatusBadge status={patient.currentStatus} /></strong>
                </p>
              </div>
              <button onClick={() => setShowCurrentStatus(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#94a3b8", padding: "2px 6px" }}>✕</button>
            </div>

            {(() => {
              const validNext = STATUS_TRANSITIONS[patient.currentStatus] ?? [];
              const hint = STATUS_NEXT_ACTION_HINT[patient.currentStatus];
              if (validNext.length === 0) {
                return (
                  <div>
                    {hint && (
                      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 12, color: "#1d4ed8" }}>
                        {hint}
                      </div>
                    )}
                    {!hint && (
                      <div style={{ background: "#f1f5f9", borderRadius: 8, padding: "12px 16px", fontSize: 12, color: "#64748b" }}>
                        This status has no further transitions.
                      </div>
                    )}
                    <button type="button" onClick={() => setShowCurrentStatus(false)} style={{ ...s.secondaryBtn, marginTop: 12 }}>
                      Close
                    </button>
                  </div>
                );
              }
              return (
                <form onSubmit={handleStatusUpdate}>
                  {updateError && <p style={s.apiError}>{updateError}</p>}
                  {hint && (
                    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#1d4ed8" }}>
                      {hint}
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                    <div style={s.fieldCol}>
                      <label style={s.label}>New Status *</label>
                      <select style={{ ...s.select, padding: "10px 12px" }} value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                        <option value="">— Select —</option>
                        {validNext.map((st) => <option key={st} value={st}>{STATUS_LABELS[st]}</option>)}
                      </select>
                      {statusFieldError && <span style={s.fieldErr}>{statusFieldError}</span>}
                    </div>
                    <div style={s.fieldCol}>
                      <label style={s.label}>Changed By *</label>
                      <input
                        style={{ ...s.input, padding: "10px 12px" }}
                        value={changedByName || adminName}
                        onChange={(e) => setChangedByName(e.target.value)}
                        placeholder={adminName}
                      />
                      {nameFieldError && <span style={s.fieldErr}>{nameFieldError}</span>}
                    </div>
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <label style={s.label}>Notes / Reason</label>
                    <textarea
                      style={{ ...s.input, width: "100%", boxSizing: "border-box", minHeight: 120, resize: "vertical", lineHeight: 1.65, marginTop: 4 }}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add context — e.g. patient paused sessions due to travel, restarting in June, referred to psychiatrist, etc."
                    />
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="submit" style={{ ...s.updateBtn, flex: 2, padding: "10px 0", fontSize: 13 }} disabled={updating}>
                      {updating ? "Updating…" : "Update Status"}
                    </button>
                    <button type="button" onClick={() => setShowCurrentStatus(false)} style={{ ...s.secondaryBtn, flex: 1, padding: "10px 0", fontSize: 13 }}>
                      Cancel
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        </>
      )}

      {/* ── Status History Modal ── */}
      <StatusHistoryModal open={showStatusHistory} logs={logs} onClose={() => setShowStatusHistory(false)} />

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Patient"
        message={`Permanently delete ${patient?.name}? All sessions and history will be removed. This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {notesSession && (
        <ClinicalNotesPanel
          sessionId={notesSession.id}
          patientName={notesSession.patient.name}
          sessionDate={notesSession.startTime}
          onClose={() => setNotesSession(null)}
        />
      )}

      {showAddSession && (
        <AddSessionModal
          initialPatientId={patient.id}
          initialSessionType={(patient.currentStatus === "created" || patient.currentStatus === "discovery_scheduled") ? "discovery" : "therapy"}
          onClose={() => setShowAddSession(false)}
          onCreated={() => { setShowAddSession(false); void refreshPatientAndSessions(); showToast("Session scheduled.", "success"); }}
        />
      )}
    </Layout>
  );
}

const s: Record<string, React.CSSProperties> = {
  backBtn: { background: "none", border: "none", color: "#8a96a3", fontSize: 12, cursor: "pointer", padding: 0 },
  editBtn: { padding: "4px 12px", border: "1px solid #ddd5cb", borderRadius: 5, background: "#fff", fontSize: 11, cursor: "pointer", color: "#64748b", fontWeight: 500 },
  dangerBtn: { padding: "5px 14px", border: "1px solid #e53e3e", borderRadius: 6, background: "transparent", color: "#e53e3e", fontSize: 11, cursor: "pointer", fontWeight: 500 },
  card: { background: "#fff", borderRadius: 12, padding: 24, marginBottom: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.05), 0 4px 14px rgba(0,0,0,0.04)", border: "1px solid #ddd5cb" },
  cardTitle: { margin: "0 0 18px", fontSize: 13, fontWeight: 700, color: "#1a2535" },
  infoGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 },
  fieldCol: { display: "flex", flexDirection: "column", gap: 3 },
  label: { fontSize: 10, fontWeight: 600, color: "#64748b" },
  select: { padding: "8px 11px", border: "1px solid #ddd5cb", borderRadius: 6, fontSize: 12, color: "#1a2535", background: "#fdfbf9" },
  input: { padding: "8px 11px", border: "1px solid #ddd5cb", borderRadius: 6, fontSize: 12, color: "#1a2535", outline: "none", background: "#fdfbf9" },
  fieldErr: { fontSize: 11, color: "#b91c1c" },
  apiError: { color: "#b91c1c", background: "#fee2e2", padding: "9px 13px", borderRadius: 6, marginBottom: 14, fontSize: 12 },
  updateBtn: { padding: "8px 20px", border: "none", borderRadius: 6, background: "#2d6b5f", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  secondaryBtn: { padding: "8px 16px", border: "1px solid #ddd5cb", borderRadius: 6, background: "#fff", color: "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  sectionLabel: { margin: "0 0 8px", fontSize: 10, fontWeight: 700, color: "#8a96a3", textTransform: "uppercase" as const, letterSpacing: "0.07em" },
};
