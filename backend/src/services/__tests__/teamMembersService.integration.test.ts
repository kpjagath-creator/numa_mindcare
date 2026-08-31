// Real-database integration tests for therapist email (MEET-01).
//
// Runs against a real PostgreSQL database (see therapySessionsService.integration.test.ts for the
// rationale). What needs a real database here is the *nullable column* behaviour: that a
// therapist row created before this feature — with no email — still reads, still updates, and can
// have an email added, none of which an in-memory double would prove. Skips gracefully if
// `DATABASE_URL` isn't reachable.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import prisma from "../../lib/prisma";
import * as teamMembersService from "../teamMembersService";

let dbAvailable = false;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    // eslint-disable-next-line no-console
    console.warn(
      "[teamMembersService.integration.test] DATABASE_URL is not reachable — skipping real-DB tests."
    );
  }
});

afterAll(async () => {
  if (dbAvailable) await prisma.$disconnect();
});

describe("teamMembersService — therapist email (integration)", () => {
  beforeEach(async (ctx) => {
    if (!dbAvailable) { ctx.skip(); return; }

    await prisma.therapySession.deleteMany({});
    await prisma.patientStatusLog.deleteMany({});
    await prisma.patientAssignment.deleteMany({});
    await prisma.patient.deleteMany({});
    await prisma.therapistAvailability.deleteMany({});
    await prisma.therapistBlockout.deleteMany({});
    await prisma.teamMember.deleteMany({});
  });

  it("stores the email when a new therapist is onboarded", async () => {
    const created = await teamMembersService.createTeamMember({
      name: "Dr. New Therapist",
      employee_type: "psychologist",
      email: "new.therapist@example.test",
    });

    expect(created.email).toBe("new.therapist@example.test");

    const reloaded = await teamMembersService.getTeamMemberById(created.id);
    expect(reloaded.email).toBe("new.therapist@example.test");
  });

  it("keeps a pre-existing therapist record with no email readable and listable", async () => {
    // Simulates a row created before MEET-01 — the column is nullable precisely so the migration
    // and every read path survive this.
    const legacy = await prisma.teamMember.create({
      data: { employeeCode: "TMTEST-L1", name: "Dr. Legacy", employeeType: "psychologist", isActive: true },
    });

    const fetched = await teamMembersService.getTeamMemberById(legacy.id);
    expect(fetched.email).toBeNull();

    const listed = await teamMembersService.listTeamMembers();
    expect(listed.find((m) => m.id === legacy.id)?.email).toBeNull();
  });

  it("lets an admin add an email to an existing therapist that has none", async () => {
    const legacy = await prisma.teamMember.create({
      data: { employeeCode: "TMTEST-L2", name: "Dr. Legacy Two", employeeType: "psychiatrist", isActive: true },
    });

    const updated = await teamMembersService.updateTeamMember(legacy.id, {
      email: "backfilled@example.test",
    });

    expect(updated.email).toBe("backfilled@example.test");
    expect(updated.name).toBe("Dr. Legacy Two");
  });

  it("lets an admin edit an existing email", async () => {
    const created = await teamMembersService.createTeamMember({
      name: "Dr. Edit Me",
      employee_type: "psychologist",
      email: "before@example.test",
    });

    const updated = await teamMembersService.updateTeamMember(created.id, {
      email: "after@example.test",
    });

    expect(updated.email).toBe("after@example.test");
  });

  it("leaves an existing email untouched when the update omits the field", async () => {
    const created = await teamMembersService.createTeamMember({
      name: "Dr. Partial",
      employee_type: "psychologist",
      email: "keep.me@example.test",
    });

    const updated = await teamMembersService.updateTeamMember(created.id, { name: "Dr. Partial Renamed" });

    expect(updated.name).toBe("Dr. Partial Renamed");
    expect(updated.email).toBe("keep.me@example.test");
  });

  it("updates a record without an email without being forced to invent one", async () => {
    const legacy = await prisma.teamMember.create({
      data: { employeeCode: "TMTEST-L3", name: "Dr. Legacy Three", employeeType: "psychologist", isActive: true },
    });

    const updated = await teamMembersService.updateTeamMember(legacy.id, { is_active: false });

    expect(updated.isActive).toBe(false);
    expect(updated.email).toBeNull();
  });

  it("404s when updating a therapist that does not exist", async () => {
    await expect(
      teamMembersService.updateTeamMember(999_999, { email: "nobody@example.test" })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
