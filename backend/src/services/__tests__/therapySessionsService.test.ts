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

import prismaMock from "../../lib/prisma";
import { createSession, completeSession, rescheduleSession } from "../therapySessionsService";

const db: FakeDb = (prismaMock as any).__db;
const client: any = prismaMock;

function seedPatient(id: number, currentStatus: string) {
  db.patients.set(id, {
    id,
    name: `Patient ${id}`,
    patientNumber: `P${String(id).padStart(4, "0")}`,
    currentStatus,
    therapistId: null,
  });
}

function seedTherapist(id: number) {
  db.teamMembers.set(id, { id, name: `Therapist ${id}`, employeeType: "psychologist", isActive: true });
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
    db.teamMembers.set(id, { id, name: `Therapist ${id}`, employeeType: "psychologist", isActive: opts?.isActive ?? true });
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
