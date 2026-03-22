// Service layer for all team-member-related database operations.

import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { generateEmployeeCode } from "../utils/generateCodes";
import type { TeamMember, Patient, CreateTeamMemberInput } from "../types/index";

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
        data: { employeeCode, name: input.name, employeeType: input.employee_type },
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
