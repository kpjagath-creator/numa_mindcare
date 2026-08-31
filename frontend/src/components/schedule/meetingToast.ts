// Toast copy for the meeting Retry action (MEET-02).
//
// The retry endpoint does two different jobs depending on the session's meeting state — provision
// a meeting, or remove a calendar event that could not be cancelled. Both the Schedule page and
// the Patient profile page trigger it, so the wording lives here rather than being duplicated
// (and drifting) between the two.

import type { MeetingStatus } from "../../types/index";

export function retryMeetingToast(status: MeetingStatus | null): [string, "success" | "error"] {
  switch (status) {
    case "ACTIVE":
      return ["Google Meet link generated.", "success"];
    case "CANCELLED":
      return ["Calendar event cancelled.", "success"];
    case "CANCEL_FAILED":
      return ["Could not cancel the calendar event. Please try again.", "error"];
    default:
      return ["Could not generate the meeting. Please try again.", "error"];
  }
}

// Server-side errors carry a specific, actionable message (e.g. a delete refused because the
// calendar event is still live). Prefer it over a generic fallback — matches the convention used
// in AddSessionModal and ClinicalNotesPanel.
export function serverMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback;
}
