// Status pill badge — compact, low-saturation colours.

import type { PatientStatus } from "../../types/index";
import { STATUS_LABELS } from "../../constants/statuses";

const STATUS_COLORS: Record<PatientStatus, { bg: string; color: string }> = {
  created:              { bg: "#edf0f4", color: "#4a5568" },
  discovery_scheduled:  { bg: "#dbeafe", color: "#1d4ed8" },
  discovery_completed:  { bg: "#dff3fb", color: "#0369a1" },
  started_therapy:      { bg: "#d4ede5", color: "#1e6b4a" },
  therapy_paused:       { bg: "#fef3c7", color: "#92600a" },
  schedule_completed:   { bg: "#ede9fe", color: "#5b21b6" },
  patient_dropped:      { bg: "#fee2e2", color: "#b91c1c" },
};

export default function PatientStatusBadge({ status }: { status: PatientStatus }) {
  const { bg, color } = STATUS_COLORS[status] ?? { bg: "#edf0f4", color: "#4a5568" };
  return (
    <span style={{ background: bg, color, padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", letterSpacing: "0.01em" }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
