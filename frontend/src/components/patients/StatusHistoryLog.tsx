// Status history log table for the patient profile page.
// Renders all past status changes ordered newest-first.

import type { PatientStatusLog } from "../../types/index";

interface Props {
  logs: PatientStatusLog[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function statusLabel(s: string | null) {
  if (!s) return <span style={{ color: "#94a3b8" }}>—</span>;
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function StatusHistoryLog({ logs }: Props) {
  if (logs.length === 0) {
    return <p style={{ color: "#94a3b8", padding: "24px 0" }}>No status history yet.</p>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={s.table}>
        <thead>
          <tr style={s.headRow}>
            {["Previous Status", "New Status", "Changed By", "Notes", "Date & Time"].map((h) => (
              <th key={h} style={s.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} style={s.row}>
              <td style={{ ...s.td, color: "#94a3b8" }}>{statusLabel(log.previousStatus)}</td>
              <td style={{ ...s.td, fontWeight: 500, color: "#0f172a" }}>{statusLabel(log.newStatus)}</td>
              <td style={s.td}>{log.changedByName ?? "—"}</td>
              <td style={{ ...s.td, color: "#64748b" }}>{log.notes ?? "—"}</td>
              <td style={{ ...s.td, color: "#64748b", whiteSpace: "nowrap" }}>{formatDate(log.createdAt)}</td>
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
};
