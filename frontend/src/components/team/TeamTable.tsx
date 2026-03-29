// Team member list table — avatar/initials column, ConfirmDialog, updated styles.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { TeamMember } from "../../types/index";
import ConfirmDialog from "../ui/ConfirmDialog";

interface Props {
  members: TeamMember[];
  onDelete?: (id: number) => void;
}

const TYPE_LABELS: Record<string, string> = {
  psychologist: "Psychologist",
  psychiatrist: "Psychiatrist",
};

function roleAvatarColor(employeeType: string): { bg: string; color: string } {
  if (employeeType === "psychologist") return { bg: "#EEF9F7", color: "#3D9E8E" };
  if (employeeType === "psychiatrist") return { bg: "#EEF2FF", color: "#6366F1" };
  return { bg: "#F1F5F9", color: "#64748B" };
}

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function TeamRow({ m, onDelete }: { m: TeamMember; onDelete?: (id: number) => void }) {
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);
  const avatar = roleAvatarColor(m.employeeType);

  return (
    <>
      <tr style={s.row}>
        {/* Avatar */}
        <td style={{ ...s.td, width: 48 }}>
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            background: avatar.bg, color: avatar.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700, flexShrink: 0,
          }}>
            {initials(m.name)}
          </div>
        </td>
        <td style={{ ...s.td, fontWeight: 600, color: "#0F172A" }}>
          <div>{m.name}</div>
          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{m.employeeCode}</div>
        </td>
        <td style={s.td}>{TYPE_LABELS[m.employeeType] ?? m.employeeType}</td>
        <td style={s.td}>
          <span style={{ ...s.badge, ...(m.isActive ? s.active : s.inactive) }}>
            {m.isActive ? "Active" : "Inactive"}
          </span>
        </td>
        <td style={s.td}>
          <button style={s.patientsBtn} onClick={() => navigate(`/team/${m.id}/patients`)}>
            View Patients
          </button>
        </td>
        <td style={{ ...s.td, whiteSpace: "nowrap" }}>
          {onDelete && (
            <button style={s.deleteBtn} onClick={() => setShowConfirm(true)}>
              Delete
            </button>
          )}
        </td>
      </tr>

      <ConfirmDialog
        open={showConfirm}
        title="Delete Team Member"
        message={`Are you sure you want to delete "${m.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => { onDelete?.(m.id); setShowConfirm(false); }}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}

export default function TeamTable({ members, onDelete }: Props) {
  if (members.length === 0) {
    return <p style={{ color: "#94A3B8", fontSize: 13, padding: "40px 0", textAlign: "center" }}>No team members found.</p>;
  }

  return (
    <div className="table-scroll">
      <table style={s.table}>
        <thead>
          <tr style={s.headRow}>
            {["", "Name", "Employee Type", "Status", "Patients", "Actions"].map((h, i) => (
              <th key={i} style={s.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <TeamRow key={m.id} m={m} onDelete={onDelete} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  table:      { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)", border: "1px solid #E8EDF2" },
  headRow:    { background: "#FDFBF8" },
  th:         { padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid #E8EDF2" },
  row:        { borderBottom: "1px solid #F1F5F9", transition: "background 0.1s ease" },
  td:         { padding: "12px 14px", fontSize: 13, color: "#475569" },
  badge:      { display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 },
  active:     { background: "#DCFCE7", color: "#16A34A" },
  inactive:   { background: "#F1F5F9", color: "#94A3B8" },
  patientsBtn: { padding: "5px 13px", border: "1.5px solid #3D9E8E", borderRadius: 7, background: "transparent", color: "#3D9E8E", fontSize: 12, cursor: "pointer", fontWeight: 600, marginRight: 6 },
  deleteBtn:   { padding: "5px 13px", border: "1.5px solid #DC2626", borderRadius: 7, background: "transparent", color: "#DC2626", fontSize: 12, cursor: "pointer", fontWeight: 600 },
};
