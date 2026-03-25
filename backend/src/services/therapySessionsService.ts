// Service layer for therapy session operations.

import prisma from "../lib/prisma";
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

// ── createSession ──────────────────────────────────────────────────────────────

export async function createSession(input: CreateSessionInput): Promise<TherapySession> {
  const startDt = new Date(`${input.session_date}T${input.start_time}:00`);
  if (isNaN(startDt.getTime())) {
    throw Object.assign(new Error("Invalid date or time values"), { statusCode: 400 });
  }
  const endDt = new Date(startDt.getTime() + input.duration_mins * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const patient = await tx.patient.findUnique({ where: { id: input.patient_id } });
    if (!patient) throw Object.assign(new Error(`Patient with id ${input.patient_id} not found`), { statusCode: 404 });

    const therapist = await tx.teamMember.findUnique({ where: { id: input.therapist_id } });
    if (!therapist) throw Object.assign(new Error(`Team member with id ${input.therapist_id} not found`), { statusCode: 404 });

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

    const session = await tx.therapySession.create({
      data: {
        patientId: input.patient_id,
        teamMemberId: input.therapist_id,
        startTime: startDt,
        endTime: endDt,
        durationMins: input.duration_mins,
        sessionType,
        status: "upcoming",
        notes: input.notes ?? null,
      },
      include: sessionInclude,
    });

    // Auto-advance patient status based on session type
    if (sessionType === "discovery" && patient.currentStatus === "created") {
      await tx.patient.update({ where: { id: input.patient_id }, data: { currentStatus: "discovery_scheduled" } });
      await tx.patientStatusLog.create({
        data: {
          patientId: input.patient_id,
          previousStatus: "created",
          newStatus: "discovery_scheduled",
          changedByName: "system",
          notes: `Discovery call scheduled with ${therapist.name}.`,
        },
      });
    } else if (sessionType === "therapy" && patient.currentStatus === "discovery_completed") {
      await tx.patient.update({ where: { id: input.patient_id }, data: { currentStatus: "started_therapy" } });
      await tx.patientStatusLog.create({
        data: {
          patientId: input.patient_id,
          previousStatus: "discovery_completed",
          newStatus: "started_therapy",
          changedByName: "system",
          notes: `First therapy session scheduled with ${therapist.name}.`,
        },
      });
    }

    return mapSession(session);
  });
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
  return mapSession(updated);
}

// ── completeSession ────────────────────────────────────────────────────────────

export async function completeSession(id: number, input: CompleteSessionInput): Promise<TherapySession> {
  const existing = await getSessionById(id); // 404 guard
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.therapySession.update({
      where: { id },
      data: {
        status: "completed",
        endTime: now,
        ...(input.charges !== undefined && { charges: input.charges }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
      include: sessionInclude,
    });

    // Auto-advance patient to discovery_completed when a discovery session is completed
    if (existing.sessionType === "discovery") {
      const patient = await tx.patient.findUnique({ where: { id: existing.patientId } });
      if (patient && patient.currentStatus === "discovery_scheduled") {
        await tx.patient.update({ where: { id: existing.patientId }, data: { currentStatus: "discovery_completed" } });
        await tx.patientStatusLog.create({
          data: {
            patientId: existing.patientId,
            previousStatus: "discovery_scheduled",
            newStatus: "discovery_completed",
            changedByName: "system",
            notes: "Discovery call completed.",
          },
        });
      }
    }

    return mapSession(updated);
  });
}

// ── deleteSession ──────────────────────────────────────────────────────────────

export async function deleteSession(id: number): Promise<void> {
  await getSessionById(id);
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

  return prisma.$transaction(async (tx) => {
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
    const newSession = await tx.therapySession.create({
      data: {
        patientId: original.patientId,
        teamMemberId: original.teamMemberId,
        startTime: startDt,
        endTime: endDt,
        durationMins: input.duration_mins,
        status: "upcoming",
        notes: input.notes ?? original.notes ?? null,
        rescheduledFromId: original.id,
      },
      include: sessionInclude,
    });

    return mapSession(newSession);
  });
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
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
