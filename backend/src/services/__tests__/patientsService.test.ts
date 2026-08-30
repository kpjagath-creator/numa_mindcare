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
import { updatePatientStatus } from "../patientsService";

const db: FakeDb = (prismaMock as any).__db;

describe("patientsService.updatePatientStatus (manual lifecycle transitions via Patient Lifecycle)", () => {
  beforeEach(() => {
    db.reset();
    db.patients.set(1, {
      id: 1,
      name: "Alex",
      patientNumber: "P0001",
      currentStatus: "started_therapy",
      therapistId: null,
    });
  });

  it("applies a valid manual transition and writes an audit log", async () => {
    const updated = await updatePatientStatus(1, {
      new_status: "therapy_paused",
      changed_by_name: "staff",
      notes: "taking a break",
    });

    expect(updated.currentStatus).toBe("therapy_paused");
    expect(db.statusLogs).toHaveLength(1);
    expect(db.statusLogs[0]).toMatchObject({
      previousStatus: "started_therapy",
      newStatus: "therapy_paused",
      changedByName: "staff",
      notes: "taking a break",
    });
  });

  it("rejects an illegal manual transition and leaves the patient unchanged", async () => {
    await expect(
      updatePatientStatus(1, { new_status: "discovery_completed", changed_by_name: "staff" })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(db.patients.get(1)!.currentStatus).toBe("started_therapy");
    expect(db.statusLogs).toHaveLength(0);
  });
});
