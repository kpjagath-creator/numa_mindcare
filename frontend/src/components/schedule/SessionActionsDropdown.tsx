// Session action selector — native <select> for viewport-aware positioning + separate Notes CTA.

import { useState } from "react";
import type { TherapySession } from "../../types/index";

type Action = "" | "complete" | "reschedule" | "no_show" | "cancel" | "delete";

interface Props {
  session: TherapySession;
  onComplete?: (id: number) => void;
  onReschedule?: (id: number) => void;
  onNoShow?: (id: number) => void;
  onCancel?: (id: number) => void;
  onDelete?: (id: number) => void;
  onNotes?: (session: TherapySession) => void;
}

export default function SessionActionsDropdown({
  session, onComplete, onReschedule, onNoShow, onCancel, onDelete, onNotes,
}: Props) {
  const [selected, setSelected] = useState<Action>("");

  const isUpcoming = session.status === "upcoming";
  const hasAnyAction = (isUpcoming && (onComplete || onReschedule || onNoShow || onCancel)) || onDelete;

  function handleGo() {
    if (!selected) return;
    switch (selected) {
      case "complete":   onComplete?.(session.id);   break;
      case "reschedule": onReschedule?.(session.id); break;
      case "no_show":    onNoShow?.(session.id);     break;
      case "cancel":     onCancel?.(session.id);     break;
      case "delete":     onDelete?.(session.id);     break;
    }
    setSelected("");
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "nowrap" }}>
      {/* Notes — standalone CTA, always visible */}
      {onNotes && (
        <button
          onClick={() => onNotes(session)}
          style={{
            padding: "5px 9px", background: "#f0faf8", color: "#2d6b5f",
            border: "1px solid #c5e8e2", borderRadius: 5, fontSize: 11,
            fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
          }}
          title="View / edit session note"
        >
          📝 Note
        </button>
      )}

      {/* Action select — browser handles upward flip near bottom automatically */}
      {hasAnyAction && (
        <>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value as Action)}
            style={{
              padding: "5px 7px", border: "1px solid #ddd5cb", borderRadius: 5,
              fontSize: 11, color: selected ? "#1a2535" : "#94a3b8",
              background: "#fff", cursor: "pointer", outline: "none", width: 120,
            }}
          >
            <option value="">Action…</option>
            {isUpcoming && onComplete   && <option value="complete">✓ Complete</option>}
            {isUpcoming && onReschedule && <option value="reschedule">↻ Reschedule</option>}
            {isUpcoming && onNoShow     && <option value="no_show">⊘ No Show</option>}
            {isUpcoming && onCancel     && <option value="cancel">✕ Cancel</option>}
            {onDelete                   && <option value="delete">🗑 Delete</option>}
          </select>

          <button
            onClick={handleGo}
            disabled={!selected}
            style={{
              padding: "5px 10px",
              background: selected ? "#2d6b5f" : "#eee8e0",
              color: selected ? "#fff" : "#b8c4cc",
              border: "none", borderRadius: 5, fontSize: 11, fontWeight: 700,
              cursor: selected ? "pointer" : "not-allowed", whiteSpace: "nowrap",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            Go →
          </button>
        </>
      )}
    </div>
  );
}
