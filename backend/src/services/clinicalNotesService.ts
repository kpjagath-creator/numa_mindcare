// Service layer for clinical notes (open-form, not SOAP).

import prisma from "../lib/prisma";
import type {
  ClinicalNote,
  CreateClinicalNoteInput,
  UpdateClinicalNoteInput,
} from "../types/index";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNotFoundError(entity: string, id: number): Error & { statusCode: number } {
  return Object.assign(new Error(`${entity} with id ${id} not found`), { statusCode: 404 });
}

// ── createNote ───────────────────────────────────────────────────────────────

export async function createNote(
  sessionId: number,
  input: CreateClinicalNoteInput
): Promise<ClinicalNote> {
  // Verify session exists
  const session = await prisma.therapySession.findUnique({ where: { id: sessionId } });
  if (!session) throw makeNotFoundError("Therapy session", sessionId);

  const note = await prisma.clinicalNote.create({
    data: {
      sessionId,
      content: input.content,
      createdByName: input.created_by_name,
    },
  });

  return note as ClinicalNote;
}

// ── getNotesForSession ───────────────────────────────────────────────────────

export async function getNotesForSession(sessionId: number): Promise<ClinicalNote[]> {
  const session = await prisma.therapySession.findUnique({ where: { id: sessionId } });
  if (!session) throw makeNotFoundError("Therapy session", sessionId);

  const notes = await prisma.clinicalNote.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
  });

  return notes as ClinicalNote[];
}

// ── updateNote ───────────────────────────────────────────────────────────────

export async function updateNote(
  id: number,
  input: UpdateClinicalNoteInput
): Promise<ClinicalNote> {
  const existing = await prisma.clinicalNote.findUnique({ where: { id } });
  if (!existing) throw makeNotFoundError("Clinical note", id);

  const updated = await prisma.clinicalNote.update({
    where: { id },
    data: { content: input.content },
  });

  return updated as ClinicalNote;
}

// ── deleteNote ───────────────────────────────────────────────────────────────

export async function deleteNote(id: number): Promise<void> {
  const existing = await prisma.clinicalNote.findUnique({ where: { id } });
  if (!existing) throw makeNotFoundError("Clinical note", id);

  await prisma.clinicalNote.delete({ where: { id } });
}
