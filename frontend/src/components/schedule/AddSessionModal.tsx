// Modal for scheduling a new therapy session.

import { useState, useEffect } from "react";
import type { Patient, TeamMember, TherapySession } from "../../types/index";
import { listPatients } from "../../api/patients";
import { listTeamMembers } from "../../api/teamMembers";
import { createSession, getTherapistSessions } from "../../api/therapySessions";
import SearchableSelect from "../ui/SearchableSelect";

interface Props {
  onClose: () => void;
  onCreated: () => void;
  initialPatientId?: number;
  initialSessionType?: "therapy" | "discovery";
}

interface FormValues {
  patient_id: string;
  therapist_id: string;
  session_date: string;
  start_time: string;
  duration_mins: string;
  session_type: "therapy" | "discovery";
  notes: string;
}

const EMPTY: FormValues = {
  patient_id: "", therapist_id: "", session_date: "", start_time: "", duration_mins: "50", session_type: "therapy", notes: "",
};

const DURATION_OPTIONS = [
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "50", label: "50 min" },
];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AddSessionModal({ onClose, onCreated, initialPatientId, initialSessionType }: Props) {
  const [form, setForm] = useState<FormValues>({
    ...EMPTY,
    ...(initialSessionType ? { session_type: initialSessionType } : {}),
    ...(initialPatientId ? { patient_id: String(initialPatientId) } : {}),
  });
  const [patients, setPatients] = useState<Patient[]>([]);
  const [therapists, setTherapists] = useState<TeamMember[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof FormValues, boolean>>>({});

  function handleBlur(field: keyof FormValues) {
    setTouched((t) => ({ ...t, [field]: true }));
    // validate only this field on blur
    const errs: Partial<Record<keyof FormValues, string>> = {};
    if (field === "session_date" && !form.session_date) errs.session_date = "Select a date";
    if (field === "start_time" && !form.start_time) errs.start_time = "Enter start time";
    setFieldErrors((e) => ({ ...e, [field]: errs[field] }));
  }

  const [showTherapistSchedule, setShowTherapistSchedule] = useState(false);
  const [therapistSessions, setTherapistSessions] = useState<TherapySession[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  useEffect(() => {
    void Promise.all([
      listPatients({ limit: 500 }).then((r) => setPatients(r.patients)),
      listTeamMembers().then((members) => setTherapists(members.filter((m) => m.isActive))),
    ]);
  }, []);

  // Auto-prefill therapist when a patient with an assigned therapist is selected
  useEffect(() => {
    if (!form.patient_id) return;
    const patient = patients.find((p) => String(p.id) === form.patient_id);
    if (patient?.therapistId && !form.therapist_id) {
      set("therapist_id", String(patient.therapistId));
    }
  }, [form.patient_id, patients]);

  useEffect(() => {
    setShowTherapistSchedule(false);
    setTherapistSessions([]);
  }, [form.therapist_id, form.session_date]);

  function set(field: keyof FormValues, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setFieldErrors((e) => ({ ...e, [field]: undefined }));
    setError(null);
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof FormValues, string>> = {};
    if (!form.patient_id) errs.patient_id = "Select a patient";
    if (!form.therapist_id) errs.therapist_id = "Select a therapist";
    if (!form.session_date) errs.session_date = "Select a date";
    if (!form.start_time) errs.start_time = "Enter start time";
    if (!form.duration_mins || parseInt(form.duration_mins, 10) < 15) errs.duration_mins = "Min 15 minutes";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleViewSchedule() {
    if (!form.therapist_id) return;
    setLoadingSchedule(true);
    setShowTherapistSchedule(true);
    try {
      const sessions = await getTherapistSessions(parseInt(form.therapist_id, 10), form.session_date || undefined);
      setTherapistSessions(sessions);
    } catch {
      setTherapistSessions([]);
    } finally {
      setLoadingSchedule(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createSession({
        patient_id: parseInt(form.patient_id, 10),
        therapist_id: parseInt(form.therapist_id, 10),
        session_date: form.session_date,
        start_time: form.start_time,
        duration_mins: parseInt(form.duration_mins, 10),
        session_type: form.session_type,
        notes: form.notes.trim() || undefined,
      });
      onCreated();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? "Failed to schedule session. Please try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const selectedTherapist = therapists.find((t) => String(t.id) === form.therapist_id);

  // Patients still in the discovery phase (not yet started therapy)
  const DISCOVERY_PHASE_STATUSES = ["created", "discovery_scheduled"];
  const filteredPatients = form.session_type === "discovery"
    ? patients.filter((p) => DISCOVERY_PHASE_STATUSES.includes(p.currentStatus))
    : patients.filter((p) => !DISCOVERY_PHASE_STATUSES.includes(p.currentStatus));

  const patientOptions = filteredPatients.map((p) => ({ value: String(p.id), label: `${p.patientNumber} — ${p.name}` }));
  const therapistOptions = therapists.map((t) => ({ value: String(t.id), label: `${t.name} (${t.employeeType})` }));

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modal} className="modal-card">
        <div style={s.header}>
          <h2 style={s.title}>{form.session_type === "discovery" ? "Schedule Discovery Call" : "Schedule Therapy Session"}</h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {error && <div style={s.errorBanner}>{error}</div>}

          {/* Session type toggle — hidden if locked from parent */}
          {!initialSessionType && (
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              <button
                type="button"
                onClick={() => { set("session_type", "therapy"); set("patient_id", ""); set("therapist_id", ""); }}
                style={{
                  flex: 1, height: 44, borderRadius: 10, border: "1.5px solid",
                  borderColor: form.session_type === "therapy" ? "#3D9E8E" : "#CBD5E1",
                  background: form.session_type === "therapy" ? "#3D9E8E" : "#fff",
                  color: form.session_type === "therapy" ? "#fff" : "#475569",
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                  transition: "background 0.15s ease, color 0.15s ease",
                }}
              >
                Therapy Session
              </button>
              <button
                type="button"
                onClick={() => { set("session_type", "discovery"); set("patient_id", ""); set("therapist_id", ""); }}
                style={{
                  flex: 1, height: 44, borderRadius: 10, border: "1.5px solid",
                  borderColor: form.session_type === "discovery" ? "#7C3AED" : "#CBD5E1",
                  background: form.session_type === "discovery" ? "#7C3AED" : "#fff",
                  color: form.session_type === "discovery" ? "#fff" : "#475569",
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                  transition: "background 0.15s ease, color 0.15s ease",
                }}
              >
                Discovery Call
              </button>
            </div>
          )}

          {form.session_type === "discovery" && (
            <div style={{ background: "#e0f2fe", border: "1px solid #bae6fd", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12, color: "#0369a1" }}>
              Scheduling this will automatically move the patient to <strong>Discovery Scheduled</strong> status.
            </div>
          )}

          <div style={s.formGrid}>
            {/* Patient — locked if pre-filled from patient profile */}
            {!initialPatientId && (
              <Field label="Patient *" error={fieldErrors.patient_id}>
                <SearchableSelect
                  options={patientOptions}
                  value={form.patient_id}
                  onChange={(v) => set("patient_id", v)}
                  placeholder="Select patient…"
                />
              </Field>
            )}

            {/* Therapist — searchable */}
            <Field label="Therapist *" error={fieldErrors.therapist_id}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <SearchableSelect
                  options={therapistOptions}
                  value={form.therapist_id}
                  onChange={(v) => set("therapist_id", v)}
                  placeholder="Select therapist…"
                  style={{ flex: 1 }}
                />
                {form.therapist_id && (
                  <button type="button" style={s.viewBtn} onClick={handleViewSchedule}>
                    View schedule
                  </button>
                )}
              </div>
            </Field>

            {/* Date */}
            <Field label="Date *" error={fieldErrors.session_date}>
              <input
                type="date"
                style={s.input}
                value={form.session_date}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => set("session_date", e.target.value)}
                onBlur={() => handleBlur("session_date")}
              />
            </Field>

            {/* Start time */}
            <Field label="Start Time *" error={fieldErrors.start_time}>
              <input type="time" style={s.input} value={form.start_time} onChange={(e) => set("start_time", e.target.value)} onBlur={() => handleBlur("start_time")} />
            </Field>

            {/* Duration */}
            <Field label="Duration *" error={fieldErrors.duration_mins}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {DURATION_OPTIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    style={{ ...s.durationChip, ...(form.duration_mins === d.value ? s.durationChipActive : {}) }}
                    onClick={() => set("duration_mins", d.value)}
                  >
                    {d.label}
                  </button>
                ))}
                <input
                  type="number"
                  style={{ ...s.input, width: 80 }}
                  min={15}
                  max={480}
                  placeholder="mins"
                  value={form.duration_mins}
                  onChange={(e) => set("duration_mins", e.target.value)}
                />
              </div>
            </Field>

            {/* Notes */}
            <Field label="Notes (optional)" error={undefined}>
              <input style={s.input} placeholder="Session notes…" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>

          {/* Therapist schedule view */}
          {showTherapistSchedule && (
            <div style={s.scheduleBox}>
              <div style={s.scheduleHeader}>
                <strong style={{ color: "#0F172A", fontSize: 12 }}>
                  {selectedTherapist?.name}'s sessions
                  {form.session_date ? ` on ${new Date(form.session_date + "T12:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
                </strong>
                <button type="button" style={s.collapseBtn} onClick={() => setShowTherapistSchedule(false)}>Hide</button>
              </div>
              {loadingSchedule ? (
                <p style={{ color: "#8a96a3", fontSize: 12, margin: 0 }}>Loading…</p>
              ) : therapistSessions.length === 0 ? (
                <p style={{ color: "#8a96a3", fontSize: 12, margin: 0 }}>
                  {form.session_date ? "No sessions on this date. Slot is free." : "No sessions scheduled yet."}
                </p>
              ) : (
                <table style={s.miniTable}>
                  <thead>
                    <tr>
                      {["Patient", "Start", "Duration", "Status"].map((h) => (
                        <th key={h} style={s.miniTh}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {therapistSessions.map((sess) => (
                      <tr key={sess.id}>
                        <td style={s.miniTd}>{sess.patient.name}</td>
                        <td style={s.miniTd}>{fmtTime(sess.startTime)}</td>
                        <td style={s.miniTd}>{sess.durationMins} min</td>
                        <td style={s.miniTd}>
                          <span style={{ fontSize: 11, color: sess.status === "upcoming" ? "#1e6b4a" : "#8a96a3", fontWeight: 600 }}>
                            {sess.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <div style={s.actions}>
            <button type="button" style={s.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" style={s.submitBtn} disabled={submitting}>
              {submitting ? "Scheduling…" : form.session_type === "discovery" ? "Schedule Discovery Call" : "Schedule Session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{label}</label>
      {children}
      {error && <span style={{ fontSize: 11, color: "#b91c1c" }}>{error}</span>}
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0,
  background: "rgba(15, 23, 42, 0.45)",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
  zIndex: 1000,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
};
const modal: React.CSSProperties = {
  background: "#fff", borderRadius: 20, width: "100%", maxWidth: 580,
  maxHeight: "90vh", overflowY: "auto",
  boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  padding: 32,
};
const s: Record<string, React.CSSProperties> = {
  header:           { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  title:            { margin: 0, fontSize: 20, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.01em" },
  closeBtn:         { width: 32, height: 32, borderRadius: "50%", background: "#F1F5F9", border: "none", fontSize: 14, cursor: "pointer", color: "#475569", display: "flex", alignItems: "center", justifyContent: "center" },
  formGrid:         { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 },
  input:            { height: 44, padding: "0 12px", border: "1.5px solid #CBD5E1", borderRadius: 8, fontSize: 14, color: "#0F172A", background: "#FDFBF8", width: "100%", boxSizing: "border-box" as const },
  viewBtn:          { height: 44, padding: "0 14px", border: "1.5px solid #3D9E8E", borderRadius: 8, background: "transparent", color: "#3D9E8E", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" as const, fontWeight: 600, flexShrink: 0 },
  durationChip:     { height: 36, padding: "0 14px", border: "1.5px solid #CBD5E1", borderRadius: 20, fontSize: 13, cursor: "pointer", background: "#fff", color: "#475569", whiteSpace: "nowrap" as const, display: "inline-flex", alignItems: "center" },
  durationChipActive: { background: "#3D9E8E", color: "#fff", borderColor: "#3D9E8E" },
  errorBanner:      { background: "#FEE2E2", color: "#DC2626", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13, border: "1px solid #FECACA" },
  scheduleBox:      { background: "#F7F2EC", border: "1px solid #E8EDF2", borderRadius: 10, padding: 14, marginBottom: 20 },
  scheduleHeader:   { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  collapseBtn:      { background: "none", border: "none", fontSize: 12, color: "#94A3B8", cursor: "pointer", padding: 0 },
  miniTable:        { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  miniTh:           { padding: "4px 8px", textAlign: "left", color: "#94A3B8", fontWeight: 700, fontSize: 11, borderBottom: "1px solid #E8EDF2", textTransform: "uppercase", letterSpacing: "0.08em" },
  miniTd:           { padding: "7px 8px", color: "#0F172A", borderBottom: "1px solid #F1F5F9", fontSize: 12 },
  actions:          { display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 },
  cancelBtn:        { height: 40, padding: "0 20px", border: "1.5px solid #CBD5E1", borderRadius: 8, background: "#fff", fontSize: 14, cursor: "pointer", color: "#475569", fontWeight: 500 },
  submitBtn:        { height: 40, padding: "0 24px", border: "none", borderRadius: 8, background: "#3D9E8E", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" },
};
