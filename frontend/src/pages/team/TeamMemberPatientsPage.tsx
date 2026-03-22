// Shows all patients assigned to a specific team member.

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import Breadcrumb from "../../components/ui/Breadcrumb";
import PatientStatusBadge from "../../components/patients/PatientStatusBadge";
import Spinner from "../../components/ui/Spinner";
import type { Patient, TeamMember, TherapySession } from "../../types/index";
import { getTeamMember, getTeamMemberPatients } from "../../api/teamMembers";
import { listSessions, cancelSession, completeSession, deleteSession, rescheduleSession, markNoShow, updatePaymentStatus } from "../../api/therapySessions";
import SessionsTable from "../../components/schedule/SessionsTable";
import AvailabilityManager from "../../components/team/AvailabilityManager";
import { useToast } from "../../components/ui/Toast";
import type { PaymentStatus } from "../../types/index";

const TYPE_LABELS: Record<string, string> = {
  psychologist: "Psychologist",
  psychiatrist: "Psychiatrist",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TeamMemberPatientsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const memberId = parseInt(id ?? "", 10);
  const { showToast } = useToast();

  const [member, setMember] = useState<TeamMember | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [sessions, setSessions] = useState<TherapySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNaN(memberId)) { setError("Invalid team member ID."); setLoading(false); return; }
    void (async () => {
      try {
        const [m, p, sessResult] = await Promise.all([
          getTeamMember(memberId),
          getTeamMemberPatients(memberId),
          listSessions({ therapist_id: memberId, limit: 200 }),
        ]);
        setMember(m);
        setPatients(p);
        setSessions(sessResult.sessions);
      } catch {
        setError("Failed to load data. Please try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [memberId]);

  if (error) {
    return (
      <Layout title="Team Member Patients">
        <p style={{ color: "#c53030" }}>{error}</p>
        <button style={s.backBtn} onClick={() => navigate("/team")}>← Back to Team</button>
      </Layout>
    );
  }

  return (
    <Layout title={member ? `${member.name}'s Patients` : "Patients"}>
      <Breadcrumb crumbs={[
        { label: "Dashboard", to: "/" },
        { label: "Team", to: "/team" },
        { label: member ? `${member.name}'s Patients` : "Patients" },
      ]} />

      {member && (
        <div style={s.memberCard}>
          <div>
            <span style={s.mono}>{member.employeeCode}</span>
            <span style={s.name}>{member.name}</span>
          </div>
          <span style={s.type}>{TYPE_LABELS[member.employeeType] ?? member.employeeType}</span>
        </div>
      )}

      {loading ? (
        <p style={s.muted}><Spinner /></p>
      ) : patients.length === 0 ? (
        <p style={{ ...s.muted, textAlign: "center", padding: 40 }}>No patients assigned to this therapist yet.</p>
      ) : (
        <div className="table-scroll">
          <table style={s.table}>
            <thead>
              <tr style={s.headRow}>
                {["Patient #", "Name", "Mobile", "Age", "Source", "Status", "Registered On"].map((h) => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr
                  key={p.id}
                  style={{ ...s.row, cursor: "pointer" }}
                  onClick={() => navigate(`/patients/${p.id}`)}
                >
                  <td style={s.td}><span style={s.patientMono}>{p.patientNumber}</span></td>
                  <td style={{ ...s.td, fontWeight: 500, color: "#1a2535" }}>{p.name}</td>
                  <td style={s.td}>{p.mobile}</td>
                  <td style={s.td}>{p.age} yrs</td>
                  <td style={s.td}>{p.source ?? <span style={{ color: "#a0aec0" }}>—</span>}</td>
                  <td style={s.td}><PatientStatusBadge status={p.currentStatus} /></td>
                  <td style={s.td}>{formatDate(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && (
        <p style={{ ...s.muted, marginTop: 16 }}>
          {patients.length} patient{patients.length !== 1 ? "s" : ""} assigned
        </p>
      )}

      {/* ── Availability ── */}
      {!loading && member && (
        <>
          <h3 style={s.sectionHeading}>Availability & Schedule</h3>
          <div style={{ background: "#fff", borderRadius: 10, padding: "18px 20px", marginBottom: 20, border: "1px solid #ddd5cb", boxShadow: "0 1px 2px rgba(0,0,0,0.05), 0 4px 14px rgba(0,0,0,0.04)" }}>
            <AvailabilityManager therapistId={member.id} />
          </div>
        </>
      )}

      {/* ── Sessions ── */}
      {!loading && sessions.length > 0 && (
        <>
          <h3 style={s.sectionHeading}>Therapy Sessions</h3>
          <SessionsTable
            sessions={sessions}
            showTherapist={false}
            onCancel={async (sid, reason) => { await cancelSession(sid, reason); const r = await listSessions({ therapist_id: memberId, limit: 200 }); setSessions(r.sessions); showToast("Session cancelled.", "success"); }}
            onComplete={async (sid, charges) => { await completeSession(sid, charges); const r = await listSessions({ therapist_id: memberId, limit: 200 }); setSessions(r.sessions); showToast("Session completed.", "success"); }}
            onDelete={async (sid) => { await deleteSession(sid); const r = await listSessions({ therapist_id: memberId, limit: 200 }); setSessions(r.sessions); showToast("Session deleted.", "success"); }}
            onReschedule={async (sid, payload) => { await rescheduleSession(sid, payload); const r = await listSessions({ therapist_id: memberId, limit: 200 }); setSessions(r.sessions); showToast("Session rescheduled.", "success"); }}
            onNoShow={async (sid, fee) => { await markNoShow(sid, fee); const r = await listSessions({ therapist_id: memberId, limit: 200 }); setSessions(r.sessions); showToast("Session marked as no-show.", "success"); }}
            onPaymentStatusChange={async (sid, status, name) => { await updatePaymentStatus(sid, status, name); const r = await listSessions({ therapist_id: memberId, limit: 200 }); setSessions(r.sessions); showToast("Payment status updated.", "success"); }}
          />
        </>
      )}
    </Layout>
  );
}

const s: Record<string, React.CSSProperties> = {
  backBtn: { background: "none", border: "none", color: "#8a96a3", fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 18 },
  memberCard: { background: "#fff", borderRadius: 10, padding: "14px 18px", marginBottom: 20, border: "1px solid #ddd5cb", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 1px 2px rgba(0,0,0,0.05), 0 4px 14px rgba(0,0,0,0.04)" },
  mono: { fontFamily: "monospace", fontSize: 12, color: "#2d6b5f", fontWeight: 700, marginRight: 10 },
  name: { fontSize: 13, fontWeight: 600, color: "#1a2535" },
  type: { fontSize: 11, color: "#8a96a3", background: "#f5f0ea", padding: "3px 10px", borderRadius: 10 },
  muted: { color: "#8a96a3", fontSize: 12 },
  table: { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.05), 0 4px 14px rgba(0,0,0,0.04)" },
  headRow: { background: "#f7f2ec" },
  th: { padding: "9px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#8a96a3", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid #ede7df" },
  row: { borderBottom: "1px solid #f5f0ea" },
  td: { padding: "10px 14px", fontSize: 12, color: "#3d4f60" },
  patientMono: { fontFamily: "monospace", fontSize: 12, color: "#2d6b5f", fontWeight: 700 },
  sectionHeading: { margin: "24px 0 10px", fontSize: 13, fontWeight: 700, color: "#1a2535" },
  sectionLabel: { margin: "0 0 8px", fontSize: 10, fontWeight: 700, color: "#8a96a3", textTransform: "uppercase" as const, letterSpacing: "0.07em" },
};
