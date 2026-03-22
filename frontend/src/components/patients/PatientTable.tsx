// Patient list table — compact, with CSS row-hover via .table-scroll.

import { useNavigate } from "react-router-dom";
import type { Patient } from "../../types/index";
import PatientStatusBadge from "./PatientStatusBadge";

interface Props {
  patients: Patient[];
  onDelete?: (id: number) => void;
}

export default function PatientTable({ patients, onDelete }: Props) {
  const navigate = useNavigate();

  if (patients.length === 0) {
    return <p style={s.empty}>No patients found.</p>;
  }

  return (
    <div className="table-scroll">
      <table style={s.table}>
        <thead>
          <tr style={s.headRow}>
            {["Patient #", "Name", "Mobile", "Therapist", "Source", "Status", "Actions"].map((h) => (
              <th key={h} style={s.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {patients.map((p) => (
            <tr key={p.id} style={s.row}>
              <td style={s.td}><span style={s.mono}>{p.patientNumber}</span></td>
              <td style={{ ...s.td, fontWeight: 500, color: "#1a2535" }}>{p.name}</td>
              <td style={s.td}>{p.mobile}</td>
              <td style={s.td}>{p.therapist ? p.therapist.name : <span style={s.faint}>—</span>}</td>
              <td style={s.td}>{p.source ?? <span style={s.faint}>—</span>}</td>
              <td style={s.td}><PatientStatusBadge status={p.currentStatus} /></td>
              <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                <button style={s.viewBtn} onClick={() => navigate(`/patients/${p.id}`)}>View</button>
                {onDelete && (
                  <button style={s.deleteBtn} onClick={() => {
                    if (window.confirm(`Delete patient "${p.name}"? This cannot be undone.`)) onDelete(p.id);
                  }}>Delete</button>
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
  table:   { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.05), 0 4px 14px rgba(0,0,0,0.04)" },
  headRow: { background: "#f7f2ec" },
  th:      { padding: "9px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#8a96a3", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid #ede7df" },
  row:     { borderBottom: "1px solid #f5f0ea" },
  td:      { padding: "10px 14px", fontSize: 12, color: "#3d4f60" },
  mono:    { fontFamily: "monospace", fontSize: 12, color: "#2d6b5f", fontWeight: 700 },
  faint:   { color: "#b8c4cc" } as React.CSSProperties,
  empty:   { color: "#8a96a3", fontSize: 12, padding: "32px 0", textAlign: "center" as const },
  viewBtn: { padding: "4px 11px", border: "1px solid #2d6b5f", borderRadius: 5, background: "transparent", color: "#2d6b5f", fontSize: 11, cursor: "pointer", marginRight: 5, fontWeight: 500 },
  deleteBtn: { padding: "4px 11px", border: "1px solid #e53e3e", borderRadius: 5, background: "transparent", color: "#e53e3e", fontSize: 11, cursor: "pointer", fontWeight: 500 },
};
