// Service layer for clinical notes (open-form, not SOAP).
//
// CLN-07: a note is created as a mutable "draft". Once signed, its content/authorship/signature
// become immutable — updateNote/deleteNote reject a signed note (enforced here, not just hidden
// in the UI). Further changes to a signed note are recorded as append-only amendments, which never
// alter the original signed content.

import prisma from "../lib/prisma";
import type {
  ClinicalNote,
  CreateClinicalNoteInput,
  UpdateClinicalNoteInput,
  SignClinicalNoteInput,
  AddClinicalNoteAmendmentInput,
} from "../types/index";

const noteInclude = {
  amendments: { orderBy: { createdAt: "asc" as const } },
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNotFoundError(entity: string, id: number): Error & { statusCode: number } {
  return Object.assign(new Error(`${entity} with id ${id} not found`), { statusCode: 404 });
}

function makeSignedImmutableError(action: string): Error & { statusCode: number } {
  return Object.assign(
    new Error(`This clinical note has been signed and can no longer be ${action}. Add an amendment instead.`),
    { statusCode: 409 }
  );
}

async function getNoteOrThrow(id: number) {
  const note = await prisma.clinicalNote.findUnique({ where: { id }, include: noteInclude });
  if (!note) throw makeNotFoundError("Clinical note", id);
  return note;
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
    include: noteInclude,
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
    include: noteInclude,
  });

  return notes as ClinicalNote[];
}

// ── updateNote ───────────────────────────────────────────────────────────────

export async function updateNote(
  id: number,
  input: UpdateClinicalNoteInput
): Promise<ClinicalNote> {
  const existing = await getNoteOrThrow(id);
  if (existing.status === "signed") throw makeSignedImmutableError("edited");

  const updated = await prisma.clinicalNote.update({
    where: { id },
    data: { content: input.content },
    include: noteInclude,
  });

  return updated as ClinicalNote;
}

// ── deleteNote ───────────────────────────────────────────────────────────────

export async function deleteNote(id: number): Promise<void> {
  const existing = await getNoteOrThrow(id);
  if (existing.status === "signed") throw makeSignedImmutableError("deleted");

  await prisma.clinicalNote.delete({ where: { id } });
}

// ── signNote (CLN-07) ──────────────────────────────────────────────────────────
//
// Transitions a draft note to signed, atomically. Uses the same compare-and-swap pattern as
// patientLifecycleService.transitionPatientStatus: the update's WHERE clause is conditional on
// the note still being "draft", so two concurrent sign requests for the same note can't both
// "succeed" — the loser re-reads and finds it's already signed.

export async function signNote(id: number, input: SignClinicalNoteInput): Promise<ClinicalNote> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.clinicalNote.findUnique({ where: { id } });
    if (!existing) throw makeNotFoundError("Clinical note", id);
    if (existing.status === "signed") {
      throw Object.assign(new Error("This clinical note is already signed."), { statusCode: 409 });
    }

    const result = await tx.clinicalNote.updateMany({
      where: { id, status: "draft" },
      data: { status: "signed", signedAt: new Date(), signedByName: input.signed_by_name },
    });
    if (result.count === 0) {
      throw Object.assign(new Error("This clinical note is already signed."), { statusCode: 409 });
    }

    return tx.clinicalNote.findUniqueOrThrow({ where: { id }, include: noteInclude }) as unknown as ClinicalNote;
  });
}

// ── addAmendment (CLN-07) ───────────────────────────────────────────────────────
//
// Amendments are only meaningful once a note is signed — a draft note is still directly editable
// via updateNote. The original signed content/signature are never touched; the amendment is a
// separate, individually-attributed, append-only record.

export async function addAmendment(
  noteId: number,
  input: AddClinicalNoteAmendmentInput
): Promise<ClinicalNote> {
  const existing = await getNoteOrThrow(noteId);
  if (existing.status !== "signed") {
    throw Object.assign(
      new Error("Only a signed clinical note can receive an amendment. Edit the draft directly instead."),
      { statusCode: 409 }
    );
  }

  await prisma.clinicalNoteAmendment.create({
    data: { clinicalNoteId: noteId, content: input.content, createdByName: input.created_by_name },
  });

  return getNoteOrThrow(noteId) as unknown as ClinicalNote;
}
