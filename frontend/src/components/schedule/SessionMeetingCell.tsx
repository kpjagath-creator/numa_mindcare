// Google Meet display for a session (MEET-01).
//
// One component, used by both the desktop table (SessionsTable) and the mobile card list
// (ScheduleListPage) so the two branches can't drift (CLAUDE.md rule #2). Deliberately small —
// this slots into the existing session UI rather than introducing a panel of its own.
//
// Three states, matching the session's meetingStatus:
//   ACTIVE            → the link + Copy Link
//   FAILED            → a warning + Retry
//   PENDING/CANCELLED → a muted dash (nothing actionable for the admin)
//   null              → nothing at all (sessions predating the integration)

import { useState } from "react";
import type { TherapySession } from "../../types/index";

interface Props {
  session: TherapySession;
  onRetry?: (id: number) => void | Promise<void>;
  /** Mobile cards have more horizontal room than a table cell and stack vertically. */
  layout?: "cell" | "block";
}

export default function SessionMeetingCell({ session, onRetry, layout = "cell" }: Props) {
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const status = session.meetingStatus;
  if (!status) return <span style={{ color: "#b8c4cc" }}>{"—"}</span>;

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied (insecure context / permission). The link is visible and
      // selectable either way, so fail quietly rather than throwing an error at the admin.
    }
  }

  async function retry() {
    if (!onRetry) return;
    setRetrying(true);
    try {
      await onRetry(session.id);
    } finally {
      setRetrying(false);
    }
  }

  const wrap: React.CSSProperties =
    layout === "block"
      ? { display: "flex", flexDirection: "column", gap: 6 }
      : { display: "flex", flexDirection: "column", gap: 4, minWidth: 150 };

  if (status === "ACTIVE" && session.meetingLink) {
    return (
      <div style={wrap}>
        <a
          href={session.meetingLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#3D9E8E", fontWeight: 600, fontSize: 11, textDecoration: "none", wordBreak: "break-all" }}
        >
          {session.meetingLink.replace(/^https:\/\//, "")}
        </a>
        <button
          onClick={() => copyLink(session.meetingLink!)}
          style={{
            padding: "4px 9px", background: "#f0faf8", color: "#3D9E8E",
            border: "1px solid #c5e8e2", borderRadius: 5, fontSize: 11,
            fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", alignSelf: "flex-start",
          }}
        >
          {copied ? "✓ Copied" : "Copy Link"}
        </button>
      </div>
    );
  }

  if (status === "FAILED") {
    return (
      <div style={wrap}>
        <span style={{ color: "#92400e", fontSize: 11 }} title={session.meetingError ?? undefined}>
          {"⚠"} Unable to generate meeting
        </span>
        {onRetry && (
          <button
            onClick={retry}
            disabled={retrying}
            style={{
              padding: "4px 9px", background: "#fef3c7", color: "#92400e",
              border: "1px solid #fde68a", borderRadius: 5, fontSize: 11,
              fontWeight: 600, cursor: retrying ? "not-allowed" : "pointer",
              whiteSpace: "nowrap", alignSelf: "flex-start",
            }}
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
        )}
      </div>
    );
  }

  // PENDING (provisioning is synchronous, so this is only visible if a request died mid-flight)
  // and CANCELLED both have nothing for the admin to act on.
  return <span style={{ color: "#b8c4cc" }}>{"—"}</span>;
}
