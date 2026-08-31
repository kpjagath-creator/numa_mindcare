// Meeting-integration boundary for therapy sessions (MEET-01).
//
//   therapySessionsService  →  sessionMeetingService  →  googleCalendarService
//
// This module owns the *integration state* stored on a session (provider, external event id, Meet
// link, status, error) and the policy around it. `googleCalendarService` owns Google's HTTP
// surface; `therapySessionsService` owns scheduling business rules and knows nothing about
// Google beyond calling in here.
//
// ── Invariants this module exists to protect ───────────────────────────────────────────────────
// 1. Numa is the source of truth. A Google event is an external *projection* of a Numa session,
//    never the other way round.
// 2. No Google call ever runs inside a database transaction. Every entry point here is invoked
//    strictly *after* the caller's `prisma.$transaction` has committed.
// 3. Google failure never invalidates a Numa session. Every exported function is total: it
//    records a FAILED/pending state and resolves, and never throws into the scheduling path.
// 4. No duplicate events. Provisioning is idempotent — it refuses to run for a session that
//    already has a `googleEventId`, writes the id back under a compare-and-swap, and deletes its
//    own just-created event if it loses that race. `therapy_sessions.google_event_id` is UNIQUE
//    as a database-level backstop.

import prisma from "../lib/prisma";
import {
  cancelEvent,
  createEventWithMeet,
  getCalendarTimeZone,
  isGoogleCalendarConfigured,
} from "./googleCalendarService";
import type { MeetingStatus } from "../types/index";

export const MEETING_PROVIDER_GOOGLE = "google_meet";

export interface SessionMeetingState {
  meetingProvider: string | null;
  googleEventId: string | null;
  meetingLink: string | null;
  meetingStatus: MeetingStatus | null;
  meetingError: string | null;
}

const NO_MEETING: SessionMeetingState = {
  meetingProvider: null,
  googleEventId: null,
  meetingLink: null,
  meetingStatus: null,
  meetingError: null,
};

const NOT_CONFIGURED_MESSAGE =
  "Google Calendar is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN.";

// Stored in a TEXT column and surfaced verbatim to admins — keep it bounded.
const MAX_ERROR_LENGTH = 500;

// ── Helpers ────────────────────────────────────────────────────────────────────

function toMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.length > MAX_ERROR_LENGTH ? `${raw.slice(0, MAX_ERROR_LENGTH - 1)}…` : raw;
}

// Deliberately narrow: enough to reject blanks and obvious junk before handing an address to
// Google (which rejects the whole event for one malformed attendee), without inventing a second
// email-validation standard alongside the Zod `.email()` used at the API boundary.
function isUsableEmail(email: string | null | undefined): email is string {
  if (!email) return false;
  const trimmed = email.trim();
  return trimmed.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Calendar event title. Privacy-conscious by design: this is the one field visible in a patient's
 * own calendar and in notification emails, so it carries no clinical content — no diagnosis, no
 * notes, no charges, and no patient name. It mirrors the product's existing discovery/therapy
 * vocabulary and nothing more.
 */
function buildEventSummary(sessionType: string): string {
  return sessionType === "discovery" ? "Discovery Call — Numa MindCare" : "Therapy Session — Numa MindCare";
}

function logIntegration(message: string): void {
  // Matches the repo's console-based logging (middleware/logger.ts). Never log credentials,
  // tokens, or attendee email addresses.
  console.log(`[meeting] ${message}`);
}

async function writeState(sessionId: number, state: Partial<SessionMeetingState>): Promise<SessionMeetingState> {
  const updated = await prisma.therapySession.update({
    where: { id: sessionId },
    data: state,
    select: {
      meetingProvider: true,
      googleEventId: true,
      meetingLink: true,
      meetingStatus: true,
      meetingError: true,
    },
  });
  return updated as SessionMeetingState;
}

// ── provisionSessionMeeting ────────────────────────────────────────────────────

/**
 * Creates the Google Calendar event + Meet conference for a session and records the result.
 *
 * Total by contract — never throws. Call only after the session's transaction has committed.
 * Safe to call repeatedly: a session that already has an external event is returned unchanged.
 */
export async function provisionSessionMeeting(sessionId: number): Promise<SessionMeetingState> {
  const session = await prisma.therapySession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      sessionType: true,
      status: true,
      meetingProvider: true,
      googleEventId: true,
      meetingLink: true,
      meetingStatus: true,
      meetingError: true,
      patient: { select: { email: true } },
      teamMember: { select: { email: true } },
    },
  });

  if (!session) return NO_MEETING;

  // Idempotency gate #1 — an event already exists for this session. Never create a second one.
  if (session.googleEventId) {
    return {
      meetingProvider: session.meetingProvider,
      googleEventId: session.googleEventId,
      meetingLink: session.meetingLink,
      meetingStatus: session.meetingStatus as MeetingStatus | null,
      meetingError: session.meetingError,
    };
  }

  // A session that is no longer live should not acquire a calendar appointment.
  if (session.status !== "upcoming") {
    return {
      meetingProvider: session.meetingProvider,
      googleEventId: null,
      meetingLink: session.meetingLink,
      meetingStatus: session.meetingStatus as MeetingStatus | null,
      meetingError: session.meetingError,
    };
  }

  if (!isGoogleCalendarConfigured()) {
    logIntegration(`session ${sessionId}: skipped — Google Calendar not configured`);
    return writeState(sessionId, {
      meetingProvider: MEETING_PROVIDER_GOOGLE,
      meetingStatus: "FAILED",
      meetingError: NOT_CONFIGURED_MESSAGE,
    });
  }

  // Attendees are best-effort. A missing patient email or a legacy therapist record without one
  // must not stop the meeting being created — the session and the Meet link stand either way,
  // that person simply is not invited.
  const attendeeEmails: string[] = [];
  if (isUsableEmail(session.patient.email)) attendeeEmails.push(session.patient.email.trim());
  if (isUsableEmail(session.teamMember.email)) attendeeEmails.push(session.teamMember.email.trim());

  let created;
  try {
    created = await createEventWithMeet({
      summary: buildEventSummary(session.sessionType),
      startTime: session.startTime,
      endTime: session.endTime,
      timeZone: getCalendarTimeZone(),
      attendeeEmails,
      // Google dedupes conference creation on requestId within an event — a stable per-session
      // key keeps a retried create from minting a second conference.
      requestId: `numa-session-${sessionId}`,
    });
  } catch (err) {
    const message = toMessage(err);
    logIntegration(`session ${sessionId}: provisioning failed — ${message}`);
    return writeState(sessionId, {
      meetingProvider: MEETING_PROVIDER_GOOGLE,
      meetingStatus: "FAILED",
      meetingError: message,
    });
  }

  // Idempotency gate #2 — compare-and-swap. If a concurrent provision/retry wrote an event id
  // between our read and here, we lost; discard the event we just created rather than leaving a
  // duplicate appointment on the calendar.
  const claimed = await prisma.therapySession.updateMany({
    where: { id: sessionId, googleEventId: null },
    data: {
      meetingProvider: MEETING_PROVIDER_GOOGLE,
      googleEventId: created.eventId,
      meetingLink: created.meetLink,
      meetingStatus: "ACTIVE",
      meetingError: null,
    },
  });

  if (claimed.count === 0) {
    logIntegration(`session ${sessionId}: lost provisioning race — discarding duplicate event`);
    await cancelEvent(created.eventId).catch((err) =>
      logIntegration(`session ${sessionId}: could not discard duplicate event — ${toMessage(err)}`)
    );
    const current = await prisma.therapySession.findUnique({
      where: { id: sessionId },
      select: {
        meetingProvider: true,
        googleEventId: true,
        meetingLink: true,
        meetingStatus: true,
        meetingError: true,
      },
    });
    return (current as SessionMeetingState | null) ?? NO_MEETING;
  }

  logIntegration(`session ${sessionId}: meeting active (${attendeeEmails.length} attendee(s) invited)`);
  return {
    meetingProvider: MEETING_PROVIDER_GOOGLE,
    googleEventId: created.eventId,
    meetingLink: created.meetLink,
    meetingStatus: "ACTIVE",
    meetingError: null,
  };
}

// ── cancelSessionMeeting ───────────────────────────────────────────────────────

/**
 * Cancels the Google Calendar event for a session; Google notifies the attendees.
 *
 * Total by contract — never throws. The Numa cancellation has already committed by the time this
 * runs and is never undone: a Google failure leaves the row ACTIVE with `meetingError` set, which
 * is the recoverable "cancellation pending" state (a later cancel/delete retries it).
 */
export async function cancelSessionMeeting(sessionId: number): Promise<SessionMeetingState> {
  const session = await prisma.therapySession.findUnique({
    where: { id: sessionId },
    select: {
      googleEventId: true,
      meetingProvider: true,
      meetingLink: true,
      meetingStatus: true,
      meetingError: true,
    },
  });

  if (!session) return NO_MEETING;

  // Nothing was ever provisioned — mark a never-created meeting as cancelled so it can't later be
  // provisioned for a session that is no longer live, and so the UI stops offering Retry.
  if (!session.googleEventId) {
    if (session.meetingStatus === null) return NO_MEETING;
    return writeState(sessionId, { meetingStatus: "CANCELLED", meetingError: null });
  }

  try {
    await cancelEvent(session.googleEventId);
  } catch (err) {
    const message = toMessage(err);
    logIntegration(`session ${sessionId}: calendar cancellation failed — ${message}`);
    // Deliberately leaves googleEventId in place: the event still exists on Google and the id is
    // what a retry needs. The Numa session stays cancelled regardless.
    return writeState(sessionId, { meetingError: message });
  }

  logIntegration(`session ${sessionId}: calendar event cancelled`);
  // googleEventId is cleared so the row can never be mistaken for one with a live event. The link
  // is cleared with it — the Meet URL is dead once the event is gone.
  return writeState(sessionId, {
    googleEventId: null,
    meetingLink: null,
    meetingStatus: "CANCELLED",
    meetingError: null,
  });
}

// ── retrySessionMeeting ────────────────────────────────────────────────────────

/**
 * Admin-triggered retry after a failed provisioning. Idempotent: if an event was created in the
 * meantime it is returned as-is rather than duplicated.
 */
export async function retrySessionMeeting(sessionId: number): Promise<SessionMeetingState> {
  // Clear the stale error first so a retry that fails again shows the *new* reason, and so a
  // concurrent reader never sees a stale FAILED alongside a fresh event.
  await prisma.therapySession.updateMany({
    where: { id: sessionId, googleEventId: null },
    data: { meetingStatus: "PENDING", meetingError: null },
  });
  return provisionSessionMeeting(sessionId);
}
