// Service layer for therapy session operations.

import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { transitionPatientStatus } from "./patientLifecycleService";
import {
  cancelSessionMeeting,
  provisionSessionMeeting,
  retrySessionMeeting,
  MEETING_PROVIDER_GOOGLE,
  type SessionMeetingState,
} from "./sessionMeetingService";
import type { TherapySession, CreateSessionInput, CancelSessionInput, CompleteSessionInput, ListSessionsQuery, PaginatedResult, RescheduleSessionInput, NoShowSessionInput, UpdatePaymentStatusInput } from "../types/index";

// ── Shared include shape ───────────────────────────────────────────────────────

const sessionInclude = {
  patient: { select: { id: true, name: true, patientNumber: true } },
  teamMember: { select: { id: true, name: true, employeeType: true } },
} as const;

function makeConflictError(msg: string): Error & { statusCode: number } {
  return Object.assign(new Error(msg), { statusCode: 409 });
}

function makeNotFoundError(id: number): Error & { statusCode: number } {
  return Object.assign(new Error(`Therapy session with id ${id} not found`), { statusCode: 404 });
}

// Statuses excluded from conflict detection
const CONFLICT_EXCLUDED_STATUSES = ["cancelled", "rescheduled", "no_show"];

// ── Concurrency-safe booking (SCH-05) ──────────────────────────────────────────
//
// The findFirst overlap checks below are a fast, friendly first line of defense, but under
// Postgres READ COMMITTED they cannot alone prevent two concurrent requests from both reading
// "no conflict" before either commits. The actual invariant is enforced at the database level by
// partial EXCLUDE constraints (migration `add_session_overlap_exclusion`) on
// (patient_id, tsrange(start_time, end_time)) and (team_member_id, tsrange(start_time, end_time)),
// scoped to non-excluded statuses. A race that slips past the findFirst checks is caught here as
// the constraint violation surfaces from the `create` call, and translated into the same 409
// conflict shape the findFirst path already returns.
function isExclusionViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientUnknownRequestError &&
    /23P01|exclusion constraint/i.test(err.message)
  );
}

const RACE_CONFLICT_MESSAGE =
  "This slot was just booked by another request. Please choose a different time slot.";

// ── Google Calendar / Meet integration seam (MEET-01) ──────────────────────────
//
// Scheduling owns the session; `sessionMeetingService` owns the external calendar projection of
// it. Two rules hold at this seam and are the whole point of it:
//
//   1. Google is called only *after* the enclosing `prisma.$transaction` has committed — never
//      inside it. An external HTTP call inside a transaction would hold a database connection
//      open for the round-trip and make the session's existence contingent on Google being up.
//   2. Google failure never invalidates a scheduled session. The meeting functions are total by
//      contract (they record FAILED and resolve rather than throw); this helper is a second belt
//      so an unexpected throw still cannot propagate into the scheduling path and surface as a
//      failed booking for a session that is, in fact, booked.
function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function attachMeeting(
  session: TherapySession,
  run: () => Promise<SessionMeetingState>
): Promise<TherapySession> {
  try {
    return { ...session, ...(await run()) };
  } catch (err) {
    console.error(`[meeting] session ${session.id}: unexpected integration error`, err);
    return session;
  }
}

// ── Availability-aware scheduling (SCH-04, SCH-20) ─────────────────────────────
//
// A session may only be booked (or rescheduled) into a time that (a) the therapist is actively
// employed for, (b) falls entirely within one of their weekly recurring availability windows, and
// (c) is not on a one-off blocked-out date. This is enforced here, inside the same transaction as
// the conflict checks and the write, so it participates in the same atomicity/rollback guarantees
// — the frontend's own display of availability (AddSessionModal) is a UX aid only, never the
// authoritative check.
async function assertTherapistAvailable(
  tx: Prisma.TransactionClient,
  therapist: { id: number; name: string; isActive: boolean },
  startDt: Date,
  endDt: Date,
  sessionDateStr: string
): Promise<void> {
  if (!therapist.isActive) {
    throw makeConflictError(`${therapist.name} is not an active therapist and cannot be booked.`);
  }

  // A session that crosses midnight can never fit inside a single weekday's availability window.
  if (startDt.toDateString() !== endDt.toDateString()) {
    throw makeConflictError(
      `${therapist.name} is not available for a session that spans past midnight. Please choose a shorter duration or an earlier start time.`
    );
  }

  const dayOfWeek = startDt.getDay();
  const toHHMM = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const startStr = toHHMM(startDt);
  const endStr = toHHMM(endDt);

  const slots = await tx.therapistAvailability.findMany({ where: { teamMemberId: therapist.id, dayOfWeek } });
  const fitsAvailability = slots.some((slot) => slot.startTime <= startStr && slot.endTime >= endStr);
  if (!fitsAvailability) {
    throw makeConflictError(
      `${therapist.name} is not available at this time. Please choose a time within their scheduled availability.`
    );
  }

  const blockout = await tx.therapistBlockout.findFirst({
    where: { teamMemberId: therapist.id, blockDate: new Date(`${sessionDateStr}T00:00:00.000Z`) },
  });
  if (blockout) {
    throw makeConflictError(
      `${therapist.name} is unavailable on ${sessionDateStr}${blockout.reason ? ` (${blockout.reason})` : ""}.`
    );
  }
}

// ── createSession ──────────────────────────────────────────────────────────────

export async function createSession(input: CreateSessionInput): Promise<TherapySession> {
  const startDt = new Date(`${input.session_date}T${input.start_time}:00`);
  if (isNaN(startDt.getTime())) {
    throw Object.assign(new Error("Invalid date or time values"), { statusCode: 400 });
  }
  const endDt = new Date(startDt.getTime() + input.duration_mins * 60 * 1000);

  const session = await prisma.$transaction(async (tx) => {
    const patient = await tx.patient.findUnique({ where: { id: input.patient_id } });
    if (!patient) throw Object.assign(new Error(`Patient with id ${input.patient_id} not found`), { statusCode: 404 });

    const therapist = await tx.teamMember.findUnique({ where: { id: input.therapist_id } });
    if (!therapist) throw Object.assign(new Error(`Team member with id ${input.therapist_id} not found`), { statusCode: 404 });

    await assertTherapistAvailable(tx, therapist, startDt, endDt, input.session_date);

    // Patient conflict — exclude cancelled, rescheduled, and no_show sessions
    const patientConflict = await tx.therapySession.findFirst({
      where: {
        patientId: input.patient_id,
        status: { notIn: CONFLICT_EXCLUDED_STATUSES },
        startTime: { lt: endDt },
        endTime: { gt: startDt },
      },
      include: { teamMember: { select: { name: true } } },
    });
    if (patientConflict) {
      const startStr = patientConflict.startTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      const endStr = patientConflict.endTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      throw makeConflictError(
        `${patient.name} already has a session from ${startStr}–${endStr} with ${patientConflict.teamMember.name}. Please choose a different time slot.`
      );
    }

    // Therapist conflict — exclude cancelled, rescheduled, and no_show sessions
    const therapistConflict = await tx.therapySession.findFirst({
      where: {
        teamMemberId: input.therapist_id,
        status: { notIn: CONFLICT_EXCLUDED_STATUSES },
        startTime: { lt: endDt },
        endTime: { gt: startDt },
      },
      include: { patient: { select: { name: true } } },
    });
    if (therapistConflict) {
      const startStr = therapistConflict.startTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      const endStr = therapistConflict.endTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      throw makeConflictError(
        `${therapist.name} is already booked from ${startStr}–${endStr} with ${therapistConflict.patient.name}. Please choose a different time slot.`
      );
    }

    const sessionType = input.session_type ?? "therapy";

    let session;
    try {
      session = await tx.therapySession.create({
        data: {
          patientId: input.patient_id,
          teamMemberId: input.therapist_id,
          startTime: startDt,
          endTime: endDt,
          durationMins: input.duration_mins,
          sessionType,
          status: "upcoming",
          notes: input.notes ?? null,
          // Records the intent to provision a Google meeting. This is a local column write, not
          // a Google call — the API call itself happens after this transaction commits.
          meetingStatus: "PENDING",
          meetingProvider: MEETING_PROVIDER_GOOGLE,
        },
        include: sessionInclude,
      });
    } catch (err) {
      if (isExclusionViolation(err)) throw makeConflictError(RACE_CONFLICT_MESSAGE);
      throw err;
    }

    // Auto-advance patient status based on session type — Scheduling decides *when* to attempt a
    // transition (the sessionType/precondition check below); Patient Lifecycle owns whether the
    // transition is legal and performs the mutation + audit log.
    if (sessionType === "discovery" && patient.currentStatus === "created") {
      await transitionPatientStatus(
        tx,
        input.patient_id,
        "discovery_scheduled",
        "system",
        `Discovery call scheduled with ${therapist.name}.`
      );
    } else if (sessionType === "therapy" && patient.currentStatus === "discovery_completed") {
      await transitionPatientStatus(
        tx,
        input.patient_id,
        "started_therapy",
        "system",
        `First therapy session scheduled with ${therapist.name}.`
      );
    }

    return mapSession(session);
  });

  // Transaction has committed — the session is scheduled and stays scheduled regardless of what
  // Google does next.
  return attachMeeting(session, () => provisionSessionMeeting(session.id));
}

// ── listSessions ───────────────────────────────────────────────────────────────

export async function listSessions(query: ListSessionsQuery): Promise<PaginatedResult<TherapySession>> {
  const { page, limit, patient_id, therapist_id, date, status } = query;
  const skip = (page - 1) * limit;

  const where: any = {
    ...(patient_id !== undefined && { patientId: patient_id }),
    ...(therapist_id !== undefined && { teamMemberId: therapist_id }),
    ...(status !== undefined && { status }),
  };

  if (date) {
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59`);
    where.startTime = { gte: dayStart, lte: dayEnd };
  }

  const [total, items] = await Promise.all([
    prisma.therapySession.count({ where }),
    prisma.therapySession.findMany({
      where,
      skip,
      take: limit,
      orderBy: { startTime: "asc" },
      include: sessionInclude,
    }),
  ]);

  return {
    items: items.map(mapSession),
    pagination: { page, limit, total },
  };
}

// ── getSessionById ─────────────────────────────────────────────────────────────

export async function getSessionById(id: number): Promise<TherapySession> {
  const session = await prisma.therapySession.findUnique({
    where: { id },
    include: sessionInclude,
  });
  if (!session) throw makeNotFoundError(id);
  return mapSession(session);
}

// ── cancelSession ──────────────────────────────────────────────────────────────

export async function cancelSession(id: number, input: CancelSessionInput): Promise<TherapySession> {
  await getSessionById(id); // 404 guard
  const updated = await prisma.therapySession.update({
    where: { id },
    data: { status: "cancelled", cancelReason: input.reason },
    include: sessionInclude,
  });

  // The Numa cancellation is already committed and is never rolled back — if Google's
  // cancellation fails, the session stays cancelled and the integration records the failure for
  // a later retry.
  return attachMeeting(mapSession(updated), () => cancelSessionMeeting(id));
}

// ── completeSession ────────────────────────────────────────────────────────────

export async function completeSession(id: number, input: CompleteSessionInput): Promise<TherapySession> {
  const existing = await getSessionById(id); // 404 guard
  // Completing a session before its scheduled start (e.g. a same-day session completed via a
  // backdated correction) must never produce endTime < startTime — Capability 1's overlap
  // EXCLUDE constraint validates tsrange(startTime, endTime) on every write and rejects an
  // inverted range outright, surfacing what was previously a silent data-integrity gap.
  const now = new Date();
  const endTime = now < existing.startTime ? existing.startTime : now;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.therapySession.update({
      where: { id },
      data: {
        status: "completed",
        endTime,
        ...(input.charges !== undefined && { charges: input.charges }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
      include: sessionInclude,
    });

    // Auto-advance patient to discovery_completed when a discovery session is completed
    if (existing.sessionType === "discovery") {
      const patient = await tx.patient.findUnique({ where: { id: existing.patientId } });
      if (patient && patient.currentStatus === "discovery_scheduled") {
        await transitionPatientStatus(
          tx,
          existing.patientId,
          "discovery_completed",
          "system",
          "Discovery call completed."
        );
      }
    }

    return mapSession(updated);
  });
}

// ── deleteSession ──────────────────────────────────────────────────────────────

export async function deleteSession(id: number): Promise<void> {
  await getSessionById(id);

  // Delete is a hard delete, and the session row is the only place the external calendar event id
  // lives. So this is the one place where a Google failure legitimately blocks a Numa operation:
  // deleting the row while the event is still live would strand a real appointment on the
  // patient's and therapist's calendars with nothing left to cancel it from — unrecoverable, and
  // invisible to the clinic (MEET-02/M1).
  //
  // Note this does not weaken the scheduling invariant: that invariant protects sessions being
  // *created*, and nothing here can invalidate an existing session. Refusing a destructive
  // operation we cannot complete safely is the conservative direction.
  const meeting = await cancelSessionMeeting(id).catch((err) => {
    console.error(`[meeting] session ${id}: unexpected integration error on delete`, err);
    // Database-level failure — we genuinely don't know the event's state, so don't destroy the row.
    return { googleEventId: "unknown", meetingError: toMessage(err) } as Partial<SessionMeetingState>;
  });

  if (meeting.googleEventId) {
    throw Object.assign(
      new Error(
        "This session's Google Calendar event could not be cancelled, so the session was not deleted — " +
          "deleting it now would leave the meeting on the attendees' calendars with no way to remove it. " +
          "Retry the calendar cancellation from the session's Google Meet column, then delete."
      ),
      { statusCode: 409 }
    );
  }

  await prisma.therapySession.delete({ where: { id } });
}

// ── getTherapistSessions ───────────────────────────────────────────────────────

export async function getTherapistSessions(therapistId: number, date?: string): Promise<TherapySession[]> {
  const where: any = { teamMemberId: therapistId };
  if (date) {
    where.startTime = {
      gte: new Date(`${date}T00:00:00`),
      lte: new Date(`${date}T23:59:59`),
    };
  }
  const sessions = await prisma.therapySession.findMany({
    where,
    orderBy: { startTime: "asc" },
    include: sessionInclude,
  });
  return sessions.map(mapSession);
}

// ── rescheduleSession (F2) ─────────────────────────────────────────────────────

export async function rescheduleSession(id: number, input: RescheduleSessionInput): Promise<TherapySession> {
  const original = await getSessionById(id); // 404 guard

  // Only upcoming sessions can be rescheduled
  if (original.status !== "upcoming") {
    throw Object.assign(new Error("Only upcoming sessions can be rescheduled"), { statusCode: 400 });
  }

  // Compute new times
  const startDt = new Date(`${input.session_date}T${input.start_time}:00`);
  if (isNaN(startDt.getTime())) {
    throw Object.assign(new Error("Invalid date or time values"), { statusCode: 400 });
  }
  const endDt = new Date(startDt.getTime() + input.duration_mins * 60 * 1000);

  const newSession = await prisma.$transaction(async (tx) => {
    const therapist = await tx.teamMember.findUnique({ where: { id: original.teamMemberId } });
    if (!therapist) throw Object.assign(new Error(`Team member with id ${original.teamMemberId} not found`), { statusCode: 404 });

    await assertTherapistAvailable(tx, therapist, startDt, endDt, input.session_date);

    // Mark original as "rescheduled"
    await tx.therapySession.update({
      where: { id },
      data: { status: "rescheduled" },
    });

    // Conflict detection for the new session — exclude cancelled, rescheduled, and no_show sessions
    // Also exclude the original session (already marked rescheduled above, but belt-and-suspenders)
    const patientConflict = await tx.therapySession.findFirst({
      where: {
        patientId: original.patientId,
        id: { not: id },
        status: { notIn: CONFLICT_EXCLUDED_STATUSES },
        startTime: { lt: endDt },
        endTime: { gt: startDt },
      },
      include: { teamMember: { select: { name: true } } },
    });
    if (patientConflict) {
      const startStr = patientConflict.startTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      const endStr = patientConflict.endTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      throw makeConflictError(
        `${original.patient.name} already has a session from ${startStr}–${endStr} with ${patientConflict.teamMember.name}. Please choose a different time slot.`
      );
    }

    const therapistConflict = await tx.therapySession.findFirst({
      where: {
        teamMemberId: original.teamMemberId,
        id: { not: id },
        status: { notIn: CONFLICT_EXCLUDED_STATUSES },
        startTime: { lt: endDt },
        endTime: { gt: startDt },
      },
      include: { patient: { select: { name: true } } },
    });
    if (therapistConflict) {
      const startStr = therapistConflict.startTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      const endStr = therapistConflict.endTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      throw makeConflictError(
        `${original.therapist.name} is already booked from ${startStr}–${endStr} with ${therapistConflict.patient.name}. Please choose a different time slot.`
      );
    }

    // Create new session with rescheduledFromId = original.id
    let created;
    try {
      created = await tx.therapySession.create({
        data: {
          patientId: original.patientId,
          teamMemberId: original.teamMemberId,
          startTime: startDt,
          endTime: endDt,
          durationMins: input.duration_mins,
          sessionType: original.sessionType,
          status: "upcoming",
          notes: input.notes ?? original.notes ?? null,
          rescheduledFromId: original.id,
          // Local column write only — Google is called after this transaction commits.
          meetingStatus: "PENDING",
          meetingProvider: MEETING_PROVIDER_GOOGLE,
        },
        include: sessionInclude,
      });
    } catch (err) {
      if (isExclusionViolation(err)) throw makeConflictError(RACE_CONFLICT_MESSAGE);
      throw err;
    }

    return mapSession(created);
  });

  // Transaction has committed. Rescheduling here creates a *new* session row and leaves the
  // original as a real, queryable `rescheduled` record (see ARCHITECTURE.md §6.5) — so the
  // calendar must follow the same shape: cancel the original's event (Google notifies the
  // attendees) and provision a fresh one for the successor. Updating the original event in place
  // would leave two Numa sessions pointing at one Google event and break the 1:1 mapping that
  // cancellation and retry idempotency depend on.
  //
  // Ordering is deliberate: cancel first, so a failure to provision the new event can never
  // leave *two* live appointments on the attendees' calendars.
  await cancelSessionMeeting(original.id).catch((err) =>
    console.error(`[meeting] session ${original.id}: unexpected integration error on reschedule`, err)
  );

  return attachMeeting(newSession, () => provisionSessionMeeting(newSession.id));
}

// ── retryMeeting (MEET-01) ─────────────────────────────────────────────────────

/**
 * Admin-triggered retry of a failed Google Meet provisioning. Idempotent — never creates a second
 * calendar event for a session that already has one.
 */
export async function retryMeeting(id: number): Promise<TherapySession> {
  const session = await getSessionById(id); // 404 guard
  return attachMeeting(session, () => retrySessionMeeting(id));
}

// ── markNoShow (F3) ────────────────────────────────────────────────────────────

export async function markNoShow(id: number, input: NoShowSessionInput): Promise<TherapySession> {
  await getSessionById(id); // 404 guard
  const updated = await prisma.therapySession.update({
    where: { id },
    data: {
      status: "no_show",
      ...(input.no_show_fee !== undefined && { noShowFee: input.no_show_fee }),
    },
    include: sessionInclude,
  });
  return mapSession(updated);
}

// ── updatePaymentStatus (F8) ───────────────────────────────────────────────────

export async function updatePaymentStatus(id: number, input: UpdatePaymentStatusInput): Promise<TherapySession> {
  const session = await getSessionById(id); // 404 guard

  const updated = await prisma.$transaction(async (tx) => {
    const sess = await tx.therapySession.update({
      where: { id },
      data: { paymentStatus: input.payment_status },
      include: sessionInclude,
    });

    // Log at patient level
    await tx.patientStatusLog.create({
      data: {
        patientId: sess.patientId,
        previousStatus: session.paymentStatus ?? "unpaid",
        newStatus: `payment_${input.payment_status}`,
        changedByName: input.changed_by_name,
        notes: `Session #${id} payment status changed to ${input.payment_status}`,
      },
    });

    return sess;
  });

  return mapSession(updated);
}

// ── mapSession ─────────────────────────────────────────────────────────────────

function mapSession(raw: any): TherapySession {
  return {
    id: raw.id,
    patientId: raw.patientId,
    patient: {
      id: raw.patient.id,
      name: raw.patient.name,
      patientNumber: raw.patient.patientNumber,
    },
    teamMemberId: raw.teamMemberId,
    therapist: {
      id: raw.teamMember.id,
      name: raw.teamMember.name,
      employeeType: raw.teamMember.employeeType,
    },
    startTime: raw.startTime,
    endTime: raw.endTime,
    durationMins: raw.durationMins,
    sessionType: raw.sessionType ?? "therapy",
    status: raw.status,
    cancelReason: raw.cancelReason ?? null,
    charges: raw.charges !== null && raw.charges !== undefined ? Number(raw.charges) : null,
    paymentStatus: raw.paymentStatus,
    noShowFee: raw.noShowFee !== null && raw.noShowFee !== undefined ? Number(raw.noShowFee) : null,
    rescheduledFromId: raw.rescheduledFromId ?? null,
    notes: raw.notes,
    meetingProvider: raw.meetingProvider ?? null,
    googleEventId: raw.googleEventId ?? null,
    meetingLink: raw.meetingLink ?? null,
    meetingStatus: raw.meetingStatus ?? null,
    meetingError: raw.meetingError ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
