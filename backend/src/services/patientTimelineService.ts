// Patient Timeline capability (PAT-10) — a read-oriented composition of a patient's existing
// domain data into one unified, chronological view for staff. Lives in the Patients domain (the
// domain that owns the patient profile), per ARCHITECTURE.md's "a read-oriented endpoint owned by
// the Patient-facing application capability" — it reads across Patients, Scheduling, and Clinical
// Notes, the same kind of intentional cross-domain read Analytics already does (ARCHITECTURE.md
// §5), and writes nothing.
//
// No new event table: this composes PatientStatusLog, TherapySession, and ClinicalNote directly,
// each fetched in one bounded query in parallel — not per-row/per-session loops (the frontend's
// current profile-page notes-loading is the N+1 pattern this deliberately avoids; see
// PatientProfilePage.tsx).

import prisma from "../lib/prisma";
import type { PatientTimelineEntry, PatientTimelineEntryType } from "../types/index";

function makeNotFoundError(id: number): Error & { statusCode: number } {
  return Object.assign(new Error(`Patient with id ${id} not found`), { statusCode: 404 });
}

// Deterministic tie-break for entries sharing an identical timestamp (e.g. a session created in
// the same transaction as its lifecycle auto-advance log). Order is arbitrary but fixed.
const TYPE_PRIORITY: Record<PatientTimelineEntryType, number> = {
  lifecycle: 0,
  assignment: 1,
  payment: 2,
  session: 3,
  clinical_note: 4,
};

export async function getPatientTimeline(patientId: number): Promise<PatientTimelineEntry[]> {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw makeNotFoundError(patientId);

  const [statusLogs, sessions, clinicalNotes] = await Promise.all([
    prisma.patientStatusLog.findMany({ where: { patientId }, orderBy: { createdAt: "desc" } }),
    prisma.therapySession.findMany({
      where: { patientId },
      orderBy: { startTime: "desc" },
      include: { teamMember: { select: { id: true, name: true } } },
    }),
    prisma.clinicalNote.findMany({
      where: { session: { patientId } },
      orderBy: { createdAt: "desc" },
      include: { session: { select: { id: true, sessionType: true } } },
    }),
  ]);

  const entries: PatientTimelineEntry[] = [];

  for (const log of statusLogs) {
    if (log.newStatus.startsWith("payment_")) {
      entries.push({
        id: `status_log:${log.id}`,
        type: "payment",
        timestamp: log.createdAt,
        actor: log.changedByName,
        description: log.notes ?? `Payment status changed to ${log.newStatus.replace("payment_", "")}`,
        link: null,
      });
    } else if (log.newStatus === "therapist_updated") {
      entries.push({
        id: `status_log:${log.id}`,
        type: "assignment",
        timestamp: log.createdAt,
        actor: log.changedByName,
        description: log.notes ?? "Therapist assignment changed",
        link: null,
      });
    } else {
      entries.push({
        id: `status_log:${log.id}`,
        type: "lifecycle",
        timestamp: log.createdAt,
        actor: log.changedByName,
        description: log.notes ?? `Status changed to ${log.newStatus}${log.previousStatus ? ` (from ${log.previousStatus})` : ""}`,
        link: null,
      });
    }
  }

  for (const session of sessions) {
    const kind = session.sessionType === "discovery" ? "Discovery call" : "Therapy session";
    entries.push({
      id: `session:${session.id}`,
      type: "session",
      timestamp: session.startTime,
      actor: session.teamMember?.name ?? null,
      description: `${kind} ${session.status} with ${session.teamMember?.name ?? "therapist"}`,
      link: { resource: "therapy_session", id: session.id },
    });
  }

  for (const note of clinicalNotes) {
    const signed = note.status === "signed";
    entries.push({
      id: `clinical_note:${note.id}`,
      type: "clinical_note",
      timestamp: note.createdAt,
      actor: note.createdByName,
      description: signed
        ? `Clinical note signed by ${note.signedByName ?? note.createdByName}`
        : `Clinical note added (draft)`,
      link: { resource: "clinical_note", id: note.id, sessionId: note.session.id },
    });
  }

  entries.sort((a, b) => {
    const t = b.timestamp.getTime() - a.timestamp.getTime();
    if (t !== 0) return t;
    const p = TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type];
    if (p !== 0) return p;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return entries;
}
