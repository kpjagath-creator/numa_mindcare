// Tests for the Google Calendar / Meet integration boundary (MEET-01, MEET-02).
//
// The Google HTTP client is mocked at the module boundary — no test in this repo ever makes a
// real Google API call. What's under test here is the *policy* around that client: idempotency,
// attendee assembly, deterministic event identity, and the recovery paths that keep Numa from
// permanently losing control of a live calendar event.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FakeDb } from "./fakePrisma";

vi.mock("../../lib/prisma", async () => {
  const { FakeDb, createFakeClient } = await import("./fakePrisma");
  const fakeDb = new FakeDb();
  const client = createFakeClient(fakeDb);
  (client as any).__db = fakeDb;
  return { default: client };
});

vi.mock("../googleCalendarService", async () => {
  // buildEventId is pure and is the contract under test for deterministic identity — use the real
  // one rather than a stub, so a format regression fails here.
  const actual = await vi.importActual<typeof import("../googleCalendarService")>("../googleCalendarService");
  return {
    buildEventId: actual.buildEventId,
    GoogleCalendarError: actual.GoogleCalendarError,
    isGoogleCalendarConfigured: vi.fn(() => true),
    getCalendarTimeZone: vi.fn(() => "Asia/Kolkata"),
    createEventWithMeet: vi.fn(),
    cancelEvent: vi.fn(),
    getEvent: vi.fn(),
  };
});

import prismaMock from "../../lib/prisma";
import * as google from "../googleCalendarService";
import {
  provisionSessionMeeting,
  cancelSessionMeeting,
  retrySessionMeeting,
} from "../sessionMeetingService";

const db: FakeDb = (prismaMock as any).__db;

const mockCreate = vi.mocked(google.createEventWithMeet);
const mockCancel = vi.mocked(google.cancelEvent);
const mockConfigured = vi.mocked(google.isGoogleCalendarConfigured);

const MEET_LINK = "https://meet.google.com/abc-defg-hij";

function seed(opts?: {
  patientEmail?: string;
  therapistEmail?: string | null;
  status?: string;
  meetingStatus?: string | null;
  googleEventId?: string | null;
}): number {
  db.patients.set(1, {
    id: 1,
    name: "Patient 1",
    patientNumber: "P0001",
    currentStatus: "started_therapy",
    therapistId: 1,
    email: opts?.patientEmail ?? "patient@example.test",
  });
  db.teamMembers.set(1, {
    id: 1,
    name: "Therapist 1",
    employeeType: "psychologist",
    isActive: true,
    email: opts?.therapistEmail === undefined ? "therapist@example.test" : opts.therapistEmail,
  });
  const id = db.nextSessionId++;
  const now = new Date();
  db.sessions.set(id, {
    id,
    patientId: 1,
    teamMemberId: 1,
    startTime: new Date("2026-09-10T10:00:00"),
    endTime: new Date("2026-09-10T11:00:00"),
    durationMins: 60,
    sessionType: "therapy",
    status: opts?.status ?? "upcoming",
    charges: null,
    notes: null,
    rescheduledFromId: null,
    paymentStatus: "unpaid",
    noShowFee: null,
    cancelReason: null,
    meetingProvider: "google_meet",
    googleEventId: opts?.googleEventId ?? null,
    meetingLink: null,
    meetingStatus: opts?.meetingStatus === undefined ? "PENDING" : opts.meetingStatus,
    meetingError: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
  mockConfigured.mockReturnValue(true);
  mockCreate.mockImplementation(async (input) => ({
    eventId: input.eventId,
    meetLink: MEET_LINK,
    adopted: false,
  }));
  mockCancel.mockResolvedValue(undefined);
});

// ── Deterministic event identity (MEET-02) ────────────────────────────────────

describe("buildEventId — Google event id format", () => {
  it("produces an id Google will accept (base32hex charset, 5-1024 chars)", () => {
    // Google's documented rule for events.insert: lowercase a-v and digits 0-9 only, length 5+.
    // Notably this excludes hyphens and w-z, so "numa-session-1" would be rejected with a 400.
    for (const sessionId of [1, 42, 999999]) {
      const id = google.buildEventId(sessionId);
      expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
      expect(id).not.toContain("-");
    }
  });

  it("is stable and unique per session", () => {
    expect(google.buildEventId(7)).toBe(google.buildEventId(7));
    expect(google.buildEventId(7)).not.toBe(google.buildEventId(8));
  });
});

// ── Provisioning ──────────────────────────────────────────────────────────────

describe("sessionMeetingService — provisioning", () => {
  it("creates the calendar event and persists the Meet link against the session", async () => {
    const id = seed();

    const state = await provisionSessionMeeting(id);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(state.meetingStatus).toBe("ACTIVE");
    expect(state.meetingLink).toBe(MEET_LINK);
    expect(state.googleEventId).toBe(google.buildEventId(id));
    expect(state.meetingError).toBeNull();
    expect(db.sessions.get(id)!.meetingLink).toBe(MEET_LINK);
  });

  it("sends the deterministic event id to Google", async () => {
    const id = seed();

    await provisionSessionMeeting(id);

    expect(mockCreate.mock.calls[0][0].eventId).toBe(google.buildEventId(id));
  });

  it("adds both the patient and the therapist as attendees when both have emails", async () => {
    const id = seed();

    await provisionSessionMeeting(id);

    expect(mockCreate.mock.calls[0][0].attendeeEmails).toEqual([
      "patient@example.test",
      "therapist@example.test",
    ]);
  });

  it("keeps a privacy-conscious event title carrying no clinical or patient detail", async () => {
    const id = seed();

    await provisionSessionMeeting(id);

    const summary = mockCreate.mock.calls[0][0].summary;
    expect(summary).toBe("Therapy Session — Numa MindCare");
    expect(summary).not.toContain("Patient 1");
  });

  it("still generates the meeting when the therapist has no email, inviting only the patient", async () => {
    const id = seed({ therapistEmail: null });

    const state = await provisionSessionMeeting(id);

    expect(state.meetingStatus).toBe("ACTIVE");
    expect(mockCreate.mock.calls[0][0].attendeeEmails).toEqual(["patient@example.test"]);
  });

  it("still generates the meeting when the patient email is blank, inviting only the therapist", async () => {
    const id = seed({ patientEmail: "" });

    const state = await provisionSessionMeeting(id);

    expect(state.meetingStatus).toBe("ACTIVE");
    expect(mockCreate.mock.calls[0][0].attendeeEmails).toEqual(["therapist@example.test"]);
  });

  it("records FAILED rather than throwing when the Google API rejects the request", async () => {
    const id = seed();
    mockCreate.mockRejectedValue(new Error("Google Calendar event creation failed (403: forbidden)."));

    const state = await provisionSessionMeeting(id);

    expect(state.meetingStatus).toBe("FAILED");
    expect(state.meetingLink).toBeNull();
    expect(state.meetingError).toContain("403");
    expect(db.sessions.get(id)!.status).toBe("upcoming");
  });

  it("records FAILED when Google credentials are not configured, without calling the API", async () => {
    const id = seed();
    mockConfigured.mockReturnValue(false);

    const state = await provisionSessionMeeting(id);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(state.meetingStatus).toBe("FAILED");
    expect(state.meetingError).toContain("not configured");
  });

  it("does not provision a meeting for a session that is no longer upcoming", async () => {
    const id = seed({ status: "cancelled" });

    await provisionSessionMeeting(id);

    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ── M3: database write-back failure after a successful Google create ──────────

describe("sessionMeetingService — recovery after a failed database write-back (M3)", () => {
  it("re-adopts the existing event on retry instead of creating a second one", async () => {
    const id = seed();
    const deterministicId = google.buildEventId(id);

    // The Google event is created successfully, then the write-back fails — the exact window that
    // previously orphaned the event and left Numa with no reference to it.
    const updateManySpy = vi
      .spyOn((prismaMock as any).therapySession, "updateMany")
      .mockRejectedValueOnce(new Error("database connection lost"));

    await expect(provisionSessionMeeting(id)).rejects.toThrow("database connection lost");
    updateManySpy.mockRestore();

    // Numa has no event id, but a real event now exists on Google.
    expect(db.sessions.get(id)!.googleEventId).toBeNull();
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Google now refuses a second insert of the same deterministic id and the client re-adopts
    // the existing event — no second event, and crucially no second set of invitations.
    mockCreate.mockImplementationOnce(async (input) => ({
      eventId: input.eventId,
      meetLink: MEET_LINK,
      adopted: true,
    }));

    const state = await retrySessionMeeting(id);

    expect(state.meetingStatus).toBe("ACTIVE");
    expect(state.googleEventId).toBe(deterministicId);
    expect(state.meetingLink).toBe(MEET_LINK);
    // Same deterministic id both times — one event, never two.
    expect(mockCreate.mock.calls[0][0].eventId).toBe(deterministicId);
    expect(mockCreate.mock.calls[1][0].eventId).toBe(deterministicId);
  });

  it("cleans up the orphaned event on cancellation even though no id was ever stored", async () => {
    // Same window as above: PENDING with no stored id, but a live event on Google.
    const id = seed({ meetingStatus: "PENDING", googleEventId: null });

    const state = await cancelSessionMeeting(id);

    // The deterministic id lets cleanup happen without a stored reference.
    expect(mockCancel).toHaveBeenCalledWith(google.buildEventId(id));
    expect(state.meetingStatus).toBe("CANCELLED");
  });
});

// ── Idempotency / duplicate prevention ────────────────────────────────────────

describe("sessionMeetingService — idempotency / duplicate prevention", () => {
  it("does not create a second event for a session that already has one", async () => {
    const id = seed();

    await provisionSessionMeeting(id);
    const second = await provisionSessionMeeting(id);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(second.googleEventId).toBe(google.buildEventId(id));
    expect(second.meetingStatus).toBe("ACTIVE");
  });

  it("concurrent retries converge on one event and never cancel the surviving one", async () => {
    const id = seed();
    const deterministicId = google.buildEventId(id);

    // Both calls reach Google. The first creates; the second collides on the deterministic id and
    // adopts. Both therefore hold the *same* event id.
    let calls = 0;
    mockCreate.mockImplementation(async (input) => {
      calls += 1;
      return { eventId: input.eventId, meetLink: MEET_LINK, adopted: calls > 1 };
    });

    const [a, b] = await Promise.all([retrySessionMeeting(id), retrySessionMeeting(id)]);

    expect(a.googleEventId).toBe(deterministicId);
    expect(b.googleEventId).toBe(deterministicId);
    expect(db.sessions.get(id)!.googleEventId).toBe(deterministicId);
    // The compare-and-swap loser must NOT delete the event — it is the same one the winner kept.
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("discards a genuinely different duplicate when losing the race to a pre-MEET-02 event id", async () => {
    const id = seed();
    // Simulate a session provisioned before deterministic ids: a concurrent writer commits a
    // random Google-assigned id while our create is in flight.
    mockCreate.mockImplementation(async (input) => {
      db.sessions.set(id, {
        ...db.sessions.get(id)!,
        googleEventId: "legacyrandomid",
        meetingLink: "https://meet.google.com/legacy",
        meetingStatus: "ACTIVE",
      });
      return { eventId: input.eventId, meetLink: MEET_LINK, adopted: false };
    });

    const state = await provisionSessionMeeting(id);

    expect(mockCancel).toHaveBeenCalledWith(google.buildEventId(id));
    expect(state.googleEventId).toBe("legacyrandomid");
  });
});

// ── Cancellation ──────────────────────────────────────────────────────────────

describe("sessionMeetingService — cancellation", () => {
  it("cancels the calendar event and clears the dead Meet link", async () => {
    const id = seed();
    await provisionSessionMeeting(id);

    const state = await cancelSessionMeeting(id);

    expect(mockCancel).toHaveBeenCalledWith(google.buildEventId(id));
    expect(state.meetingStatus).toBe("CANCELLED");
    expect(state.meetingLink).toBeNull();
    expect(state.googleEventId).toBeNull();
  });

  it("records CANCEL_FAILED and retains the event id when Google cancellation fails", async () => {
    const id = seed();
    await provisionSessionMeeting(id);
    mockCancel.mockRejectedValue(new Error("Google Calendar event cancellation failed (503)."));

    const state = await cancelSessionMeeting(id);

    // Not ACTIVE — the old behaviour left this looking healthy, hiding a live event from staff.
    expect(state.meetingStatus).toBe("CANCEL_FAILED");
    expect(state.googleEventId).toBe(google.buildEventId(id));
    expect(state.meetingError).toContain("503");
  });

  it("does not call Google for a session that never had a meeting at all", async () => {
    const id = seed({ meetingStatus: null });

    const state = await cancelSessionMeeting(id);

    expect(mockCancel).not.toHaveBeenCalled();
    expect(state.meetingStatus).toBeNull();
  });

  it("does not attempt speculative cleanup when Google is not configured", async () => {
    const id = seed({ meetingStatus: "FAILED", googleEventId: null });
    mockConfigured.mockReturnValue(false);

    const state = await cancelSessionMeeting(id);

    expect(mockCancel).not.toHaveBeenCalled();
    expect(state.meetingStatus).toBe("CANCELLED");
  });
});

// ── M2: retry routing — provision vs cancellation ─────────────────────────────

describe("sessionMeetingService — retry routes by meeting state (M2)", () => {
  it("recovers a failed provisioning to ACTIVE and clears the stored error", async () => {
    const id = seed();
    mockCreate.mockRejectedValueOnce(new Error("temporary outage"));

    const failed = await provisionSessionMeeting(id);
    expect(failed.meetingStatus).toBe("FAILED");

    const retried = await retrySessionMeeting(id);

    expect(retried.meetingStatus).toBe("ACTIVE");
    expect(retried.meetingError).toBeNull();
  });

  it("retries cancellation — not provisioning — for a CANCEL_FAILED session", async () => {
    const id = seed();
    await provisionSessionMeeting(id);
    mockCancel.mockRejectedValueOnce(new Error("Google unavailable (503)."));
    const failed = await cancelSessionMeeting(id);
    expect(failed.meetingStatus).toBe("CANCEL_FAILED");

    mockCreate.mockClear();
    mockCancel.mockResolvedValue(undefined);

    const retried = await retrySessionMeeting(id);

    // The cleanup succeeded and — critically — no replacement event was created.
    expect(retried.meetingStatus).toBe("CANCELLED");
    expect(retried.googleEventId).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("retries cancellation for a session whose domain status is 'rescheduled'", async () => {
    const id = seed();
    await provisionSessionMeeting(id);
    mockCancel.mockRejectedValueOnce(new Error("Google unavailable (503)."));
    await cancelSessionMeeting(id);

    // The reschedule flow leaves the original session in this domain status.
    db.sessions.set(id, { ...db.sessions.get(id)!, status: "rescheduled" });
    mockCreate.mockClear();
    mockCancel.mockResolvedValue(undefined);

    const retried = await retrySessionMeeting(id);

    expect(retried.meetingStatus).toBe("CANCELLED");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("is a no-op that creates nothing when the session already has an event", async () => {
    const id = seed();
    await provisionSessionMeeting(id);

    const retried = await retrySessionMeeting(id);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(retried.googleEventId).toBe(google.buildEventId(id));
  });
});
