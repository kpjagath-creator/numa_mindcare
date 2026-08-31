import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FakeDb } from "./fakePrisma";

// Self-contained factory (no outer-scope references) so it isn't subject to vi.mock's hoisting
// restriction. The fake db instance is stashed on the mocked client itself so the test below can
// reach it via the module's own (mocked) default export.
vi.mock("../../lib/prisma", async () => {
  const { FakeDb, createFakeClient } = await import("./fakePrisma");
  const fakeDb = new FakeDb();
  const client = createFakeClient(fakeDb);
  (client as any).__db = fakeDb;
  return { default: client };
});

// The Google Calendar boundary is mocked at the module edge — this suite is about scheduling
// behaviour, and no test in this repo ever reaches the real Google API. Default resolutions are a
// "not configured" no-op so the pre-existing tests below are unaffected by MEET-01; the
// integration-specific tests at the bottom of the file override them per case.
vi.mock("../sessionMeetingService", () => ({
  MEETING_PROVIDER_GOOGLE: "google_meet",
  provisionSessionMeeting: vi.fn(async () => ({
    meetingProvider: "google_meet",
    googleEventId: null,
    meetingLink: null,
    meetingStatus: "FAILED",
    meetingError: "Google Calendar is not configured.",
  })),
  cancelSessionMeeting: vi.fn(async () => ({
    meetingProvider: null,
    googleEventId: null,
    meetingLink: null,
    meetingStatus: null,
    meetingError: null,
  })),
  retrySessionMeeting: vi.fn(async () => ({
    meetingProvider: null,
    googleEventId: null,
    meetingLink: null,
    meetingStatus: null,
    meetingError: null,
  })),
}));

import prismaMock from "../../lib/prisma";
import * as sessionMeetingService from "../sessionMeetingService";
import { createSession, completeSession, rescheduleSession, cancelSession } from "../therapySessionsService";

const meetingMock = vi.mocked(sessionMeetingService);

const db: FakeDb = (prismaMock as any).__db;
const client: any = prismaMock;

function seedPatient(id: number, currentStatus: string) {
  db.patients.set(id, {
    id,
    name: `Patient ${id}`,
    patientNumber: `P${String(id).padStart(4, "0")}`,
    currentStatus,
    therapistId: null,
    email: `patient${id}@example.test`,
  });
}

function seedTherapist(id: number) {
  db.teamMembers.set(id, { id, name: `Therapist ${id}`, employeeType: "psychologist", isActive: true, email: `therapist${id}@example.test` });
  // Wide-open availability (every day, all day) — this suite exercises lifecycle transitions, not
  // Capability 2's availability-aware scheduling, which has its own dedicated tests below and in
  // therapySessionsService.integration.test.ts.
  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
    db.availabilitySlots.push({ id: db.nextAvailabilityId++, teamMemberId: id, dayOfWeek, startTime: "00:00", endTime: "23:59" });
  }
}

describe("therapySessionsService — session-driven lifecycle transitions via Patient Lifecycle", () => {
  beforeEach(() => {
    db.reset();
    seedTherapist(1);
  });

  it("scheduling a discovery call for a 'created' patient advances them to discovery_scheduled", async () => {
    seedPatient(1, "created");

    await createSession({
      patient_id: 1,
      therapist_id: 1,
      session_date: "2026-09-01",
      start_time: "10:00",
      duration_mins: 30,
      session_type: "discovery",
    });

    expect(db.patients.get(1)!.currentStatus).toBe("discovery_scheduled");
    expect(db.statusLogs).toHaveLength(1);
    expect(db.statusLogs[0]).toMatchObject({
      previousStatus: "created",
      newStatus: "discovery_scheduled",
      changedByName: "system",
    });
  });

  it("scheduling a discovery call does NOT advance a patient who isn't 'created' (precondition gate)", async () => {
    seedPatient(2, "discovery_completed");

    await createSession({
      patient_id: 2,
      therapist_id: 1,
      session_date: "2026-09-01",
      start_time: "10:00",
      duration_mins: 30,
      session_type: "discovery",
    });

    expect(db.patients.get(2)!.currentStatus).toBe("discovery_completed");
    expect(db.statusLogs).toHaveLength(0);
  });

  it("scheduling a therapy session for a discovery_completed patient advances them to started_therapy", async () => {
    seedPatient(3, "discovery_completed");

    await createSession({
      patient_id: 3,
      therapist_id: 1,
      session_date: "2026-09-01",
      start_time: "11:00",
      duration_mins: 60,
      session_type: "therapy",
    });

    expect(db.patients.get(3)!.currentStatus).toBe("started_therapy");
    expect(db.statusLogs).toHaveLength(1);
    expect(db.statusLogs[0]).toMatchObject({
      previousStatus: "discovery_completed",
      newStatus: "started_therapy",
      changedByName: "system",
    });
  });

  it("scheduling a therapy session does NOT advance a patient who isn't discovery_completed (precondition gate)", async () => {
    seedPatient(4, "created");

    await createSession({
      patient_id: 4,
      therapist_id: 1,
      session_date: "2026-09-01",
      start_time: "12:00",
      duration_mins: 60,
      session_type: "therapy",
    });

    expect(db.patients.get(4)!.currentStatus).toBe("created");
    expect(db.statusLogs).toHaveLength(0);
  });

  it("completing a discovery call advances a discovery_scheduled patient to discovery_completed", async () => {
    seedPatient(5, "discovery_scheduled");
    const created = await createSession({
      patient_id: 5,
      therapist_id: 1,
      session_date: "2026-09-02",
      start_time: "09:00",
      duration_mins: 30,
      session_type: "discovery",
    });
    // Patient was already "discovery_scheduled", not "created", so createSession's own
    // auto-advance precondition didn't match and no log was written yet.
    expect(db.statusLogs).toHaveLength(0);

    await completeSession(created.id, { notes: "Intake complete." });

    expect(db.patients.get(5)!.currentStatus).toBe("discovery_completed");
    expect(db.statusLogs).toHaveLength(1);
    expect(db.statusLogs[0]).toMatchObject({
      previousStatus: "discovery_scheduled",
      newStatus: "discovery_completed",
      changedByName: "system",
    });
  });

  it("preserves sessionType when rescheduling (critical invariant)", async () => {
    seedPatient(6, "discovery_completed");
    const created = await createSession({
      patient_id: 6,
      therapist_id: 1,
      session_date: "2026-09-03",
      start_time: "09:00",
      duration_mins: 45,
      session_type: "discovery",
    });

    const rescheduled = await rescheduleSession(created.id, {
      session_date: "2026-09-04",
      start_time: "09:00",
      duration_mins: 45,
    });

    expect(rescheduled.sessionType).toBe("discovery");
  });

  it("rolls back the session creation if the lifecycle transition fails inside the same transaction", async () => {
    seedPatient(7, "created");
    const originalCreate = client.patientStatusLog.create;
    client.patientStatusLog.create = vi.fn().mockRejectedValueOnce(new Error("simulated audit-log failure"));

    await expect(
      createSession({
        patient_id: 7,
        therapist_id: 1,
        session_date: "2026-09-05",
        start_time: "10:00",
        duration_mins: 30,
        session_type: "discovery",
      })
    ).rejects.toThrow("simulated audit-log failure");

    client.patientStatusLog.create = originalCreate;

    // Neither the session nor the patient status change should have survived the rollback.
    expect(db.sessions.size).toBe(0);
    expect(db.patients.get(7)!.currentStatus).toBe("created");
  });
});

describe("therapySessionsService — availability-aware scheduling (SCH-04, SCH-20)", () => {
  beforeEach(() => {
    db.reset();
  });

  function seedNarrowTherapist(id: number, opts?: { isActive?: boolean }) {
    db.teamMembers.set(id, { id, name: `Therapist ${id}`, employeeType: "psychologist", isActive: opts?.isActive ?? true, email: `therapist${id}@example.test` });
  }

  it("rejects a session for a therapist with no configured availability", async () => {
    seedNarrowTherapist(10);
    seedPatient(10, "discovery_completed");

    await expect(
      createSession({
        patient_id: 10,
        therapist_id: 10,
        session_date: "2026-09-07", // a Monday
        start_time: "10:00",
        duration_mins: 30,
        session_type: "therapy",
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects a session on a day the therapist has no availability slot, even if another day does", async () => {
    seedNarrowTherapist(11);
    seedPatient(11, "discovery_completed");
    // Monday only, 09:00–17:00.
    db.availabilitySlots.push({ id: 1, teamMemberId: 11, dayOfWeek: 1, startTime: "09:00", endTime: "17:00" });

    // 2026-09-08 is a Tuesday — no slot configured for it.
    await expect(
      createSession({
        patient_id: 11,
        therapist_id: 11,
        session_date: "2026-09-08",
        start_time: "10:00",
        duration_mins: 30,
        session_type: "therapy",
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("allows a session that fits within the configured window", async () => {
    seedNarrowTherapist(12);
    seedPatient(12, "discovery_completed");
    db.availabilitySlots.push({ id: 1, teamMemberId: 12, dayOfWeek: 1, startTime: "09:00", endTime: "17:00" });

    const session = await createSession({
      patient_id: 12,
      therapist_id: 12,
      session_date: "2026-09-07", // Monday
      start_time: "10:00",
      duration_mins: 30,
      session_type: "therapy",
    });
    expect(session.status).toBe("upcoming");
  });

  it("rejects a session that crosses the availability window's end", async () => {
    seedNarrowTherapist(13);
    seedPatient(13, "discovery_completed");
    db.availabilitySlots.push({ id: 1, teamMemberId: 13, dayOfWeek: 1, startTime: "09:00", endTime: "17:00" });

    await expect(
      createSession({
        patient_id: 13,
        therapist_id: 13,
        session_date: "2026-09-07",
        start_time: "16:45",
        duration_mins: 30, // ends 17:15
        session_type: "therapy",
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects a session on a blocked-out date even within the weekly window", async () => {
    seedNarrowTherapist(14);
    seedPatient(14, "discovery_completed");
    db.availabilitySlots.push({ id: 1, teamMemberId: 14, dayOfWeek: 1, startTime: "09:00", endTime: "17:00" });
    db.blockouts.push({ id: 1, teamMemberId: 14, blockDate: new Date("2026-09-07T00:00:00.000Z"), reason: "Leave" });

    await expect(
      createSession({
        patient_id: 14,
        therapist_id: 14,
        session_date: "2026-09-07",
        start_time: "10:00",
        duration_mins: 30,
        session_type: "therapy",
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects booking an inactive therapist", async () => {
    seedNarrowTherapist(15, { isActive: false });
    seedPatient(15, "discovery_completed");
    db.availabilitySlots.push({ id: 1, teamMemberId: 15, dayOfWeek: 1, startTime: "09:00", endTime: "17:00" });

    await expect(
      createSession({
        patient_id: 15,
        therapist_id: 15,
        session_date: "2026-09-07",
        start_time: "10:00",
        duration_mins: 30,
        session_type: "therapy",
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("applies the same availability rules to a discovery call", async () => {
    seedNarrowTherapist(16);
    seedPatient(16, "created");
    db.availabilitySlots.push({ id: 1, teamMemberId: 16, dayOfWeek: 1, startTime: "09:00", endTime: "17:00" });

    await expect(
      createSession({
        patient_id: 16,
        therapist_id: 16,
        session_date: "2026-09-07",
        start_time: "18:00", // outside the window
        duration_mins: 30,
        session_type: "discovery",
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

// ── Google Calendar / Meet integration at the scheduling boundary (MEET-01) ────────────────────
//
// The critical invariant: scheduling is never contingent on Google. These tests exercise
// `createSession` end-to-end with the meeting boundary mocked, asserting that the session row is
// created and committed identically whether provisioning succeeds or fails.

describe("therapySessionsService — Google Meet integration (MEET-01)", () => {
  beforeEach(() => {
    db.reset();
    seedTherapist(1);
    vi.clearAllMocks();
  });

  it("returns the Meet link on the created session when provisioning succeeds", async () => {
    seedPatient(1, "started_therapy");
    meetingMock.provisionSessionMeeting.mockResolvedValueOnce({
      meetingProvider: "google_meet",
      googleEventId: "evt-1",
      meetingLink: "https://meet.google.com/abc-defg-hij",
      meetingStatus: "ACTIVE",
      meetingError: null,
    });

    const session = await createSession({
      patient_id: 1,
      therapist_id: 1,
      session_date: "2026-09-01",
      start_time: "10:00",
      duration_mins: 60,
      session_type: "therapy",
    });

    expect(session.meetingStatus).toBe("ACTIVE");
    expect(session.meetingLink).toBe("https://meet.google.com/abc-defg-hij");
    expect(db.sessions.get(session.id)!.status).toBe("upcoming");
  });

  it("still schedules the session when Google provisioning fails", async () => {
    seedPatient(2, "started_therapy");
    meetingMock.provisionSessionMeeting.mockResolvedValueOnce({
      meetingProvider: "google_meet",
      googleEventId: null,
      meetingLink: null,
      meetingStatus: "FAILED",
      meetingError: "Google Calendar event creation failed (403).",
    });

    const session = await createSession({
      patient_id: 2,
      therapist_id: 1,
      session_date: "2026-09-01",
      start_time: "12:00",
      duration_mins: 60,
      session_type: "therapy",
    });

    // The session exists, is upcoming, and the failure is recorded alongside it — not raised.
    expect(session.id).toBeDefined();
    expect(session.status).toBe("upcoming");
    expect(session.meetingStatus).toBe("FAILED");
    expect(db.sessions.get(session.id)).toBeDefined();
    expect(db.sessions.get(session.id)!.status).toBe("upcoming");
  });

  it("does not roll back the session when the meeting boundary throws unexpectedly", async () => {
    seedPatient(3, "started_therapy");
    meetingMock.provisionSessionMeeting.mockRejectedValueOnce(new Error("unexpected integration crash"));

    const session = await createSession({
      patient_id: 3,
      therapist_id: 1,
      session_date: "2026-09-01",
      start_time: "14:00",
      duration_mins: 60,
      session_type: "therapy",
    });

    expect(session.status).toBe("upcoming");
    expect(db.sessions.get(session.id)!.status).toBe("upcoming");
  });

  it("still advances patient lifecycle status when Google provisioning fails", async () => {
    seedPatient(4, "created");
    meetingMock.provisionSessionMeeting.mockResolvedValueOnce({
      meetingProvider: "google_meet",
      googleEventId: null,
      meetingLink: null,
      meetingStatus: "FAILED",
      meetingError: "Google Calendar is not configured.",
    });

    await createSession({
      patient_id: 4,
      therapist_id: 1,
      session_date: "2026-09-01",
      start_time: "16:00",
      duration_mins: 30,
      session_type: "discovery",
    });

    // The lifecycle transition committed with the session, independent of Google.
    expect(db.patients.get(4)!.currentStatus).toBe("discovery_scheduled");
  });

  it("marks the session PENDING inside the transaction and calls Google only after it commits", async () => {
    seedPatient(5, "started_therapy");
    let statusAtCallTime: string | null | undefined;
    meetingMock.provisionSessionMeeting.mockImplementationOnce(async (id: number) => {
      // By the time the boundary is invoked the row must already be committed and visible.
      statusAtCallTime = db.sessions.get(id)?.meetingStatus;
      return { meetingProvider: "google_meet", googleEventId: "evt-9", meetingLink: "https://meet.google.com/x", meetingStatus: "ACTIVE" as const, meetingError: null };
    });

    await createSession({
      patient_id: 5,
      therapist_id: 1,
      session_date: "2026-09-01",
      start_time: "18:00",
      duration_mins: 60,
      session_type: "therapy",
    });

    expect(statusAtCallTime).toBe("PENDING");
  });

  it("cancels the old calendar event and provisions a new one when a session is rescheduled", async () => {
    seedPatient(6, "started_therapy");
    meetingMock.provisionSessionMeeting.mockResolvedValue({
      meetingProvider: "google_meet",
      googleEventId: "evt-new",
      meetingLink: "https://meet.google.com/new-link",
      meetingStatus: "ACTIVE",
      meetingError: null,
    });

    const original = await createSession({
      patient_id: 6,
      therapist_id: 1,
      session_date: "2026-09-01",
      start_time: "20:00",
      duration_mins: 60,
      session_type: "therapy",
    });

    const rescheduled = await rescheduleSession(original.id, {
      session_date: "2026-09-02",
      start_time: "20:00",
      duration_mins: 60,
    });

    // Reschedule creates a *new* session row, so the calendar follows: the original's event is
    // cancelled and a fresh one is provisioned for the successor.
    expect(meetingMock.cancelSessionMeeting).toHaveBeenCalledWith(original.id);
    expect(meetingMock.provisionSessionMeeting).toHaveBeenCalledWith(rescheduled.id);
    expect(rescheduled.id).not.toBe(original.id);
    expect(db.sessions.get(original.id)!.status).toBe("rescheduled");
  });

  it("keeps the Numa cancellation when the Google cancellation fails", async () => {
    seedPatient(7, "started_therapy");
    const session = await createSession({
      patient_id: 7,
      therapist_id: 1,
      session_date: "2026-09-01",
      start_time: "22:00",
      duration_mins: 60,
      session_type: "therapy",
    });
    meetingMock.cancelSessionMeeting.mockRejectedValueOnce(new Error("Google cancellation failed (503)."));

    const cancelled = await cancelSession(session.id, { reason: "Patient unwell" });

    expect(cancelled.status).toBe("cancelled");
    expect(db.sessions.get(session.id)!.status).toBe("cancelled");
  });
});
