// Tests for the Google Calendar / Meet integration boundary (MEET-01).
//
// The Google HTTP client is mocked at the module boundary — no test in this repo ever makes a
// real Google API call. What's under test here is the *policy* around that client: idempotency,
// attendee assembly, and the invariant that a Google failure is recorded rather than thrown.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FakeDb } from "./fakePrisma";

vi.mock("../../lib/prisma", async () => {
  const { FakeDb, createFakeClient } = await import("./fakePrisma");
  const fakeDb = new FakeDb();
  const client = createFakeClient(fakeDb);
  (client as any).__db = fakeDb;
  return { default: client };
});

vi.mock("../googleCalendarService", () => ({
  isGoogleCalendarConfigured: vi.fn(() => true),
  getCalendarTimeZone: vi.fn(() => "Asia/Kolkata"),
  createEventWithMeet: vi.fn(),
  cancelEvent: vi.fn(),
}));

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

function seed(opts?: { patientEmail?: string; therapistEmail?: string | null; status?: string }): number {
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
    googleEventId: null,
    meetingLink: null,
    meetingStatus: "PENDING",
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
  mockCreate.mockResolvedValue({ eventId: "evt-1", meetLink: "https://meet.google.com/abc-defg-hij" });
  mockCancel.mockResolvedValue(undefined);
});

describe("sessionMeetingService — provisioning", () => {
  it("creates the calendar event and persists the Meet link against the session", async () => {
    const id = seed();

    const state = await provisionSessionMeeting(id);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(state.meetingStatus).toBe("ACTIVE");
    expect(state.meetingLink).toBe("https://meet.google.com/abc-defg-hij");
    expect(state.googleEventId).toBe("evt-1");
    expect(state.meetingError).toBeNull();

    // Persisted, not just returned.
    expect(db.sessions.get(id)!.meetingLink).toBe("https://meet.google.com/abc-defg-hij");
    expect(db.sessions.get(id)!.googleEventId).toBe("evt-1");
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
    expect(state.meetingLink).toBe("https://meet.google.com/abc-defg-hij");
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
    // The session itself is untouched and still valid.
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
});

describe("sessionMeetingService — idempotency / duplicate prevention", () => {
  it("does not create a second event for a session that already has one", async () => {
    const id = seed();

    await provisionSessionMeeting(id);
    const second = await provisionSessionMeeting(id);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(second.googleEventId).toBe("evt-1");
    expect(second.meetingStatus).toBe("ACTIVE");
  });

  it("discards its own event and keeps the winner when it loses the compare-and-swap race", async () => {
    const id = seed();
    // Simulate a concurrent provisioning committing an event id while our Google call is in
    // flight — the compare-and-swap must then reject our write.
    mockCreate.mockImplementation(async () => {
      db.sessions.set(id, {
        ...db.sessions.get(id)!,
        googleEventId: "evt-winner",
        meetingLink: "https://meet.google.com/win-nnnn-ner",
        meetingStatus: "ACTIVE",
      });
      return { eventId: "evt-loser", meetLink: "https://meet.google.com/los-eeee-ser" };
    });

    const state = await provisionSessionMeeting(id);

    // The duplicate we created is cleaned up on Google's side...
    expect(mockCancel).toHaveBeenCalledWith("evt-loser");
    // ...and the row keeps the winner, never the loser.
    expect(state.googleEventId).toBe("evt-winner");
    expect(db.sessions.get(id)!.googleEventId).toBe("evt-winner");
  });

  it("does not provision a meeting for a session that is no longer upcoming", async () => {
    const id = seed({ status: "cancelled" });

    await provisionSessionMeeting(id);

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("uses a stable per-session conference request id so a retried create cannot fork a second conference", async () => {
    const id = seed();
    mockCreate.mockRejectedValueOnce(new Error("transient"));

    await provisionSessionMeeting(id);
    await retrySessionMeeting(id);

    expect(mockCreate.mock.calls[0][0].requestId).toBe(`numa-session-${id}`);
    expect(mockCreate.mock.calls[1][0].requestId).toBe(`numa-session-${id}`);
  });
});

describe("sessionMeetingService — retry", () => {
  it("recovers a failed session to ACTIVE and clears the stored error", async () => {
    const id = seed();
    mockCreate.mockRejectedValueOnce(new Error("temporary outage"));

    const failed = await provisionSessionMeeting(id);
    expect(failed.meetingStatus).toBe("FAILED");
    expect(failed.meetingError).toContain("temporary outage");

    const retried = await retrySessionMeeting(id);

    expect(retried.meetingStatus).toBe("ACTIVE");
    expect(retried.meetingLink).toBe("https://meet.google.com/abc-defg-hij");
    expect(retried.meetingError).toBeNull();
  });

  it("is a no-op that creates nothing when the session already has an event", async () => {
    const id = seed();
    await provisionSessionMeeting(id);

    const retried = await retrySessionMeeting(id);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(retried.googleEventId).toBe("evt-1");
  });
});

describe("sessionMeetingService — cancellation", () => {
  it("cancels the calendar event and clears the dead Meet link", async () => {
    const id = seed();
    await provisionSessionMeeting(id);

    const state = await cancelSessionMeeting(id);

    expect(mockCancel).toHaveBeenCalledWith("evt-1");
    expect(state.meetingStatus).toBe("CANCELLED");
    expect(state.meetingLink).toBeNull();
    expect(state.googleEventId).toBeNull();
  });

  it("keeps the external event id for a later retry when Google cancellation fails", async () => {
    const id = seed();
    await provisionSessionMeeting(id);
    mockCancel.mockRejectedValue(new Error("Google Calendar event cancellation failed (503)."));

    const state = await cancelSessionMeeting(id);

    // Still ACTIVE with an error recorded — the recoverable "cancellation pending" state.
    expect(state.meetingStatus).toBe("ACTIVE");
    expect(state.googleEventId).toBe("evt-1");
    expect(state.meetingError).toContain("503");
  });

  it("does not call Google for a session that never had an event", async () => {
    const id = seed();

    const state = await cancelSessionMeeting(id);

    expect(mockCancel).not.toHaveBeenCalled();
    expect(state.meetingStatus).toBe("CANCELLED");
  });
});
