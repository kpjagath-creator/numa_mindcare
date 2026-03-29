import type { PatientStatusLog } from "../../types/index";

interface Props {
  open: boolean;
  logs: PatientStatusLog[];
  onClose: () => void;
}

export default function StatusHistoryModal({ open, logs, onClose }: Props) {
  if (!open) return null;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        background: "#fff", borderRadius: 12, maxWidth: 780, width: "92vw", maxHeight: "80vh",
        overflowY: "auto", zIndex: 201, padding: 24, boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0F172A" }}>Status History</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#94a3b8" }}>✕</button>
        </div>
        {logs.length === 0 ? (
          <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "20px 0" }}>No status changes yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f7f2ec" }}>
                  {["Date", "Status", "Note", "Changed By"].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #ddd5cb", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f0ebe4" }}>
                    <td style={{ padding: "10px 14px", color: "#64748b", whiteSpace: "nowrap" }}>
                      {new Date(log.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#3D9E8E", background: "#e4f2ee", padding: "2px 8px", borderRadius: 20 }}>
                        {log.newStatus.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", color: "#334155", fontStyle: log.notes ? "italic" : "normal" }}>
                      {log.notes ?? <span style={{ color: "#b8c4cc" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 14px", color: "#0F172A", fontWeight: 500, whiteSpace: "nowrap" }}>
                      {log.changedByName ?? <span style={{ color: "#b8c4cc" }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
