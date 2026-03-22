// HTTP layer for /api/v1/therapy-sessions.

import { Request, Response, NextFunction } from "express";
import * as sessionsService from "../services/therapySessionsService";
import { createSessionSchema, listSessionsQuerySchema, cancelSessionSchema, completeSessionSchema, rescheduleSessionSchema, noShowSessionSchema, updatePaymentStatusSchema } from "../validators/therapySessionValidators";
import { sendSuccess } from "../utils/responseHelper";

function parseId(raw: string, res: Response): number | null {
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, error: { message: "id must be a numeric value" } });
    return null;
  }
  return id;
}

// ── POST /api/v1/therapy-sessions ─────────────────────────────────────────────

export async function createSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createSessionSchema.parse(req.body);
    const session = await sessionsService.createSession(input);
    sendSuccess(res, { session }, 201);
  } catch (err) { next(err); }
}

// ── GET /api/v1/therapy-sessions ──────────────────────────────────────────────

export async function listSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = listSessionsQuerySchema.parse(req.query);
    const result = await sessionsService.listSessions(query);
    res.status(200).json({ success: true, data: { sessions: result.items }, pagination: result.pagination });
  } catch (err) { next(err); }
}

// ── GET /api/v1/therapy-sessions/:id ──────────────────────────────────────────

export async function getSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const session = await sessionsService.getSessionById(id);
    sendSuccess(res, { session });
  } catch (err) { next(err); }
}

// ── PATCH /api/v1/therapy-sessions/:id/cancel ─────────────────────────────────

export async function cancelSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const input = cancelSessionSchema.parse(req.body);
    const session = await sessionsService.cancelSession(id, input);
    sendSuccess(res, { session });
  } catch (err) { next(err); }
}

// ── PATCH /api/v1/therapy-sessions/:id/complete ───────────────────────────────

export async function completeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const input = completeSessionSchema.parse(req.body);
    const session = await sessionsService.completeSession(id, input);
    sendSuccess(res, { session });
  } catch (err) { next(err); }
}

// ── DELETE /api/v1/therapy-sessions/:id ───────────────────────────────────────

export async function deleteSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    await sessionsService.deleteSession(id);
    sendSuccess(res, { message: "Session deleted successfully" });
  } catch (err) { next(err); }
}

// ── GET /api/v1/therapy-sessions/therapist/:id ─────────────────────────────────

export async function getTherapistSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const { date } = req.query as { date?: string };
    const sessions = await sessionsService.getTherapistSessions(id, date);
    sendSuccess(res, { sessions });
  } catch (err) { next(err); }
}

// ── POST /api/v1/therapy-sessions/:id/reschedule ──────────────────────────────

export async function rescheduleSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const input = rescheduleSessionSchema.parse(req.body);
    const session = await sessionsService.rescheduleSession(id, input);
    sendSuccess(res, { session }, 201);
  } catch (err) { next(err); }
}

// ── PATCH /api/v1/therapy-sessions/:id/no-show ────────────────────────────────

export async function markNoShow(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const input = noShowSessionSchema.parse(req.body);
    const session = await sessionsService.markNoShow(id, input);
    sendSuccess(res, { session });
  } catch (err) { next(err); }
}

// ── PATCH /api/v1/therapy-sessions/:id/payment-status ─────────────────────────

export async function updatePaymentStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const input = updatePaymentStatusSchema.parse(req.body);
    const session = await sessionsService.updatePaymentStatus(id, input);
    sendSuccess(res, { session });
  } catch (err) { next(err); }
}
