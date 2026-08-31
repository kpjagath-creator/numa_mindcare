// Route definitions for the /team-members resource group under /api/v1.

import { Router } from "express";
import {
  addTeamMember,
  listTeamMembers,
  getTeamMember,
  editTeamMember,
  removeTeamMember,
  getTeamMemberPatients,
} from "../controllers/teamMembersController";
import { requirePermission } from "../middleware/requirePermission";

const router = Router();

router.post("/", requirePermission("team:create"), addTeamMember);
router.get("/", requirePermission("team:read"), listTeamMembers);
router.get("/:id", requirePermission("team:read"), getTeamMember);
router.put("/:id", requirePermission("team:update"), editTeamMember);
router.delete("/:id", requirePermission("team:delete"), removeTeamMember);
router.get("/:id/patients", requirePermission("team:read"), getTeamMemberPatients);

export default router;
