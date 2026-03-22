// HTTP layer for the /api/v1/availability resource.

import { Request, Response, NextFunction } from "express";
import * as availabilityService from "../services/availabilityService";
import { setAvailabilitySchema, createBlockoutSchema } from "../validators/availabilityValidators";
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

// ── PUT /api/v1/availability/therapist/:id/slots ─────────────────────────────

export async function setAvailability(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const input = setAvailabilitySchema.parse(req.body);
    const slots = await availabilityService.setAvailability(id, input);
    sendSuccess(res, { slots });
  } catch (err) { next(err); }
}

// ── GET /api/v1/availability/therapist/:id/slots ─────────────────────────────

export async function getAvailability(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const slots = await availabilityService.getAvailability(id);
    sendSuccess(res, { slots });
  } catch (err) { next(err); }
}

// ── POST /api/v1/availability/therapist/:id/blockouts ────────────────────────

export async function createBlockout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const input = createBlockoutSchema.parse(req.body);
    const blockout = await availabilityService.createBlockout(id, input);
    sendSuccess(res, { blockout }, 201);
  } catch (err) { next(err); }
}

// ── GET /api/v1/availability/therapist/:id/blockouts ─────────────────────────

export async function getBlockouts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const blockouts = await availabilityService.getBlockouts(id);
    sendSuccess(res, { blockouts });
  } catch (err) { next(err); }
}

// ── DELETE /api/v1/availability/blockouts/:id ────────────────────────────────

export async function deleteBlockout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    await availabilityService.deleteBlockout(id);
    sendSuccess(res, { message: "Blockout deleted successfully" });
  } catch (err) { next(err); }
}
