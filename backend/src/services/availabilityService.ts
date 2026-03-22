// Service layer for therapist availability and blockout operations.

import prisma from "../lib/prisma";
import type {
  TherapistAvailabilitySlot,
  SetAvailabilityInput,
  CreateBlockoutInput,
  TherapistBlockoutEntry,
} from "../types/index";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNotFoundError(entity: string, id: number): Error & { statusCode: number } {
  return Object.assign(new Error(`${entity} with id ${id} not found`), { statusCode: 404 });
}

// ── setAvailability ──────────────────────────────────────────────────────────

export async function setAvailability(
  teamMemberId: number,
  input: SetAvailabilityInput
): Promise<TherapistAvailabilitySlot[]> {
  // Verify therapist exists
  const member = await prisma.teamMember.findUnique({ where: { id: teamMemberId } });
  if (!member) throw makeNotFoundError("Team member", teamMemberId);

  // Delete existing slots, then bulk-insert new ones inside a transaction
  return prisma.$transaction(async (tx) => {
    await tx.therapistAvailability.deleteMany({ where: { teamMemberId } });

    const created = await Promise.all(
      input.slots.map((slot) =>
        tx.therapistAvailability.create({
          data: {
            teamMemberId,
            dayOfWeek: slot.day_of_week,
            startTime: slot.start_time,
            endTime: slot.end_time,
          },
        })
      )
    );

    return created as TherapistAvailabilitySlot[];
  });
}

// ── getAvailability ──────────────────────────────────────────────────────────

export async function getAvailability(teamMemberId: number): Promise<TherapistAvailabilitySlot[]> {
  const member = await prisma.teamMember.findUnique({ where: { id: teamMemberId } });
  if (!member) throw makeNotFoundError("Team member", teamMemberId);

  const slots = await prisma.therapistAvailability.findMany({
    where: { teamMemberId },
    orderBy: { dayOfWeek: "asc" },
  });

  return slots as TherapistAvailabilitySlot[];
}

// ── createBlockout ───────────────────────────────────────────────────────────

export async function createBlockout(
  teamMemberId: number,
  input: CreateBlockoutInput
): Promise<TherapistBlockoutEntry> {
  const member = await prisma.teamMember.findUnique({ where: { id: teamMemberId } });
  if (!member) throw makeNotFoundError("Team member", teamMemberId);

  const blockout = await prisma.therapistBlockout.create({
    data: {
      teamMemberId,
      blockDate: new Date(input.block_date),
      reason: input.reason ?? null,
    },
  });

  return blockout as TherapistBlockoutEntry;
}

// ── getBlockouts ─────────────────────────────────────────────────────────────

export async function getBlockouts(teamMemberId: number): Promise<TherapistBlockoutEntry[]> {
  const member = await prisma.teamMember.findUnique({ where: { id: teamMemberId } });
  if (!member) throw makeNotFoundError("Team member", teamMemberId);

  const blockouts = await prisma.therapistBlockout.findMany({
    where: {
      teamMemberId,
      blockDate: { gte: new Date() },
    },
    orderBy: { blockDate: "asc" },
  });

  return blockouts as TherapistBlockoutEntry[];
}

// ── deleteBlockout ───────────────────────────────────────────────────────────

export async function deleteBlockout(id: number): Promise<void> {
  const existing = await prisma.therapistBlockout.findUnique({ where: { id } });
  if (!existing) throw makeNotFoundError("Blockout", id);

  await prisma.therapistBlockout.delete({ where: { id } });
}
