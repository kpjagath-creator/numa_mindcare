// Service layer for all patient-related database operations.

import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { generatePatientNumber } from "../utils/generateCodes";
import type {
  Patient,
  PatientStatusLog,
  PaginatedResult,
  CreatePatientInput,
  UpdateStatusInput,
  UpdateTherapistInput,
  UpdatePatientInfoInput,
  ListPatientsQuery,
} from "../types/index";

// ── Helpers ────────────────────────────────────────────────────────────────────

const therapistSelect = {
  id: true,
  name: true,
  employeeType: true,
  employeeCode: true,
} as const;

function makeNotFoundError(id: number): Error & { statusCode: number } {
  return Object.assign(new Error(`Patient with id ${id} not found`), {
    statusCode: 404,
  });
}

// ── createPatient ──────────────────────────────────────────────────────────────

export async function createPatient(input: CreatePatientInput): Promise<Patient> {
  try {
    return await prisma.$transaction(async (tx) => {
      const patientNumber = await generatePatientNumber(tx);

      const patient = await tx.patient.create({
        data: {
          patientNumber,
          name: input.name,
          mobile: input.mobile,
          email: input.email,
          age: input.age,
          source: input.source ?? null,
          referredBy: input.referred_by ?? null,
          currentStatus: "created",
          therapistId: input.therapist_id ?? null,
        },
        include: { therapist: { select: therapistSelect } },
      });

      const therapistNote = input.therapist_id
        ? ` Therapist assigned: ${patient.therapist?.name ?? "Unknown"}.`
        : "";

      await tx.patientStatusLog.create({
        data: {
          patientId: patient.id,
          previousStatus: null,
          newStatus: "created",
          changedByName: "system",
          notes: `Patient registered.${therapistNote}`,
        },
      });

      return patient as unknown as Patient;
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      Array.isArray(err.meta?.target) &&
      (err.meta.target as string[]).includes("patient_number")
    ) {
      throw Object.assign(
        new Error("Patient number conflict — please retry the request"),
        { statusCode: 409 }
      );
    }
    throw err;
  }
}

// ── listPatients ───────────────────────────────────────────────────────────────

export async function listPatients(
  query: ListPatientsQuery
): Promise<PaginatedResult<Patient>> {
  const { page, limit, search, status } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.PatientWhereInput = {
    ...(status !== undefined && { currentStatus: status }),
    ...(search !== undefined &&
      search.trim() !== "" && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { mobile: { contains: search, mode: "insensitive" } },
        ],
      }),
  };

  const [total, items] = await Promise.all([
    prisma.patient.count({ where }),
    prisma.patient.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { therapist: { select: therapistSelect } },
    }),
  ]);

  return {
    items: items as unknown as Patient[],
    pagination: { page, limit, total },
  };
}

// ── getPatientById ─────────────────────────────────────────────────────────────

export async function getPatientById(id: number): Promise<Patient> {
  const patient = await prisma.patient.findUnique({
    where: { id },
    include: { therapist: { select: therapistSelect } },
  });
  if (patient === null) throw makeNotFoundError(id);
  return patient as unknown as Patient;
}

// ── updatePatientStatus ────────────────────────────────────────────────────────

export async function updatePatientStatus(
  id: number,
  input: UpdateStatusInput
): Promise<Patient> {
  const existing = await getPatientById(id);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.patient.update({
      where: { id },
      data: { currentStatus: input.new_status },
      include: { therapist: { select: therapistSelect } },
    });

    await tx.patientStatusLog.create({
      data: {
        patientId: id,
        previousStatus: existing.currentStatus,
        newStatus: input.new_status,
        changedByName: input.changed_by_name,
        notes: input.notes ?? null,
      },
    });

    return updated as unknown as Patient;
  });
}

// ── updatePatientTherapist ─────────────────────────────────────────────────────

export async function updatePatientTherapist(
  id: number,
  input: UpdateTherapistInput
): Promise<Patient> {
  const existing = await getPatientById(id);

  const newTherapist = input.therapist_id
    ? await prisma.teamMember.findUnique({ where: { id: input.therapist_id } })
    : null;

  if (input.therapist_id && !newTherapist) {
    throw Object.assign(
      new Error(`Team member with id ${input.therapist_id} not found`),
      { statusCode: 404 }
    );
  }

  const oldName = existing.therapist?.name ?? null;
  const newName = newTherapist?.name ?? null;

  let notes: string;
  if (!oldName && newName) {
    notes = `Therapist assigned: ${newName}`;
  } else if (oldName && !newName) {
    notes = `Therapist removed (was: ${oldName})`;
  } else if (oldName && newName) {
    notes = `Therapist changed from ${oldName} to ${newName}`;
  } else {
    notes = "Therapist updated";
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.patient.update({
      where: { id },
      data: { therapistId: input.therapist_id },
      include: { therapist: { select: therapistSelect } },
    });

    await tx.patientStatusLog.create({
      data: {
        patientId: id,
        previousStatus: existing.currentStatus,
        newStatus: "therapist_updated",
        changedByName: input.changed_by_name,
        notes,
      },
    });

    return updated as unknown as Patient;
  });
}

// ── updatePatientInfo ──────────────────────────────────────────────────────────

export async function updatePatientInfo(
  id: number,
  input: UpdatePatientInfoInput
): Promise<Patient> {
  await getPatientById(id); // 404 guard
  const updated = await prisma.patient.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.mobile !== undefined && { mobile: input.mobile }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.age !== undefined && { age: input.age }),
      ...(input.source !== undefined && { source: input.source }),
      ...(input.referred_by !== undefined && { referredBy: input.referred_by }),
    },
    include: { therapist: { select: therapistSelect } },
  });
  return updated as unknown as Patient;
}

// ── deletePatient ──────────────────────────────────────────────────────────────

export async function deletePatient(id: number): Promise<void> {
  await getPatientById(id); // 404 guard
  await prisma.patient.delete({ where: { id } });
}

// ── getStatusLogs ──────────────────────────────────────────────────────────────

export async function getStatusLogs(patientId: number): Promise<PatientStatusLog[]> {
  await getPatientById(patientId); // 404 guard

  const logs = await prisma.patientStatusLog.findMany({
    where: { patientId },
    orderBy: { createdAt: "desc" },
  });

  return logs as PatientStatusLog[];
}
