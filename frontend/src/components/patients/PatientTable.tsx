// Patient list table — avatar/initials column, ConfirmDialog, updated styles.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Patient } from "../../types/index";
import PatientStatusBadge from "./PatientStatusBadge";
import ConfirmDialog from "../ui/ConfirmDialog";

interface Props {
  patients: Patient[];
  onDelete?: (id: number) => void;
}

function avatarColor(_name: string): string {
  return "#3D9E8E";
}

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function PatientRow({ p, onDelete }: { p: Patient; onDelete?: (id: number) => void }) {
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);
  const color = avatarColor(p.name);

  return (
    <>
      <tr style={s.row} onClick={() => navigate(`/patients/${p.id}`)} title="View patient profile">
        {/* Avatar */}
        <td style={{ ...s.td, width: 48 }}>
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            background: color + "22", color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700, flexShrink: 0,
          }}>
            {initials(p.name)}
          </div>
        </td>
        <td style={{ ...s.td, fontWeight: 600, color: "#0F172A" }}>
          <div>{p.name}</div>
          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>#{p.patientNumber}</div>
        </td>
        <td style={s.td}>{p.mobile}</td>
        <td style={s.td}>{p.therapist ? p.therapist.name : <span style={s.faint}>—</span>}</td>
        <td style={s.td}>{p.source ?? <span style={s.faint}>—</span>}</td>
        <td style={s.td}><PatientStatusBadge status={p.currentStatus} /></td>
        <td style={{ ...s.td, whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
          <button style={s.viewBtn} onClick={() => navigate(`/patients/${p.id}`)}>View</button>
          {onDelete && (
            <button style={s.deleteBtn} onClick={() => setShowConfirm(true)}>Delete</button>
          )}
        </td>
      </tr>

      <ConfirmDialog
        open={showConfirm}
        title="Delete Patient"
        message={`Are you sure you want to delete "${p.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => { onDelete?.(p.id); setShowConfirm(false); }}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}

export default function PatientTable({ patients, onDelete }: Props) {
  if (patients.length === 0) {
    return <p style={s.empty}>No patients found.</p>;
  }

  return (
    <div className="table-scroll">
      <table style={s.table}>
        <thead>
          <tr style={s.headRow}>
            {["", "Name", "Mobile", "Therapist", "Source", "Status", "Actions"].map((h, i) => (
              <th key={i} style={s.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {patients.map((p) => (
            <PatientRow key={p.id} p={p} onDelete={onDelete} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  table:   { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)", border: "1px solid #E8EDF2" },
  headRow: { background: "#FDFBF8" },
  th:      { padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid #E8EDF2" },
  row:     { borderBottom: "1px solid #F1F5F9", cursor: "pointer", transition: "background 0.1s ease" },
  td:      { padding: "12px 14px", fontSize: 13, color: "#475569" },
  faint:   { color: "#CBD5E1" } as React.CSSProperties,
  empty:   { color: "#94A3B8", fontSize: 13, padding: "40px 0", textAlign: "center" as const },
  viewBtn: {
    padding: "5px 13px", border: "1.5px solid #3D9E8E", borderRadius: 7,
    background: "transparent", color: "#3D9E8E", fontSize: 12, cursor: "pointer",
    marginRight: 6, fontWeight: 600,
  },
  deleteBtn: {
    padding: "5px 13px", border: "1.5px solid #DC2626", borderRadius: 7,
    background: "transparent", color: "#DC2626", fontSize: 12, cursor: "pointer", fontWeight: 600,
  },
};
