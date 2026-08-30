// Real-database integration tests for Capability 3 (CLN-07 clinical note sign-off / immutability).
//
// Runs against a real PostgreSQL database (see therapySessionsService.integration.test.ts for why
// — the compare-and-swap sign transaction and cascade/foreign-key behavior for amendments are best
// verified against real Postgres rather than the in-memory fakePrisma double). Skips gracefully if
// `DATABASE_URL` isn't reachable.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import prisma from "../../lib/prisma";
import * as clinicalNotesService from "../clinicalNotesService";

let dbAvailable = false;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    // eslint-disable-next-line no-console
    console.warn(
      "[clinicalNotesService.integration.test] DATABASE_URL is not reachable — skipping real-DB tests."
    );
  }
});

afterAll(async () => {
  if (dbAvailable) await prisma.$disconnect();
});

describe("clinicalNotesService — sign-off / immutability (integration)", () => {
  let sessionId: number;

  beforeEach(async (ctx) => {
    if (!dbAvailable) { ctx.skip(); return; }

    await prisma.clinicalNoteAmendment.deleteMany({});
    await prisma.clinicalNote.deleteMany({});
    await prisma.therapySession.deleteMany({});
    await prisma.patientStatusLog.deleteMany({});
    await prisma.patient.deleteMany({});
    await prisma.teamMember.deleteMany({});

    const patient = await prisma.patient.create({
      data: { patientNumber: "CLNTEST-1", name: "Patient", mobile: "1", email: "p@test.com", age: 30, currentStatus: "started_therapy" },
    });
    const therapist = await prisma.teamMember.create({
      data: { employeeCode: "CLNTEST-T1", name: "Dr. Test", employeeType: "psychologist", isActive: true },
    });
    const session = await prisma.therapySession.create({
      data: {
        patientId: patient.id,
        teamMemberId: therapist.id,
        startTime: new Date("2026-09-10T10:00:00Z"),
        endTime: new Date("2026-09-10T11:00:00Z"),
        sessionType: "therapy",
        status: "completed",
      },
    });
    sessionId = session.id;
  });

  it("a draft note can be edited", async () => {
    const note = await clinicalNotesService.createNote(sessionId, { content: "Initial content", created_by_name: "Dr. Test" });
    expect(note.status).toBe("draft");

    const updated = await clinicalNotesService.updateNote(note.id, { content: "Edited content" });
    expect(updated.content).toBe("Edited content");
  });

  it("a draft note can be deleted", async () => {
    const note = await clinicalNotesService.createNote(sessionId, { content: "To delete", created_by_name: "Dr. Test" });
    await clinicalNotesService.deleteNote(note.id);
    await expect(prisma.clinicalNote.findUnique({ where: { id: note.id } })).resolves.toBeNull();
  });

  it("a draft note can be signed", async () => {
    const note = await clinicalNotesService.createNote(sessionId, { content: "Ready to sign", created_by_name: "Dr. Test" });
    const signed = await clinicalNotesService.signNote(note.id, { signed_by_name: "Dr. Test" });

    expect(signed.status).toBe("signed");
    expect(signed.signedByName).toBe("Dr. Test");
    expect(signed.signedAt).not.toBeNull();
    expect(signed.content).toBe("Ready to sign"); // signing never touches content
  });

  it("a signed note cannot be edited", async () => {
    const note = await clinicalNotesService.createNote(sessionId, { content: "Locked content", created_by_name: "Dr. Test" });
    await clinicalNotesService.signNote(note.id, { signed_by_name: "Dr. Test" });

    await expect(clinicalNotesService.updateNote(note.id, { content: "Tampered" })).rejects.toMatchObject({ statusCode: 409 });

    const stillOriginal = await prisma.clinicalNote.findUnique({ where: { id: note.id } });
    expect(stillOriginal?.content).toBe("Locked content");
  });

  it("a signed note cannot be deleted", async () => {
    const note = await clinicalNotesService.createNote(sessionId, { content: "Cannot delete me", created_by_name: "Dr. Test" });
    await clinicalNotesService.signNote(note.id, { signed_by_name: "Dr. Test" });

    await expect(clinicalNotesService.deleteNote(note.id)).rejects.toMatchObject({ statusCode: 409 });
    await expect(prisma.clinicalNote.findUnique({ where: { id: note.id } })).resolves.not.toBeNull();
  });

  it("an amendment preserves the original signed content and records author/time", async () => {
    const note = await clinicalNotesService.createNote(sessionId, { content: "Original signed content", created_by_name: "Dr. Test" });
    await clinicalNotesService.signNote(note.id, { signed_by_name: "Dr. Test" });

    const before = new Date();
    const amended = await clinicalNotesService.addAmendment(note.id, {
      content: "Follow-up clarification",
      created_by_name: "Dr. Second",
    });

    expect(amended.content).toBe("Original signed content"); // original untouched
    expect(amended.amendments).toHaveLength(1);
    expect(amended.amendments[0]).toMatchObject({ content: "Follow-up clarification", createdByName: "Dr. Second" });
    expect(amended.amendments[0].createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("an amendment cannot be added to a draft note (must be signed first)", async () => {
    const note = await clinicalNotesService.createNote(sessionId, { content: "Still a draft", created_by_name: "Dr. Test" });

    await expect(
      clinicalNotesService.addAmendment(note.id, { content: "Too early", created_by_name: "Dr. Test" })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("two concurrent sign requests for the same note — only one succeeds", async () => {
    const note = await clinicalNotesService.createNote(sessionId, { content: "Race me", created_by_name: "Dr. Test" });

    const results = await Promise.allSettled([
      clinicalNotesService.signNote(note.id, { signed_by_name: "Dr. A" }),
      clinicalNotesService.signNote(note.id, { signed_by_name: "Dr. B" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const final = await prisma.clinicalNote.findUnique({ where: { id: note.id } });
    expect(final?.status).toBe("signed");
    // Exactly one of the two names won — the loser's write never applied.
    expect(["Dr. A", "Dr. B"]).toContain(final?.signedByName);
  });

  it("a failed sign transaction leaves the note unchanged (rollback)", async () => {
    const note = await clinicalNotesService.createNote(sessionId, { content: "Rollback me", created_by_name: "Dr. Test" });

    // Sign it once so the second attempt is guaranteed to fail deterministically...
    await clinicalNotesService.signNote(note.id, { signed_by_name: "Dr. Test" });
    const before = await prisma.clinicalNote.findUnique({ where: { id: note.id } });

    await expect(clinicalNotesService.signNote(note.id, { signed_by_name: "Dr. Retry" })).rejects.toMatchObject({ statusCode: 409 });

    const after = await prisma.clinicalNote.findUnique({ where: { id: note.id } });
    expect(after).toEqual(before); // nothing changed, including signedByName/signedAt
  });
});
