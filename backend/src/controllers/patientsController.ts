// HTTP layer for the /api/v1/patients resource.

import { Request, Response, NextFunction } from "express";
import * as patientsService from "../services/patientsService";
import {
  createPatientSchema,
  updateStatusSchema,
  updateTherapistSchema,
  updatePatientInfoSchema,
  listPatientsQuerySchema,
} from "../validators/patientValidators";
import { sendSuccess } from "../utils/responseHelper";

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseId(raw: string, res: Response): number | null {
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, error: { message: "id must be a numeric value" } });
    return null;
  }
  return id;
}

// ── POST /api/v1/patients ──────────────────────────────────────────────────────

export async function registerPatient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createPatientSchema.parse(req.body);
    const patient = await patientsService.createPatient(input);
    sendSuccess(res, { patient }, 201);
  } catch (err) { next(err); }
}

// ── GET /api/v1/patients ───────────────────────────────────────────────────────

export async function listPatients(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = listPatientsQuerySchema.parse(req.query);
    const result = await patientsService.listPatients(query);
    res.status(200).json({ success: true, data: { patients: result.items }, pagination: result.pagination });
  } catch (err) { next(err); }
}

// ── GET /api/v1/patients/:id ───────────────────────────────────────────────────

export async function getPatient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const patient = await patientsService.getPatientById(id);
    sendSuccess(res, { patient });
  } catch (err) { next(err); }
}

// ── PATCH /api/v1/patients/:id/status ─────────────────────────────────────────

export async function updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const input = updateStatusSchema.parse(req.body);
    const patient = await patientsService.updatePatientStatus(id, input);
    sendSuccess(res, { patient });
  } catch (err) { next(err); }
}

// ── PATCH /api/v1/patients/:id/therapist ──────────────────────────────────────

export async function updateTherapist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const input = updateTherapistSchema.parse(req.body);
    const patient = await patientsService.updatePatientTherapist(id, input);
    sendSuccess(res, { patient });
  } catch (err) { next(err); }
}

// ── PUT /api/v1/patients/:id ───────────────────────────────────────────────────

export async function updatePatientInfo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const input = updatePatientInfoSchema.parse(req.body);
    const patient = await patientsService.updatePatientInfo(id, input);
    sendSuccess(res, { patient });
  } catch (err) { next(err); }
}

// ── DELETE /api/v1/patients/:id ───────────────────────────────────────────────

export async function deletePatient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    await patientsService.deletePatient(id);
    sendSuccess(res, { message: "Patient deleted successfully" });
  } catch (err) { next(err); }
}

// ── GET /api/v1/patients/:id/status-logs ──────────────────────────────────────

export async function getStatusLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const logs = await patientsService.getStatusLogs(id);
    sendSuccess(res, { logs });
  } catch (err) { next(err); }
}
