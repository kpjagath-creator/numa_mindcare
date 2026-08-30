// Real-database integration tests for Capability 1 (SCH-05 concurrency-safe booking) and
// Capability 2 (SCH-04/SCH-20 availability-aware scheduling).
//
// Unlike the rest of this suite, these tests run against a real PostgreSQL database (via the
// unmocked `../../lib/prisma` client) rather than the in-memory `fakePrisma.ts` double. They exist
// specifically because the concurrency invariant this capability adds — a partial Postgres
// EXCLUDE constraint — cannot be verified against a fake client: the fake double has no equivalent
// of Postgres's own locking/constraint-checking behavior, so a "both requests raced and only one
// won" assertion against it would prove nothing about the real constraint.
//
// These tests require `DATABASE_URL` to point at a reachable database (see backend/.env — this
// repo's local dev database, not production; never point this at Supabase production). If it
// can't be reached, the whole suite is skipped rather than failing noisily, so `npm test` still
// works in environments with no database wired up (documented limitation, per the task's own
// allowance for cases where a real concurrency test isn't practical).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import prisma from "../../lib/prisma";
import { createSession, rescheduleSession } from "../therapySessionsService";

let dbAvailable = false;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    // eslint-disable-next-line no-console
    console.warn(
      "[therapySessionsService.integration.test] DATABASE_URL is not reachable — skipping real-DB concurrency tests."
    );
  }
});

afterAll(async () => {
  if (dbAvailable) await prisma.$disconnect();
});

describe("therapySessionsService — real-database concurrency & availability (integration)", () => {
  let patientAId: number;
  let patientBId: number;
  let therapistId: number;
  let inactiveTherapistId: number;

  beforeEach(async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    // Clean slate — this is the local dev/test database only (backend/.env), never production.
    await prisma.therapySession.deleteMany({});
    await prisma.therapistBlockout.deleteMany({});
    await prisma.therapistAvailability.deleteMany({});
    await prisma.patientStatusLog.deleteMany({});
    await prisma.patient.deleteMany({});
    await prisma.teamMember.deleteMany({});

    const patientA = await prisma.patient.create({
      data: { patientNumber: "ITEST-A", name: "Patient A", mobile: "1", email: "a@test.com", age: 30, currentStatus: "discovery_completed" },
    });
    const patientB = await prisma.patient.create({
      data: { patientNumber: "ITEST-B", name: "Patient B", mobile: "2", email: "b@test.com", age: 31, currentStatus: "discovery_completed" },
    });
    const therapist = await prisma.teamMember.create({
      data: { employeeCode: "ITEST-T1", name: "Dr. Test", employeeType: "psychologist", isActive: true },
    });
    const inactiveTherapist = await prisma.teamMember.create({
      data: { employeeCode: "ITEST-T2", name: "Dr. Inactive", employeeType: "psychologist", isActive: false },
    });
    patientAId = patientA.id;
    patientBId = patientB.id;
    therapistId = therapist.id;
    inactiveTherapistId = inactiveTherapist.id;

    // A generous weekly availability window covering every day, 06:00–22:00, so tests can pick
    // any near-future date without caring which weekday it lands on.
    await prisma.therapistAvailability.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        teamMemberId: therapistId,
        dayOfWeek,
        startTime: "06:00",
        endTime: "22:00",
      })),
    });
  });

  // A fixed future date/time, safely inside the 06:00–22:00 window on every weekday.
  const SESSION_DATE = "2026-09-14"; // a Monday
  const START_TIME = "10:00";

  it("two concurrent create requests for the same therapist/slot — only one succeeds (SCH-05)", async () => {
    const attempt = (patientId: number) =>
      createSession({
        patient_id: patientId,
        therapist_id: therapistId,
        session_date: SESSION_DATE,
        start_time: START_TIME,
        duration_mins: 50,
        session_type: "therapy",
      });

    const results = await Promise.allSettled([attempt(patientAId), attempt(patientBId)]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ statusCode: 409 });

    const sessionsInDb = await prisma.therapySession.count({ where: { teamMemberId: therapistId, status: "upcoming" } });
    expect(sessionsInDb).toBe(1);
  });

  it("two concurrent create requests for the same patient/slot with different therapists — only one succeeds", async () => {
    const secondTherapist = await prisma.teamMember.create({
      data: { employeeCode: "ITEST-T3", name: "Dr. Second", employeeType: "psychologist", isActive: true },
    });
    await prisma.therapistAvailability.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        teamMemberId: secondTherapist.id,
        dayOfWeek,
        startTime: "06:00",
        endTime: "22:00",
      })),
    });

    const attempt = (therapistIdArg: number) =>
      createSession({
        patient_id: patientAId,
        therapist_id: therapistIdArg,
        session_date: SESSION_DATE,
        start_time: START_TIME,
        duration_mins: 50,
        session_type: "therapy",
      });

    const results = await Promise.allSettled([attempt(therapistId), attempt(secondTherapist.id)]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const sessionsInDb = await prisma.therapySession.count({ where: { patientId: patientAId, status: "upcoming" } });
    expect(sessionsInDb).toBe(1);
  });

  it("does not falsely conflict on back-to-back, non-overlapping boundary times", async () => {
    await createSession({
      patient_id: patientAId,
      therapist_id: therapistId,
      session_date: SESSION_DATE,
      start_time: "10:00",
      duration_mins: 50,
      session_type: "therapy",
    });

    // Starts exactly when the first one ends (10:50) — not an overlap.
    const second = await createSession({
      patient_id: patientBId,
      therapist_id: therapistId,
      session_date: SESSION_DATE,
      start_time: "10:50",
      duration_mins: 30,
      session_type: "therapy",
    });

    expect(second.status).toBe("upcoming");
  });

  it("allows booking a session exactly at the availability window boundary", async () => {
    await prisma.therapistAvailability.deleteMany({ where: { teamMemberId: therapistId } });
    const dayOfWeek = new Date(`${SESSION_DATE}T12:00:00`).getDay();
    await prisma.therapistAvailability.create({
      data: { teamMemberId: therapistId, dayOfWeek, startTime: "09:00", endTime: "10:50" },
    });

    // Session runs 10:00–10:50, exactly filling the remainder of the window.
    const session = await createSession({
      patient_id: patientAId,
      therapist_id: therapistId,
      session_date: SESSION_DATE,
      start_time: "10:00",
      duration_mins: 50,
      session_type: "therapy",
    });
    expect(session.status).toBe("upcoming");
  });

  it("rejects a session starting before the availability window", async () => {
    await prisma.therapistAvailability.deleteMany({ where: { teamMemberId: therapistId } });
    const dayOfWeek = new Date(`${SESSION_DATE}T12:00:00`).getDay();
    await prisma.therapistAvailability.create({
      data: { teamMemberId: therapistId, dayOfWeek, startTime: "12:00", endTime: "18:00" },
    });

    await expect(
      createSession({
        patient_id: patientAId,
        therapist_id: therapistId,
        session_date: SESSION_DATE,
        start_time: "10:00",
        duration_mins: 30,
        session_type: "therapy",
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects a session that crosses the availability window's end", async () => {
    await prisma.therapistAvailability.deleteMany({ where: { teamMemberId: therapistId } });
    const dayOfWeek = new Date(`${SESSION_DATE}T12:00:00`).getDay();
    await prisma.therapistAvailability.create({
      data: { teamMemberId: therapistId, dayOfWeek, startTime: "09:00", endTime: "17:00" },
    });

    await expect(
      createSession({
        patient_id: patientAId,
        therapist_id: therapistId,
        session_date: SESSION_DATE,
        start_time: "16:45",
        duration_mins: 30, // ends 17:15, past the 17:00 window end
        session_type: "therapy",
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects a session on a blocked-out date, even though it's within the weekly availability window", async () => {
    await prisma.therapistBlockout.create({
      data: { teamMemberId: therapistId, blockDate: new Date(`${SESSION_DATE}T00:00:00.000Z`), reason: "Leave" },
    });

    await expect(
      createSession({
        patient_id: patientAId,
        therapist_id: therapistId,
        session_date: SESSION_DATE,
        start_time: START_TIME,
        duration_mins: 30,
        session_type: "therapy",
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects booking an inactive therapist", async () => {
    await expect(
      createSession({
        patient_id: patientAId,
        therapist_id: inactiveTherapistId,
        session_date: SESSION_DATE,
        start_time: START_TIME,
        duration_mins: 30,
        session_type: "therapy",
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects rescheduling a session into an unavailable time (blocked-out date)", async () => {
    const original = await createSession({
      patient_id: patientAId,
      therapist_id: therapistId,
      session_date: SESSION_DATE,
      start_time: START_TIME,
      duration_mins: 30,
      session_type: "therapy",
    });

    const rescheduleDate = "2026-09-15";
    await prisma.therapistBlockout.create({
      data: { teamMemberId: therapistId, blockDate: new Date(`${rescheduleDate}T00:00:00.000Z`), reason: "Holiday" },
    });

    await expect(
      rescheduleSession(original.id, {
        session_date: rescheduleDate,
        start_time: "11:00",
        duration_mins: 30,
      })
    ).rejects.toMatchObject({ statusCode: 409 });

    // The original must remain untouched (still "upcoming") — the reschedule transaction must
    // roll back entirely, not partially mark the original as rescheduled.
    const stillOriginal = await prisma.therapySession.findUnique({ where: { id: original.id } });
    expect(stillOriginal?.status).toBe("upcoming");
  });
});
