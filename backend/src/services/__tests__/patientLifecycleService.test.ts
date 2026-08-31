import { describe, it, expect, beforeEach } from "vitest";
import { FakeDb, createFakeClient } from "./fakePrisma";
import { transitionPatientStatus } from "../patientLifecycleService";

describe("transitionPatientStatus (Patient Lifecycle capability)", () => {
  let db: FakeDb;
  let tx: any;

  beforeEach(() => {
    db = new FakeDb();
    tx = createFakeClient(db);
  });

  function seedPatient(id: number, currentStatus: string) {
    db.patients.set(id, {
      id,
      name: `Patient ${id}`,
      patientNumber: `P${String(id).padStart(4, "0")}`,
      currentStatus,
      therapistId: null,
    email: "patient@example.test",
    });
  }

  it("allows every currently valid manual transition", async () => {
    seedPatient(1, "started_therapy");
    await transitionPatientStatus(tx, 1, "schedule_completed", "staff");
    expect(db.patients.get(1)!.currentStatus).toBe("schedule_completed");

    seedPatient(2, "started_therapy");
    await transitionPatientStatus(tx, 2, "therapy_paused", "staff");
    expect(db.patients.get(2)!.currentStatus).toBe("therapy_paused");

    seedPatient(3, "started_therapy");
    await transitionPatientStatus(tx, 3, "patient_dropped", "staff");
    expect(db.patients.get(3)!.currentStatus).toBe("patient_dropped");

    seedPatient(4, "therapy_paused");
    await transitionPatientStatus(tx, 4, "started_therapy", "staff");
    expect(db.patients.get(4)!.currentStatus).toBe("started_therapy");

    seedPatient(5, "therapy_paused");
    await transitionPatientStatus(tx, 5, "patient_dropped", "staff");
    expect(db.patients.get(5)!.currentStatus).toBe("patient_dropped");
  });

  it("allows every currently valid automatic transition", async () => {
    seedPatient(6, "created");
    await transitionPatientStatus(tx, 6, "discovery_scheduled", "system");
    expect(db.patients.get(6)!.currentStatus).toBe("discovery_scheduled");

    seedPatient(7, "discovery_scheduled");
    await transitionPatientStatus(tx, 7, "discovery_completed", "system");
    expect(db.patients.get(7)!.currentStatus).toBe("discovery_completed");

    seedPatient(8, "discovery_completed");
    await transitionPatientStatus(tx, 8, "started_therapy", "system");
    expect(db.patients.get(8)!.currentStatus).toBe("started_therapy");
  });

  it("rejects representative invalid transitions", async () => {
    seedPatient(9, "created");
    await expect(transitionPatientStatus(tx, 9, "started_therapy", "staff")).rejects.toMatchObject({
      statusCode: 409,
    });

    seedPatient(10, "schedule_completed");
    await expect(transitionPatientStatus(tx, 10, "started_therapy", "staff")).rejects.toMatchObject({
      statusCode: 409,
    });

    seedPatient(11, "patient_dropped");
    await expect(transitionPatientStatus(tx, 11, "started_therapy", "staff")).rejects.toMatchObject({
      statusCode: 409,
    });

    seedPatient(12, "discovery_scheduled");
    await expect(transitionPatientStatus(tx, 12, "started_therapy", "staff")).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("throws a 404 for an unknown patient", async () => {
    await expect(transitionPatientStatus(tx, 999, "discovery_scheduled", "staff")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("creates a PatientStatusLog with previousStatus, newStatus, changedByName, and notes on success", async () => {
    seedPatient(13, "created");
    await transitionPatientStatus(tx, 13, "discovery_scheduled", "front-desk", "booked over the phone");
    expect(db.statusLogs).toHaveLength(1);
    expect(db.statusLogs[0]).toMatchObject({
      patientId: 13,
      previousStatus: "created",
      newStatus: "discovery_scheduled",
      changedByName: "front-desk",
      notes: "booked over the phone",
    });
  });

  it("does not mutate the patient or write a log when the transition is invalid", async () => {
    seedPatient(14, "created");
    await expect(transitionPatientStatus(tx, 14, "started_therapy", "staff")).rejects.toThrow();
    expect(db.patients.get(14)!.currentStatus).toBe("created");
    expect(db.statusLogs).toHaveLength(0);
  });

  // Caveat: FakeDb has no real MVCC/row-locking — its operations are synchronous JS, so this
  // doesn't reproduce Postgres's actual interleaving or prove anything about real concurrent
  // connections. What it *does* verify is the compare-and-swap contract the fix relies on: the
  // update is conditioned on the status each call actually validated against, not just the id, so
  // two conflicting transitions racing off the same starting state can't both silently succeed.
  // Confidence in the real-database behavior comes from Postgres's documented Read Committed
  // semantics (a blocked UPDATE re-evaluates its WHERE clause against the row as of the
  // transaction that unblocked it), not from this test.
  it("under two conflicting concurrent transitions from the same state, exactly one succeeds and the log/state stay consistent", async () => {
    seedPatient(15, "started_therapy");

    const [toPaused, toDropped] = await Promise.allSettled([
      transitionPatientStatus(tx, 15, "therapy_paused", "staff-a"),
      transitionPatientStatus(tx, 15, "patient_dropped", "staff-b"),
    ]);

    const outcomes = [toPaused.status, toDropped.status];
    expect(outcomes.filter((s) => s === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((s) => s === "rejected")).toHaveLength(1);

    const rejected = toPaused.status === "rejected" ? toPaused : (toDropped as PromiseRejectedResult);
    expect(rejected.reason).toMatchObject({ statusCode: 409 });

    // Final state matches whichever transition actually won, and the log has exactly one entry —
    // no duplicate/inconsistent history from the loser.
    const finalStatus = db.patients.get(15)!.currentStatus;
    expect(["therapy_paused", "patient_dropped"]).toContain(finalStatus);
    expect(db.statusLogs).toHaveLength(1);
    expect(db.statusLogs[0]).toMatchObject({ patientId: 15, previousStatus: "started_therapy", newStatus: finalStatus });
  });
});
