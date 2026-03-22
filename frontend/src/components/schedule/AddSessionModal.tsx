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
}

interface FormValues {
  patient_id: string;
  therapist_id: string;
  session_date: string;
  start_time: string;
  duration_mins: string;
  notes: string;
}

const EMPTY: FormValues = {
  patient_id: "", therapist_id: "", session_date: "", start_time: "", duration_mins: "50", notes: "",
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

export default function AddSessionModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState<FormValues>(EMPTY);
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

  const patientOptions = patients.map((p) => ({ value: String(p.id), label: `${p.patientNumber} — ${p.name}` }));
  const therapistOptions = therapists.map((t) => ({ value: String(t.id), label: `${t.name} (${t.employeeType})` }));

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modal} className="modal-card">
        <div style={s.header}>
          <h2 style={s.title}>Schedule Therapy Session</h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {error && <div style={s.errorBanner}>{error}</div>}

          <div style={s.formGrid}>
            {/* Patient — searchable */}
            <Field label="Patient *" error={fieldErrors.patient_id}>
              <SearchableSelect
                options={patientOptions}
                value={form.patient_id}
                onChange={(v) => set("patient_id", v)}
                placeholder="Select patient…"
              />
            </Field>

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
                <strong style={{ color: "#1a2535", fontSize: 12 }}>
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
              {submitting ? "Scheduling…" : "Schedule Session"}
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
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
};
const modal: React.CSSProperties = {
  background: "#fff", borderRadius: 14, width: "100%", maxWidth: 640,
  maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  padding: 28,
};
const s: Record<string, React.CSSProperties> = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 },
  title: { margin: 0, fontSize: 15, fontWeight: 700, color: "#1a2535" },
  closeBtn: { background: "none", border: "none", fontSize: 16, cursor: "pointer", color: "#8a96a3", lineHeight: 1 },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 },
  input: { padding: "8px 11px", border: "1px solid #ddd5cb", borderRadius: 6, fontSize: 12, color: "#1a2535", background: "#fdfbf9", width: "100%", boxSizing: "border-box" as const },
  viewBtn: { padding: "8px 11px", border: "1px solid #2d6b5f", borderRadius: 6, background: "transparent", color: "#2d6b5f", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", fontWeight: 500, flexShrink: 0 },
  durationChip: { padding: "4px 10px", border: "1px solid #ddd5cb", borderRadius: 20, fontSize: 11, cursor: "pointer", background: "#fff", color: "#64748b", whiteSpace: "nowrap" as const },
  durationChipActive: { background: "#2d6b5f", color: "#fff", borderColor: "#2d6b5f" },
  errorBanner: { background: "#fee2e2", color: "#b91c1c", padding: "9px 13px", borderRadius: 6, marginBottom: 14, fontSize: 12 },
  scheduleBox: { background: "#f7f2ec", border: "1px solid #ddd5cb", borderRadius: 8, padding: 12, marginBottom: 18 },
  scheduleHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  collapseBtn: { background: "none", border: "none", fontSize: 11, color: "#8a96a3", cursor: "pointer", padding: 0 },
  miniTable: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  miniTh: { padding: "4px 8px", textAlign: "left", color: "#8a96a3", fontWeight: 700, fontSize: 10, borderBottom: "1px solid #ede7df", textTransform: "uppercase", letterSpacing: "0.06em" },
  miniTd: { padding: "6px 8px", color: "#1a2535", borderBottom: "1px solid #f5f0ea", fontSize: 12 },
  actions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 },
  cancelBtn: { padding: "8px 18px", border: "1px solid #ddd5cb", borderRadius: 6, background: "#fff", fontSize: 12, cursor: "pointer", color: "#64748b" },
  submitBtn: { padding: "8px 20px", border: "none", borderRadius: 6, background: "#2d6b5f", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" },
};
