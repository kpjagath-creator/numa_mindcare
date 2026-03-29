// Status pill badge — semantic colours from audit design system.

import type { PatientStatus } from "../../types/index";
import { STATUS_LABELS } from "../../constants/statuses";

const STATUS_COLORS: Record<PatientStatus, { bg: string; color: string; dot?: string }> = {
  created:              { bg: "#F1F5F9", color: "#64748B" },
  discovery_scheduled:  { bg: "#EDE9FE", color: "#7C3AED", dot: "#7C3AED" },
  discovery_completed:  { bg: "#EEF2FF", color: "#4338CA", dot: "#4338CA" },
  started_therapy:      { bg: "#DCFCE7", color: "#16A34A", dot: "#16A34A" },
  therapy_paused:       { bg: "#FEF3C7", color: "#D97706", dot: "#D97706" },
  schedule_completed:   { bg: "#DCFCE7", color: "#16A34A", dot: "#16A34A" },
  patient_dropped:      { bg: "#FEE2E2", color: "#DC2626" },
};

export default function PatientStatusBadge({ status }: { status: PatientStatus }) {
  const { bg, color, dot } = STATUS_COLORS[status] ?? { bg: "#F1F5F9", color: "#64748B" };
  const isDropped = status === "patient_dropped";

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      background: bg,
      color,
      padding: "3px 9px",
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      whiteSpace: "nowrap",
      letterSpacing: "0.01em",
    }}>
      {dot && !isDropped && (
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0 }} />
      )}
      {isDropped && (
        <span style={{ fontSize: 10, fontWeight: 700, flexShrink: 0 }}>✕</span>
      )}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
