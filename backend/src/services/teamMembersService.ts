// Service layer for all team-member-related database operations.

import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { generateEmployeeCode } from "../utils/generateCodes";
import type { TeamMember, Patient, CreateTeamMemberInput, UpdateTeamMemberInput } from "../types/index";

// ── Helpers ────────────────────────────────────────────────────────────────────

const therapistSelect = { id: true, name: true, employeeType: true, employeeCode: true } as const;

function makeNotFoundError(id: number): Error & { statusCode: number } {
  return Object.assign(new Error(`Team member with id ${id} not found`), { statusCode: 404 });
}

// ── createTeamMember ───────────────────────────────────────────────────────────

export async function createTeamMember(input: CreateTeamMemberInput): Promise<TeamMember> {
  try {
    return await prisma.$transaction(async (tx) => {
      const employeeCode = await generateEmployeeCode(tx);
      const member = await tx.teamMember.create({
        data: {
          employeeCode,
          name: input.name,
          employeeType: input.employee_type,
          email: input.email,
        },
      });
      return member as TeamMember;
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      Array.isArray(err.meta?.target) &&
      (err.meta.target as string[]).includes("employee_code")
    ) {
      throw Object.assign(
        new Error("Employee code conflict — please retry the request"),
        { statusCode: 409 }
      );
    }
    throw err;
  }
}

// ── listTeamMembers ────────────────────────────────────────────────────────────

export async function listTeamMembers(): Promise<TeamMember[]> {
  const members = await prisma.teamMember.findMany({ orderBy: { createdAt: "asc" } });
  return members as TeamMember[];
}

// ── getTeamMemberById ──────────────────────────────────────────────────────────

export async function getTeamMemberById(id: number): Promise<TeamMember> {
  const member = await prisma.teamMember.findUnique({ where: { id } });
  if (member === null) throw makeNotFoundError(id);
  return member as TeamMember;
}

// ── updateTeamMember (MEET-01) ─────────────────────────────────────────────────
//
// Partial update, mirroring `updatePatientInfo` in patientsService.ts. Its reason for existing is
// that therapist records created before the Google Calendar integration have no email, and an
// admin needs a way to add one — but the endpoint is a general therapist edit, not an
// email-only side door, so name/type/active status are editable too.
//
// Every field is optional and only present keys are written: omitting `email` leaves an existing
// address untouched rather than clearing it.

export async function updateTeamMember(id: number, input: UpdateTeamMemberInput): Promise<TeamMember> {
  await getTeamMemberById(id); // 404 guard
  const updated = await prisma.teamMember.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.employee_type !== undefined && { employeeType: input.employee_type }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.is_active !== undefined && { isActive: input.is_active }),
    },
  });
  return updated as TeamMember;
}

// ── deleteTeamMember ───────────────────────────────────────────────────────────

export async function deleteTeamMember(id: number): Promise<void> {
  await getTeamMemberById(id); // 404 guard
  await prisma.teamMember.delete({ where: { id } });
}

// ── getTeamMemberPatients ──────────────────────────────────────────────────────

export async function getTeamMemberPatients(id: number): Promise<Patient[]> {
  await getTeamMemberById(id); // 404 guard
  const patients = await prisma.patient.findMany({
    where: { therapistId: id },
    orderBy: { createdAt: "desc" },
    include: { therapist: { select: therapistSelect } },
  });
  return patients as unknown as Patient[];
}
