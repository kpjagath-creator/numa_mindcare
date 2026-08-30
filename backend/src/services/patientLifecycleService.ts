// Patient Lifecycle capability — the single authoritative owner of Patient.currentStatus
// transitions: validating whether a transition is legal, mutating Patient.currentStatus, and
// writing the corresponding PatientStatusLog. Called by patientsService (manual, staff-initiated
// transitions) and therapySessionsService (automatic, session-event-driven transitions).
//
// This capability never opens its own transaction — callers always pass an existing Prisma
// transaction client so the transition participates atomically in the caller's business
// operation (session create/complete, or a manual status change).

import { Prisma } from "@prisma/client";
import type { Patient, PatientStatus } from "../types/index";

type LifecycleTx = Prisma.TransactionClient;

// Every currently valid Patient.currentStatus transition, regardless of whether it's triggered
// manually (Patients, PATCH /:id/status) or automatically by a session event (Scheduling). One
// map is the single source of truth for legality — see SPEC.md §3 / ARCHITECTURE.md §6.
const VALID_TRANSITIONS: Record<PatientStatus, PatientStatus[]> = {
  created: ["discovery_scheduled"],
  discovery_scheduled: ["discovery_completed"],
  discovery_completed: ["started_therapy"],
  started_therapy: ["schedule_completed", "therapy_paused", "patient_dropped"],
  therapy_paused: ["started_therapy", "patient_dropped"],
  schedule_completed: [],
  patient_dropped: [],
};

const therapistSelect = {
  id: true,
  name: true,
  employeeType: true,
  employeeCode: true,
} as const;

function makeNotFoundError(id: number): Error & { statusCode: number } {
  return Object.assign(new Error(`Patient with id ${id} not found`), { statusCode: 404 });
}

function makeInvalidTransitionError(
  from: PatientStatus,
  to: PatientStatus
): Error & { statusCode: number } {
  return Object.assign(
    new Error(`Cannot transition patient from "${from}" to "${to}" — not a valid lifecycle transition`),
    { statusCode: 409 }
  );
}

/**
 * Transitions a patient's lifecycle status. Validates the transition against the authoritative
 * transition map, updates Patient.currentStatus, and creates the corresponding PatientStatusLog —
 * atomically, inside the caller's transaction. Throws on an unknown patient or an illegal
 * transition; never opens its own transaction.
 */
export async function transitionPatientStatus(
  tx: LifecycleTx,
  patientId: number,
  toStatus: PatientStatus,
  changedByName: string,
  notes?: string | null
): Promise<Patient> {
  const patient = await tx.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw makeNotFoundError(patientId);

  const fromStatus = patient.currentStatus as PatientStatus;
  if (!VALID_TRANSITIONS[fromStatus]?.includes(toStatus)) {
    throw makeInvalidTransitionError(fromStatus, toStatus);
  }

  const updated = await tx.patient.update({
    where: { id: patientId },
    data: { currentStatus: toStatus },
    include: { therapist: { select: therapistSelect } },
  });

  await tx.patientStatusLog.create({
    data: {
      patientId,
      previousStatus: fromStatus,
      newStatus: toStatus,
      changedByName,
      notes: notes ?? null,
    },
  });

  return updated as unknown as Patient;
}
