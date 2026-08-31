// Google Calendar API client (MEET-01).
//
// This is the *only* module in the codebase that knows Google's HTTP surface exists. It speaks
// Calendar API v3 over `fetch` and returns plain domain-shaped values; it holds no Numa business
// logic and never touches Prisma. Callers (see `sessionMeetingService.ts`) own persistence,
// idempotency, and failure policy.
//
// Why a hand-rolled client rather than the `googleapis` package: three REST calls do not justify
// a ~50MB dependency in a repo that deliberately keeps its dependency set small. Requires Node
// >= 20 for global `fetch` (pinned via `engines` in package.json).
//
// ── Authentication ─────────────────────────────────────────────────────────────────────────────
// OAuth 2.0 refresh-token flow against a dedicated Numa Google account. A service account is not
// usable here: acting *as* a user (which is what creating a Meet conference and delivering
// attendee invitations requires) needs domain-wide delegation, and domain-wide delegation
// requires Google Workspace — the dedicated account is a consumer Gmail account.
//
// The refresh token is minted once, out of band, and supplied as a deployment secret. Nothing in
// this file is ever logged: tokens, secrets, and Authorization headers must not reach stdout.
//
// !! DEPLOYMENT PREREQUISITE !! While the Cloud Console OAuth app is in "Testing" publishing
// status, Google expires refresh tokens after 7 days and every call here starts failing with
// `invalid_grant`. The OAuth app MUST be published to "In production" (verification is not
// required for this single-account use case — an unverified production app shows a one-time
// consent interstitial and works). See ARCHITECTURE.md and backend/.env.example.

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

// Refreshed access tokens are valid ~1h. Re-use one until it is close to expiring rather than
// exchanging the refresh token on every single call.
const TOKEN_EXPIRY_SKEW_MS = 60_000;

export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarId: string;
}

export interface CreateEventInput {
  summary: string;
  startTime: Date;
  endTime: Date;
  timeZone: string;
  /** Already filtered to present, valid addresses by the caller. May be empty. */
  attendeeEmails: string[];
  /** Deterministic client-specified event id — see `buildEventId`. */
  eventId: string;
}

export interface CreatedEvent {
  eventId: string;
  meetLink: string | null;
  /**
   * True when the event already existed on Google and was re-adopted rather than created. No new
   * invitations were sent in that case — Google refused the insert with 409 before doing anything.
   */
  adopted: boolean;
}

// ── Deterministic event identity (MEET-02) ─────────────────────────────────────
//
// The Numa session id derives the Google event id, so the external event stays discoverable even
// if Numa never manages to persist it. This is what makes a failed database write-back after a
// successful `events.insert` recoverable instead of permanently orphaning a real appointment.
//
// Google's id rules (events.insert reference): characters must come from the base32hex alphabet —
// lowercase `a`–`v` and digits `0`–`9` — with a length of 5 to 1024, unique per calendar. Note
// what that excludes: hyphens and the letters w–z. A format like "numa-session-123" is *invalid*
// and Google rejects it with 400.
//
// "numasession" uses only a–v, and the session id contributes only digits, so the result is always
// valid; the shortest possible value ("numasession1") is 12 characters, comfortably over the
// 5-character floor.
//
// !! OPERATIONAL CONSTRAINT !! The id is unique *per calendar*, not globally. Two deployments
// sharing one Google calendar would derive the same id for their respective session #42 and would
// silently adopt each other's events. Every environment must therefore use its own dedicated
// Google account or its own GOOGLE_CALENDAR_ID — see backend/.env.example.
const EVENT_ID_PREFIX = "numasession";
const VALID_EVENT_ID = /^[a-v0-9]{5,1024}$/;

export function buildEventId(sessionId: number): string {
  const id = `${EVENT_ID_PREFIX}${sessionId}`;
  // Cheap guard against a future prefix edit silently producing ids Google rejects with a 400
  // that would otherwise look like a generic integration failure.
  if (!VALID_EVENT_ID.test(id)) {
    throw new GoogleCalendarError(`Derived Google event id "${id}" is not a valid Calendar event id.`);
  }
  return id;
}

/** Thrown for any Google-side failure. Always safe to log — carries no credential material. */
export class GoogleCalendarError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}

// ── Configuration ──────────────────────────────────────────────────────────────

export function getGoogleCalendarConfig(): GoogleCalendarConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const calendarId = process.env.GOOGLE_CALENDAR_ID ?? "primary";
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken, calendarId };
}

export function isGoogleCalendarConfigured(): boolean {
  return getGoogleCalendarConfig() !== null;
}

/** IANA zone the clinic books in. Calendar needs an explicit zone — it must not guess. */
export function getCalendarTimeZone(): string {
  return process.env.GOOGLE_CALENDAR_TIMEZONE ?? "Asia/Kolkata";
}

// ── Access token ───────────────────────────────────────────────────────────────

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Test seam — drops the in-process access-token cache. */
export function __resetTokenCache(): void {
  cachedToken = null;
}

async function getAccessToken(config: GoogleCalendarConfig): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - TOKEN_EXPIRY_SKEW_MS) {
    return cachedToken.value;
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    // Google returns `{ error: "invalid_grant" }` for an expired/revoked refresh token — the
    // 7-day "Testing"-status expiry surfaces here. Report the error *code* only; the response
    // body can echo request parameters, so it is never logged wholesale.
    const code = await readErrorCode(res);
    throw new GoogleCalendarError(
      `Google token refresh failed (${res.status}${code ? `: ${code}` : ""}). ` +
        "Check GOOGLE_REFRESH_TOKEN and that the OAuth app is published to production.",
      res.status
    );
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new GoogleCalendarError("Google token refresh returned no access token.");

  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

async function readErrorCode(res: Response): Promise<string | null> {
  try {
    const json = (await res.json()) as { error?: unknown; error_description?: unknown };
    if (typeof json.error === "string") return json.error;
    if (json.error && typeof json.error === "object") {
      const message = (json.error as { message?: unknown }).message;
      if (typeof message === "string") return message;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Calendar operations ────────────────────────────────────────────────────────

/**
 * Creates a calendar event with an attached Google Meet conference and invites the attendees.
 * `sendUpdates=all` is what makes Google deliver the invitation emails — Numa sends none itself.
 */
export async function createEventWithMeet(input: CreateEventInput): Promise<CreatedEvent> {
  const config = getGoogleCalendarConfig();
  if (!config) throw new GoogleCalendarError("Google Calendar is not configured.");

  const token = await getAccessToken(config);

  const body = {
    // Deterministic id (MEET-02). This is what makes the insert re-attemptable: a second insert
    // with the same id is refused with 409 rather than creating a second appointment.
    id: input.eventId,
    summary: input.summary,
    start: { dateTime: input.startTime.toISOString(), timeZone: input.timeZone },
    end: { dateTime: input.endTime.toISOString(), timeZone: input.timeZone },
    attendees: input.attendeeEmails.map((email) => ({ email })),
    // conferenceDataVersion=1 (below) + this createRequest is what provisions the Meet link.
    // requestId only dedupes conference creation *within a single event*; it does not prevent
    // duplicate events across separate insert calls — the deterministic event id above does that.
    conferenceData: {
      createRequest: {
        requestId: input.eventId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
    // Attendees are patients and clinicians, not staff of one calendar — don't let them edit or
    // see each other's contact details.
    guestsCanModify: false,
    guestsCanInviteOthers: false,
    guestsCanSeeOtherGuests: false,
  };

  const url =
    `${CALENDAR_API}/calendars/${encodeURIComponent(config.calendarId)}/events` +
    `?conferenceDataVersion=1&sendUpdates=all`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // 409 "The requested identifier already exists" means this session's event is already on the
  // calendar — from an earlier attempt whose database write-back failed, or from a concurrent
  // request that won. Google created nothing and sent nothing on this call, so re-adopting the
  // existing event is both correct and invitation-silent.
  if (res.status === 409) {
    const existing = await getEvent(input.eventId);
    if (existing && !existing.cancelled) {
      return { eventId: existing.eventId, meetLink: existing.meetLink, adopted: true };
    }
    // The id is taken by an event that has since been cancelled. Google keeps cancelled ids
    // reserved, so this one can never be re-inserted; surface it rather than looping on a retry
    // that cannot succeed.
    throw new GoogleCalendarError(
      `Google Calendar event id ${input.eventId} already belongs to a cancelled event and cannot be reused.`,
      409
    );
  }

  if (!res.ok) {
    const code = await readErrorCode(res);
    throw new GoogleCalendarError(
      `Google Calendar event creation failed (${res.status}${code ? `: ${code}` : ""}).`,
      res.status
    );
  }

  const json = (await res.json()) as {
    id?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  };

  if (!json.id) throw new GoogleCalendarError("Google Calendar event creation returned no event id.");

  return { eventId: json.id, meetLink: extractMeetLink(json), adopted: false };
}

export interface FetchedEvent {
  eventId: string;
  meetLink: string | null;
  /** Google keeps cancelled events retrievable for a period; such an event is not usable. */
  cancelled: boolean;
}

/**
 * Fetches one event by id. Returns null when it does not exist (404/410) — the caller treats that
 * as "nothing to adopt" rather than an error.
 */
export async function getEvent(eventId: string): Promise<FetchedEvent | null> {
  const config = getGoogleCalendarConfig();
  if (!config) throw new GoogleCalendarError("Google Calendar is not configured.");

  const token = await getAccessToken(config);
  const url = `${CALENDAR_API}/calendars/${encodeURIComponent(config.calendarId)}/events/${encodeURIComponent(eventId)}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (res.status === 404 || res.status === 410) return null;

  if (!res.ok) {
    const code = await readErrorCode(res);
    throw new GoogleCalendarError(
      `Google Calendar event lookup failed (${res.status}${code ? `: ${code}` : ""}).`,
      res.status
    );
  }

  const json = (await res.json()) as {
    id?: string;
    status?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  };

  if (!json.id) return null;

  return { eventId: json.id, meetLink: extractMeetLink(json), cancelled: json.status === "cancelled" };
}

function extractMeetLink(event: {
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
}): string | null {
  if (event.hangoutLink) return event.hangoutLink;
  const video = event.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video");
  return video?.uri ?? null;
}

/**
 * Cancels (deletes) the event. `sendUpdates=all` makes Google notify the attendees.
 * A 404/410 means the event is already gone on Google's side — that is the desired end state, so
 * it resolves rather than throwing, which keeps cancel/reschedule retries idempotent.
 */
export async function cancelEvent(eventId: string): Promise<void> {
  const config = getGoogleCalendarConfig();
  if (!config) throw new GoogleCalendarError("Google Calendar is not configured.");

  const token = await getAccessToken(config);
  const url =
    `${CALENDAR_API}/calendars/${encodeURIComponent(config.calendarId)}/events/${encodeURIComponent(eventId)}` +
    `?sendUpdates=all`;

  const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });

  if (res.ok || res.status === 404 || res.status === 410) return;

  const code = await readErrorCode(res);
  throw new GoogleCalendarError(
    `Google Calendar event cancellation failed (${res.status}${code ? `: ${code}` : ""}).`,
    res.status
  );
}
