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

  // Three states need a Retry affordance, and the retry means different things in each — the
  // backend decides which from the session's own meeting state, so this component only has to
  // show the right words (MEET-02).
  //
  //   FAILED         → provisioning failed, no meeting exists      → "Retry" creates one
  //   CANCEL_FAILED  → a live event could not be removed           → "Retry" removes it
  //   PENDING        → provisioning never completed (e.g. the      → "Retry" creates one
  //                    database write after a Google create died)
  //
  // PENDING previously rendered as a bare dash with no way out, which left the admin unable to
  // recover a session whose meeting silently never finished setting up.
  const retryable =
    status === "FAILED"
      ? { text: "⚠ Unable to generate meeting", label: "Retry" }
      : status === "CANCEL_FAILED"
      ? { text: "⚠ Calendar event not cancelled", label: "Retry Cancellation" }
      : status === "PENDING"
      ? { text: "Meeting setup pending", label: "Retry" }
      : null;

  if (retryable) {
    return (
      <div style={wrap}>
        <span style={{ color: "#92400e", fontSize: 11 }} title={session.meetingError ?? undefined}>
          {retryable.text}
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
            {retrying ? "Retrying…" : retryable.label}
          </button>
        )}
      </div>
    );
  }

  // CANCELLED — the external event is gone and there is nothing left to act on.
  return <span style={{ color: "#b8c4cc" }}>{"—"}</span>;
}
