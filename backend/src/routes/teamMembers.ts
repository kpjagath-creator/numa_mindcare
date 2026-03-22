// Route definitions for the /team-members resource group under /api/v1.

import { Router } from "express";
import {
  addTeamMember,
  listTeamMembers,
  getTeamMember,
  removeTeamMember,
  getTeamMemberPatients,
} from "../controllers/teamMembersController";

const router = Router();

router.post("/", addTeamMember);
router.get("/", listTeamMembers);
router.get("/:id", getTeamMember);
router.delete("/:id", removeTeamMember);
router.get("/:id/patients", getTeamMemberPatients);

export default router;
