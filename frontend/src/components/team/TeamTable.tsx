// Team member list table — Employee Code | Name | Employee Type | Status | Patients | Actions

import { useNavigate } from "react-router-dom";
import type { TeamMember } from "../../types/index";

interface Props {
  members: TeamMember[];
  onDelete?: (id: number) => void;
}

const TYPE_LABELS: Record<string, string> = {
  psychologist: "Psychologist",
  psychiatrist: "Psychiatrist",
};

export default function TeamTable({ members, onDelete }: Props) {
  const navigate = useNavigate();

  if (members.length === 0) {
    return <p style={{ color: "#8a96a3", fontSize: 12, padding: "32px 0", textAlign: "center" }}>No team members found.</p>;
  }

  return (
    <div className="table-scroll">
      <table style={s.table}>
        <thead>
          <tr style={s.headRow}>
            {["Employee Code", "Name", "Employee Type", "Status", "Patients", "Actions"].map((h) => (
              <th key={h} style={s.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} style={s.row}>
              <td style={s.td}><span style={s.mono}>{m.employeeCode}</span></td>
              <td style={{ ...s.td, fontWeight: 500, color: "#1a2535" }}>{m.name}</td>
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
                  <button
                    style={s.deleteBtn}
                    onClick={() => {
                      if (window.confirm(`Delete team member "${m.name}"? This cannot be undone.`)) {
                        onDelete(m.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  table: { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.05), 0 4px 14px rgba(0,0,0,0.04)" },
  headRow: { background: "#f7f2ec" },
  th: { padding: "9px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#8a96a3", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid #ede7df" },
  row: { borderBottom: "1px solid #f5f0ea" },
  td: { padding: "10px 14px", fontSize: 12, color: "#3d4f60" },
  mono: { fontFamily: "monospace", fontSize: 12, color: "#2d6b5f", fontWeight: 700 },
  badge: { padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600 },
  active: { background: "#d4ede5", color: "#1e6b4a" },
  inactive: { background: "#f5f0ea", color: "#8a96a3" },
  patientsBtn: { padding: "4px 11px", border: "1px solid #2d6b5f", borderRadius: 5, background: "transparent", color: "#2d6b5f", fontSize: 11, cursor: "pointer", fontWeight: 500, marginRight: 5 },
  deleteBtn: { padding: "4px 11px", border: "1px solid #e53e3e", borderRadius: 5, background: "transparent", color: "#e53e3e", fontSize: 11, cursor: "pointer", fontWeight: 500 },
};
