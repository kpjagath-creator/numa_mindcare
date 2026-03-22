// HTTP layer for the /api/v1/clinical-notes resource.

import { Request, Response, NextFunction } from "express";
import * as clinicalNotesService from "../services/clinicalNotesService";
import { createNoteSchema, updateNoteSchema } from "../validators/clinicalNoteValidators";
import { sendSuccess } from "../utils/responseHelper";

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseId(raw: string, res: Response): number | null {
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, error: { message: "id must be a numeric value" } });
    return null;
  }
  return id;
}

// ── POST /api/v1/clinical-notes/session/:sessionId ───────────────────────────

export async function createNote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sessionId = parseId(req.params.sessionId, res);
    if (sessionId === null) return;
    const input = createNoteSchema.parse(req.body);
    const note = await clinicalNotesService.createNote(sessionId, input);
    sendSuccess(res, { note }, 201);
  } catch (err) { next(err); }
}

// ── GET /api/v1/clinical-notes/session/:sessionId ────────────────────────────

export async function getNotesForSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sessionId = parseId(req.params.sessionId, res);
    if (sessionId === null) return;
    const notes = await clinicalNotesService.getNotesForSession(sessionId);
    sendSuccess(res, { notes });
  } catch (err) { next(err); }
}

// ── PUT /api/v1/clinical-notes/:id ───────────────────────────────────────────

export async function updateNote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const input = updateNoteSchema.parse(req.body);
    const note = await clinicalNotesService.updateNote(id, input);
    sendSuccess(res, { note });
  } catch (err) { next(err); }
}

// ── DELETE /api/v1/clinical-notes/:id ────────────────────────────────────────

export async function deleteNote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    await clinicalNotesService.deleteNote(id);
    sendSuccess(res, { message: "Clinical note deleted successfully" });
  } catch (err) { next(err); }
}
