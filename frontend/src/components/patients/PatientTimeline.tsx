// Staff patient timeline (PAT-10) — a unified chronological view composed server-side from the
// patient's existing lifecycle, session, clinical-note, payment, and assignment records. Purely a
// read view: all mutation still happens through the existing status/session/notes UI elsewhere on
// this page.

import type { PatientTimelineEntry, PatientTimelineEntryType } from "../../api/patients";
import { fmtClinicDateTime } from "../../lib/clinicTime";

interface Props {
  entries: PatientTimelineEntry[];
}

function formatDate(iso: string) {
  return fmtClinicDateTime(iso);
}

const TYPE_META: Record<PatientTimelineEntryType, { label: string; icon: string; color: string; bg: string }> = {
  lifecycle: { label: "Status", icon: "●", color: "#3D9E8E", bg: "#f0faf8" },
  assignment: { label: "Assignment", icon: "◆", color: "#7C3AED", bg: "#f5f0ff" },
  payment: { label: "Payment", icon: "$", color: "#16A34A", bg: "#f0fdf4" },
  session: { label: "Session", icon: "▸", color: "#2563EB", bg: "#eff6ff" },
  clinical_note: { label: "Note", icon: "✎", color: "#B45309", bg: "#fffbeb" },
};

export default function PatientTimeline({ entries }: Props) {
  if (entries.length === 0) {
    return <p style={{ color: "#94a3b8", padding: "24px 0" }}>No timeline events yet.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {entries.map((entry, i) => {
        const meta = TYPE_META[entry.type];
        const isLast = i === entries.length - 1;
        return (
          <div key={entry.id} style={{ display: "flex", gap: 12 }}>
            {/* Rail */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24, flexShrink: 0 }}>
              <span style={{
                width: 22, height: 22, borderRadius: "50%", background: meta.bg, color: meta.color,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>
                {meta.icon}
              </span>
              {!isLast && <span style={{ flex: 1, width: 2, background: "#ede7df", marginTop: 2, marginBottom: 2, minHeight: 14 }} />}
            </div>

            {/* Content */}
            <div style={{ paddingBottom: 16, flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: meta.color, background: meta.bg, borderRadius: 4, padding: "1px 7px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {meta.label}
                </span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{formatDate(entry.timestamp)}</span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#0F172A", lineHeight: 1.5 }}>
                {entry.description}
              </p>
              {entry.actor && (
                <span style={{ fontSize: 11, color: "#94a3b8" }}>by {entry.actor}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
