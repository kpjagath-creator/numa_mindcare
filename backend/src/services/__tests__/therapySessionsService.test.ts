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
  db.teamMembers.set(id, { id, name: `Therapist ${id}`, employeeType: "psychologist" });
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
