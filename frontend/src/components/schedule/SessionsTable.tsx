// Reusable table for listing therapy sessions with cancel, complete, delete, reschedule, no-show, and payment actions.

import { useState } from "react";
import { Link } from "react-router-dom";
import type { TherapySession, PaymentStatus } from "../../types/index";
import ConfirmDialog from "../ui/ConfirmDialog";
import SessionActionsDropdown from "./SessionActionsDropdown";

interface Props {
  sessions: TherapySession[];
  showPatient?: boolean;
  showTherapist?: boolean;
  onCancel?: (id: number, reason: string) => void;
  onComplete?: (id: number, charges?: number, notes?: string) => void;
  onDelete?: (id: number) => void;
  onReschedule?: (id: number, payload: { session_date: string; start_time: string; duration_mins: number; notes?: string }) => void;
  onNoShow?: (id: number, no_show_fee?: number) => void;
  onPaymentStatusChange?: (id: number, payment_status: PaymentStatus, changed_by_name: string) => void;
  onNotes?: (session: TherapySession) => void;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDuration(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function fmtCharges(amount: number) {
  return `\u20B9${amount.toLocaleString("en-IN")}`;
}

const STATUS_ICON: Record<string, string> = {
  upcoming: "\u25CF",
  completed: "\u2713",
  cancelled: "\u2715",
  no_show: "\u2298",
  rescheduled: "\u21BB",
};

const STATUS_BADGE: Record<string, React.CSSProperties> = {
  upcoming:    { background: "#d4ede5", color: "#1e6b4a" },
  completed:   { background: "#edf0f4", color: "#64748b" },
  cancelled:   { background: "#fee2e2", color: "#b91c1c" },
  no_show:     { background: "#fef3c7", color: "#92400e" },
  rescheduled: { background: "#e0e7ff", color: "#3730a3" },
};

const PAYMENT_BADGE: Record<string, React.CSSProperties> = {
  paid:    { background: "#d4ede5", color: "#1e6b4a" },
  partial: { background: "#fef3c7", color: "#92400e" },
  unpaid:  { background: "#fee2e2", color: "#b91c1c" },
};

const PAYMENT_CYCLE: PaymentStatus[] = ["unpaid", "partial", "paid"];

function nextPaymentStatus(current: PaymentStatus): PaymentStatus {
  const idx = PAYMENT_CYCLE.indexOf(current);
  return PAYMENT_CYCLE[(idx + 1) % PAYMENT_CYCLE.length];
}

export default function SessionsTable({
  sessions, showPatient = true, showTherapist = true,
  onCancel, onComplete, onDelete, onReschedule, onNoShow, onPaymentStatusChange, onNotes,
}: Props) {
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");

  const [completeId, setCompleteId] = useState<number | null>(null);
  const [chargesInput, setChargesInput] = useState("");
  const [chargesError, setChargesError] = useState("");
  const [discoveryNotes, setDiscoveryNotes] = useState("");
  const [discoveryNotesError, setDiscoveryNotesError] = useState("");

  const [rescheduleId, setRescheduleId] = useState<number | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleDuration, setRescheduleDuration] = useState("60");
  const [rescheduleNotes, setRescheduleNotes] = useState("");
  const [rescheduleError, setRescheduleError] = useState("");

  const [noShowId, setNoShowId] = useState<number | null>(null);
  const [noShowFeeInput, setNoShowFeeInput] = useState("");
  const [noShowError, setNoShowError] = useState("");

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [paymentNameId, setPaymentNameId] = useState<number | null>(null);
  const [paymentNextStatus, setPaymentNextStatus] = useState<PaymentStatus>("unpaid");
  const [paymentName, setPaymentName] = useState("");
  const [paymentNameError, setPaymentNameError] = useState("");

  if (sessions.length === 0) {
    return <p style={{ color: "#8a96a3", fontSize: 12, padding: "24px 0", textAlign: "center" }}>No sessions found.</p>;
  }

  function submitCancel() {
    if (!cancelReason.trim()) { setCancelError("Please enter a reason."); return; }
    if (cancelId !== null && onCancel) onCancel(cancelId, cancelReason.trim());
    setCancelId(null); setCancelReason(""); setCancelError("");
  }

  function submitComplete() {
    if (completeId === null || !onComplete) return;
    const completingSess = sessions.find((s) => s.id === completeId);
    if (completingSess?.sessionType === "discovery") {
      if (!discoveryNotes.trim()) { setDiscoveryNotesError("Notes are required to complete a discovery call."); return; }
      onComplete(completeId, undefined, discoveryNotes.trim());
      setCompleteId(null); setDiscoveryNotes(""); setDiscoveryNotesError("");
    } else {
      const trimmed = chargesInput.trim();
      if (trimmed !== "" && (isNaN(Number(trimmed)) || Number(trimmed) < 0)) {
        setChargesError("Enter a valid positive amount or leave blank.");
        return;
      }
      const charges = trimmed !== "" ? Number(trimmed) : undefined;
      onComplete(completeId, charges);
      setCompleteId(null); setChargesInput(""); setChargesError("");
    }
  }

  function submitReschedule() {
    if (!rescheduleDate) { setRescheduleError("Please select a date."); return; }
    if (!rescheduleTime) { setRescheduleError("Please select a time."); return; }
    const dur = parseInt(rescheduleDuration, 10);
    if (isNaN(dur) || dur <= 0) { setRescheduleError("Enter a valid duration."); return; }
    if (rescheduleId !== null && onReschedule) {
      onReschedule(rescheduleId, {
        session_date: rescheduleDate,
        start_time: rescheduleTime,
        duration_mins: dur,
        notes: rescheduleNotes.trim() || undefined,
      });
    }
    setRescheduleId(null); setRescheduleDate(""); setRescheduleTime(""); setRescheduleDuration("60"); setRescheduleNotes(""); setRescheduleError("");
  }

  function submitNoShow() {
    const trimmed = noShowFeeInput.trim();
    if (trimmed !== "" && (isNaN(Number(trimmed)) || Number(trimmed) < 0)) {
      setNoShowError("Enter a valid positive amount or leave blank.");
      return;
    }
    const fee = trimmed !== "" ? Number(trimmed) : undefined;
    if (noShowId !== null && onNoShow) onNoShow(noShowId, fee);
    setNoShowId(null); setNoShowFeeInput(""); setNoShowError("");
  }

  function submitPaymentChange() {
    if (!paymentName.trim()) { setPaymentNameError("Your name is required."); return; }
    if (paymentNameId !== null && onPaymentStatusChange) {
      onPaymentStatusChange(paymentNameId, paymentNextStatus, paymentName.trim());
    }
    setPaymentNameId(null); setPaymentName(""); setPaymentNameError("");
  }

  function handlePaymentClick(sess: TherapySession) {
    if (!onPaymentStatusChange) return;
    const next = nextPaymentStatus(sess.paymentStatus ?? "unpaid");
    setPaymentNameId(sess.id);
    setPaymentNextStatus(next);
    setPaymentName("");
    setPaymentNameError("");
  }

  const hasActions = onCancel || onComplete || onDelete || onReschedule || onNoShow || onNotes;

  return (
    <>
      <div className="table-scroll">
        <table style={s.table}>
          <thead>
            <tr style={s.headRow}>
              {showPatient && <th style={s.th}>Patient</th>}
              {showTherapist && <th style={s.th}>Therapist</th>}
              <th style={s.th}>Date</th>
              <th style={s.th}>Start</th>
              <th style={s.th}>Duration</th>
              <th style={s.th}>End</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>Charges</th>
              <th style={s.th}>Payment</th>
              <th style={s.th}>Notes</th>
              {hasActions && <th style={s.th}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {sessions.map((sess) => {
              const statusKey = sess.status ?? "upcoming";
              const paymentKey = sess.paymentStatus ?? "unpaid";
              return (
                <tr key={sess.id} style={s.row}>
                  {showPatient && (
                    <td style={s.td}>
                      <Link to={`/patients/${sess.patientId}`} style={{ color: "#1A7A6E", fontWeight: 600, fontSize: 12, textDecoration: "none" }}>
                        {sess.patient.name}
                      </Link>
                      <span style={s.sub}>{sess.patient.patientNumber}</span>
                      {sess.sessionType === "discovery" && (
                        <span style={{ fontSize: 10, fontWeight: 700, background: "#dbeafe", color: "#1d4ed8", borderRadius: 4, padding: "1px 5px", marginLeft: 4 }}>Discovery</span>
                      )}
                    </td>
                  )}
                  {showTherapist && (
                    <td style={s.td}>
                      <span style={s.name}>{sess.therapist.name}</span>
                      <span style={s.sub}>{sess.therapist.employeeType}</span>
                    </td>
                  )}
                  <td style={s.td}>{fmtDate(sess.startTime)}</td>
                  <td style={s.td}>{fmtTime(sess.startTime)}</td>
                  <td style={s.td}>{fmtDuration(sess.durationMins)}</td>
                  <td style={s.td}>{fmtTime(sess.endTime)}</td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, ...(STATUS_BADGE[statusKey] ?? STATUS_BADGE.completed) }}>
                      {STATUS_ICON[statusKey] ?? ""} {statusKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                    {sess.sessionType === "discovery" && (
                      <span style={{ display: "block", marginTop: 3, fontSize: 10, fontWeight: 700, background: "#dbeafe", color: "#1d4ed8", borderRadius: 4, padding: "1px 5px", width: "fit-content" }}>Discovery</span>
                    )}
                  </td>
                  <td style={s.td}>
                    {sess.charges !== null && sess.charges !== undefined
                      ? <span style={{ color: "#1e6b4a", fontWeight: 600 }}>{fmtCharges(sess.charges)}</span>
                      : sess.noShowFee !== null && sess.noShowFee !== undefined
                      ? <span style={{ color: "#92400e", fontWeight: 600 }}>{fmtCharges(sess.noShowFee)} <span style={{ fontSize: 10, fontWeight: 400 }}>(fee)</span></span>
                      : <span style={{ color: "#b8c4cc" }}>{"\u2014"}</span>}
                  </td>
                  <td style={s.td}>
                    {onPaymentStatusChange && (sess.status === "completed" || sess.status === "no_show") ? (
                      <span
                        style={{ ...s.badge, ...(PAYMENT_BADGE[paymentKey] ?? PAYMENT_BADGE.unpaid), cursor: "pointer" }}
                        onClick={() => handlePaymentClick(sess)}
                        title="Click to change payment status"
                      >
                        {paymentKey.charAt(0).toUpperCase() + paymentKey.slice(1)}
                      </span>
                    ) : (
                      <span style={{ ...s.badge, ...(PAYMENT_BADGE[paymentKey] ?? PAYMENT_BADGE.unpaid) }}>
                        {paymentKey.charAt(0).toUpperCase() + paymentKey.slice(1)}
                      </span>
                    )}
                  </td>
                  <td style={{ ...s.td, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sess.cancelReason
                      ? <span style={{ color: "#b91c1c", fontSize: 11 }}>{"\u2715"} {sess.cancelReason}</span>
                      : sess.notes
                      ? sess.notes
                      : <span style={{ color: "#b8c4cc" }}>{"\u2014"}</span>}
                  </td>
                  {hasActions && (
                    <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                      <SessionActionsDropdown
                        session={sess}
                        onComplete={onComplete ? (id) => { setCompleteId(id); setChargesInput(""); setChargesError(""); } : undefined}
                        onReschedule={onReschedule ? (id) => { setRescheduleId(id); setRescheduleDate(""); setRescheduleTime(""); setRescheduleDuration("60"); setRescheduleNotes(""); setRescheduleError(""); } : undefined}
                        onNoShow={onNoShow ? (id) => { setNoShowId(id); setNoShowFeeInput(""); setNoShowError(""); } : undefined}
                        onCancel={onCancel ? (id) => { setCancelId(id); setCancelReason(""); setCancelError(""); } : undefined}
                        onDelete={onDelete ? (id) => setDeleteConfirmId(id) : undefined}
                        onNotes={onNotes}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Complete modal — discovery: mandatory notes; therapy: optional charges */}
      {completeId !== null && (() => {
        const completingSess = sessions.find((s) => s.id === completeId);
        const isDiscovery = completingSess?.sessionType === "discovery";
        return (
          <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) { setCompleteId(null); setDiscoveryNotes(""); setDiscoveryNotesError(""); setChargesInput(""); setChargesError(""); } }}>
            <div style={modalCard} className="modal-card">
              <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: "#1a2535" }}>
                {isDiscovery ? "Complete Discovery Call" : "Complete Session"}
              </h3>
              {isDiscovery ? (
                <>
                  <p style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                    Add notes from the discovery call before marking as completed.
                  </p>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>
                    Discovery Notes *
                  </label>
                  <textarea
                    style={{ ...s.chargesInput, minHeight: 100, resize: "vertical", padding: "8px 10px" }}
                    placeholder="Summary of discovery call, observations, next steps…"
                    value={discoveryNotes}
                    onChange={(e) => { setDiscoveryNotes(e.target.value); setDiscoveryNotesError(""); }}
                    autoFocus
                  />
                  {discoveryNotesError && <p style={{ fontSize: 11, color: "#b91c1c", margin: "4px 0 0" }}>{discoveryNotesError}</p>}
                </>
              ) : (
                <>
                  <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
                    Optionally record the session charges in {"\u20B9"} before marking as completed.
                  </p>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>
                    Session Charges ({"\u20B9"})
                  </label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#8a96a3", fontSize: 13, fontWeight: 600 }}>{"\u20B9"}</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      style={{ ...s.chargesInput, paddingLeft: 24 }}
                      placeholder="e.g. 1500"
                      value={chargesInput}
                      onChange={(e) => { setChargesInput(e.target.value); setChargesError(""); }}
                      autoFocus
                    />
                  </div>
                  {chargesError && <p style={{ fontSize: 11, color: "#b91c1c", margin: "4px 0 0" }}>{chargesError}</p>}
                </>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
                <button style={s.modalCancelBtn} onClick={() => { setCompleteId(null); setDiscoveryNotes(""); setDiscoveryNotesError(""); setChargesInput(""); setChargesError(""); }}>Back</button>
                <button style={s.modalCompleteBtn} onClick={submitComplete}>Mark Completed</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Cancel reason modal */}
      {cancelId !== null && (
        <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) setCancelId(null); }}>
          <div style={modalCard} className="modal-card">
            <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "#1a2535" }}>
              Cancel Session
            </h3>
            <p style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>
              Please provide a reason for cancellation.
            </p>
            <textarea
              style={s.reasonInput}
              placeholder="Enter cancellation reason..."
              value={cancelReason}
              rows={3}
              onChange={(e) => { setCancelReason(e.target.value); setCancelError(""); }}
            />
            {cancelError && <p style={{ fontSize: 11, color: "#b91c1c", margin: "4px 0 0" }}>{cancelError}</p>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button style={s.modalCancelBtn} onClick={() => setCancelId(null)}>Back</button>
              <button style={s.modalConfirmBtn} onClick={submitCancel}>Confirm Cancellation</button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule modal */}
      {rescheduleId !== null && (
        <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) setRescheduleId(null); }}>
          <div style={modalCard} className="modal-card">
            <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: "#1a2535" }}>
              Reschedule Session
            </h3>
            <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
              Pick a new date, time, and duration for this session.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>New Date *</label>
                <input type="date" style={s.chargesInput} value={rescheduleDate} onChange={(e) => { setRescheduleDate(e.target.value); setRescheduleError(""); }} autoFocus />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>New Start Time *</label>
                <input type="time" style={s.chargesInput} value={rescheduleTime} onChange={(e) => { setRescheduleTime(e.target.value); setRescheduleError(""); }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Duration (mins)</label>
                <input type="number" min={15} step={15} style={s.chargesInput} value={rescheduleDuration} onChange={(e) => { setRescheduleDuration(e.target.value); setRescheduleError(""); }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Notes (optional)</label>
                <input style={s.chargesInput} value={rescheduleNotes} onChange={(e) => setRescheduleNotes(e.target.value)} placeholder="Reason for rescheduling..." />
              </div>
            </div>
            {rescheduleError && <p style={{ fontSize: 11, color: "#b91c1c", margin: "4px 0 0" }}>{rescheduleError}</p>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
              <button style={s.modalCancelBtn} onClick={() => setRescheduleId(null)}>Back</button>
              <button style={s.modalRescheduleBtn} onClick={submitReschedule}>Confirm Reschedule</button>
            </div>
          </div>
        </div>
      )}

      {/* No-show modal */}
      {noShowId !== null && (
        <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) setNoShowId(null); }}>
          <div style={modalCard} className="modal-card">
            <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: "#1a2535" }}>
              Mark as No Show
            </h3>
            <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
              Optionally record a no-show fee in {"\u20B9"}.
            </p>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>
              No-Show Fee ({"\u20B9"})
            </label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#8a96a3", fontSize: 13, fontWeight: 600 }}>{"\u20B9"}</span>
              <input
                type="number"
                min={0}
                step={1}
                style={{ ...s.chargesInput, paddingLeft: 24 }}
                placeholder="e.g. 500"
                value={noShowFeeInput}
                onChange={(e) => { setNoShowFeeInput(e.target.value); setNoShowError(""); }}
                autoFocus
              />
            </div>
            {noShowError && <p style={{ fontSize: 11, color: "#b91c1c", margin: "4px 0 0" }}>{noShowError}</p>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
              <button style={s.modalCancelBtn} onClick={() => setNoShowId(null)}>Back</button>
              <button style={s.modalNoShowBtn} onClick={submitNoShow}>Mark No Show</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteConfirmId !== null}
        title="Delete Session"
        message="This will permanently delete the session and cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => { if (deleteConfirmId !== null && onDelete) { onDelete(deleteConfirmId); setDeleteConfirmId(null); } }}
        onCancel={() => setDeleteConfirmId(null)}
      />

      {/* Payment status change — name prompt */}
      {paymentNameId !== null && (
        <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) setPaymentNameId(null); }}>
          <div style={modalCard} className="modal-card">
            <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: "#1a2535" }}>
              Update Payment Status
            </h3>
            <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
              Changing payment status to <strong>{paymentNextStatus}</strong>. Enter your name to confirm.
            </p>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>
              Changed By *
            </label>
            <input
              style={s.chargesInput}
              placeholder="Your name"
              value={paymentName}
              onChange={(e) => { setPaymentName(e.target.value); setPaymentNameError(""); }}
              autoFocus
            />
            {paymentNameError && <p style={{ fontSize: 11, color: "#b91c1c", margin: "4px 0 0" }}>{paymentNameError}</p>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
              <button style={s.modalCancelBtn} onClick={() => setPaymentNameId(null)}>Back</button>
              <button style={s.modalCompleteBtn} onClick={submitPaymentChange}>Update Payment</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
};
const modalCard: React.CSSProperties = {
  background: "#fff", borderRadius: 12, width: "100%", maxWidth: 420,
  boxShadow: "0 20px 60px rgba(0,0,0,0.25)", padding: 24,
};
const s: Record<string, React.CSSProperties> = {
  table: { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.05), 0 4px 14px rgba(0,0,0,0.04)" },
  headRow: { background: "#f7f2ec" },
  th: { padding: "9px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#8a96a3", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid #ede7df" },
  row: { borderBottom: "1px solid #f5f0ea" },
  td: { padding: "10px 14px", fontSize: 12, color: "#3d4f60", verticalAlign: "middle" },
  name: { display: "block", fontWeight: 500, color: "#1a2535" },
  sub: { display: "block", fontSize: 10, color: "#b8c4cc", marginTop: 1 },
  badge: { padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" },
  chargesInput: { width: "100%", padding: "8px 11px", border: "1px solid #ddd5cb", borderRadius: 6, fontSize: 13, color: "#1a2535", background: "#fdfbf9", boxSizing: "border-box" as const, outline: "none" },
  reasonInput: { width: "100%", padding: "8px 11px", border: "1px solid #ddd5cb", borderRadius: 6, fontSize: 12, color: "#1a2535", background: "#fdfbf9", resize: "vertical" as const, boxSizing: "border-box" as const, outline: "none" },
  modalCancelBtn: { padding: "7px 16px", border: "1px solid #ddd5cb", borderRadius: 6, background: "#fff", fontSize: 12, cursor: "pointer", color: "#64748b" },
  modalConfirmBtn: { padding: "7px 16px", border: "none", borderRadius: 6, background: "#e53e3e", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  modalCompleteBtn: { padding: "7px 16px", border: "none", borderRadius: 6, background: "#2d6b5f", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  modalRescheduleBtn: { padding: "7px 16px", border: "none", borderRadius: 6, background: "#3730a3", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  modalNoShowBtn: { padding: "7px 16px", border: "none", borderRadius: 6, background: "#92400e", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" },
};
