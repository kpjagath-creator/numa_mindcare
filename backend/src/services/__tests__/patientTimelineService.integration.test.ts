// Real-database integration tests for Capability 4 (PAT-10 staff patient timeline).
//
// Runs against the same local Postgres database as the other *.integration.test.ts files (see
// therapySessionsService.integration.test.ts for rationale); skips gracefully if unreachable.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import prisma from "../../lib/prisma";
import { getPatientTimeline } from "../patientTimelineService";
import { updatePatientTherapist } from "../patientsService";
import { createSession, completeSession } from "../therapySessionsService";
import { createNote, signNote } from "../clinicalNotesService";
import { updatePaymentStatus } from "../therapySessionsService";

let dbAvailable = false;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    // eslint-disable-next-line no-console
    console.warn("[patientTimelineService.integration.test] DATABASE_URL is not reachable — skipping real-DB tests.");
  }
});

afterAll(async () => {
  if (dbAvailable) await prisma.$disconnect();
});

describe("patientTimelineService — unified chronological timeline (integration)", () => {
  let patientId: number;
  let therapistId: number;

  beforeEach(async (ctx) => {
    if (!dbAvailable) { ctx.skip(); return; }

    await prisma.clinicalNoteAmendment.deleteMany({});
    await prisma.clinicalNote.deleteMany({});
    await prisma.therapySession.deleteMany({});
    await prisma.therapistAvailability.deleteMany({});
    await prisma.patientStatusLog.deleteMany({});
    await prisma.patient.deleteMany({});
    await prisma.teamMember.deleteMany({});

    const patient = await prisma.patient.create({
      data: { patientNumber: "TLTEST-1", name: "Timeline Patient", mobile: "1", email: "tl@test.com", age: 28, currentStatus: "created" },
    });
    const therapist = await prisma.teamMember.create({
      data: { employeeCode: "TLTEST-T1", name: "Dr. Timeline", employeeType: "psychologist", isActive: true },
    });
    await prisma.therapistAvailability.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ teamMemberId: therapist.id, dayOfWeek, startTime: "06:00", endTime: "22:00" })),
    });
    patientId = patient.id;
    therapistId = therapist.id;

    // Registration itself writes a PatientStatusLog ("created") via createPatient — but this test
    // seeds the patient directly (not through the service) to control the exact fixture, so add
    // that initial log explicitly to mirror real registration.
    await prisma.patientStatusLog.create({
      data: { patientId, previousStatus: null, newStatus: "created", changedByName: "system", notes: "Patient registered." },
    });
  });

  it("composes lifecycle, assignment, session, payment, and clinical-note events into one ordered list", async () => {
    await updatePatientTherapist(patientId, { therapist_id: therapistId, changed_by_name: "Front Desk" });

    const discovery = await createSession({
      patient_id: patientId,
      therapist_id: therapistId,
      session_date: "2026-09-14",
      start_time: "10:00",
      duration_mins: 30,
      session_type: "discovery",
    });
    await completeSession(discovery.id, { notes: "Intake complete." });

    // Scheduling a therapy session for a discovery_completed patient auto-advances them to
    // started_therapy — the automatic-transition path, distinct from the manual one covered
    // elsewhere in this suite.
    const therapy = await createSession({
      patient_id: patientId,
      therapist_id: therapistId,
      session_date: "2026-09-15",
      start_time: "11:00",
      duration_mins: 50,
      session_type: "therapy",
    });
    await updatePaymentStatus(therapy.id, { payment_status: "paid", changed_by_name: "Billing" });

    const note = await createNote(discovery.id, { content: "Discovery notes here.", created_by_name: "Dr. Timeline" });
    await signNote(note.id, { signed_by_name: "Dr. Timeline" });

    const timeline = await getPatientTimeline(patientId);
    const types = new Set(timeline.map((e) => e.type));

    expect(types).toEqual(new Set(["lifecycle", "assignment", "payment", "session", "clinical_note"]));

    // Ordering is strictly non-increasing by timestamp.
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i - 1].timestamp.getTime()).toBeGreaterThanOrEqual(timeline[i].timestamp.getTime());
    }

    const noteEntry = timeline.find((e) => e.type === "clinical_note");
    expect(noteEntry?.description).toContain("signed");
    expect(noteEntry?.link).toMatchObject({ resource: "clinical_note", id: note.id, sessionId: discovery.id });

    const sessionEntry = timeline.find((e) => e.type === "session" && e.link?.id === therapy.id);
    expect(sessionEntry?.link).toMatchObject({ resource: "therapy_session", id: therapy.id });

    const paymentEntry = timeline.find((e) => e.type === "payment");
    expect(paymentEntry?.actor).toBe("Billing");

    const assignmentEntry = timeline.find((e) => e.type === "assignment");
    expect(assignmentEntry?.actor).toBe("Front Desk");
  });

  it("orders entries with identical timestamps deterministically across repeated calls", async () => {
    const sameInstant = new Date("2026-09-20T09:00:00.000Z");
    await prisma.patientStatusLog.createMany({
      data: [
        { patientId, previousStatus: "created", newStatus: "discovery_scheduled", changedByName: "system", createdAt: sameInstant },
        { patientId, previousStatus: null, newStatus: "payment_paid", changedByName: "Billing", notes: "test", createdAt: sameInstant },
      ],
    });

    const first = await getPatientTimeline(patientId);
    const second = await getPatientTimeline(patientId);

    expect(first.map((e) => e.id)).toEqual(second.map((e) => e.id));

    const tiedIds = first.filter((e) => e.timestamp.getTime() === sameInstant.getTime()).map((e) => e.id);
    expect(tiedIds.length).toBeGreaterThanOrEqual(2);
    // lifecycle (priority 0) must sort before payment (priority 2) when timestamps tie.
    const lifecycleIdx = first.findIndex((e) => e.timestamp.getTime() === sameInstant.getTime() && e.type === "lifecycle");
    const paymentIdx = first.findIndex((e) => e.timestamp.getTime() === sameInstant.getTime() && e.type === "payment");
    expect(lifecycleIdx).toBeLessThan(paymentIdx);
  });

  it("throws a 404 for an unknown patient", async () => {
    await expect(getPatientTimeline(999999)).rejects.toMatchObject({ statusCode: 404 });
  });
});
