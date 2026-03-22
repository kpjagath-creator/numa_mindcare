// HTTP layer for the /api/v1/team-members resource.

import { Request, Response, NextFunction } from "express";
import * as teamMembersService from "../services/teamMembersService";
import { createTeamMemberSchema } from "../validators/teamMemberValidators";
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

// ── POST /api/v1/team-members ──────────────────────────────────────────────────

export async function addTeamMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createTeamMemberSchema.parse(req.body);
    const member = await teamMembersService.createTeamMember(input);
    sendSuccess(res, { member }, 201);
  } catch (err) { next(err); }
}

// ── GET /api/v1/team-members ───────────────────────────────────────────────────

export async function listTeamMembers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const members = await teamMembersService.listTeamMembers();
    sendSuccess(res, { members });
  } catch (err) { next(err); }
}

// ── GET /api/v1/team-members/:id ──────────────────────────────────────────────

export async function getTeamMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const member = await teamMembersService.getTeamMemberById(id);
    sendSuccess(res, { member });
  } catch (err) { next(err); }
}

// ── DELETE /api/v1/team-members/:id ───────────────────────────────────────────

export async function removeTeamMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    await teamMembersService.deleteTeamMember(id);
    sendSuccess(res, { message: "Team member deleted successfully" });
  } catch (err) { next(err); }
}

// ── GET /api/v1/team-members/:id/patients ─────────────────────────────────────

export async function getTeamMemberPatients(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const patients = await teamMembersService.getTeamMemberPatients(id);
    sendSuccess(res, { patients });
  } catch (err) { next(err); }
}
