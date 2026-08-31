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
  /** Opaque Numa-side key echoed into the Google request for traceability. */
  requestId: string;
}

export interface CreatedEvent {
  eventId: string;
  meetLink: string | null;
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
    summary: input.summary,
    start: { dateTime: input.startTime.toISOString(), timeZone: input.timeZone },
    end: { dateTime: input.endTime.toISOString(), timeZone: input.timeZone },
    attendees: input.attendeeEmails.map((email) => ({ email })),
    // conferenceDataVersion=1 (below) + this createRequest is what provisions the Meet link.
    conferenceData: {
      createRequest: {
        requestId: input.requestId,
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

  return { eventId: json.id, meetLink: extractMeetLink(json) };
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
