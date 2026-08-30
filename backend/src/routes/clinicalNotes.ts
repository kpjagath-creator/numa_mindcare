// Route definitions for the /clinical-notes resource group under /api/v1.

import { Router } from "express";
import {
  createNote,
  getNotesForSession,
  updateNote,
  deleteNote,
} from "../controllers/clinicalNotesController";
import { requirePermission } from "../middleware/requirePermission";

const router = Router();

router.post("/session/:sessionId", requirePermission("clinical_notes:create"), createNote);
router.get("/session/:sessionId", requirePermission("clinical_notes:read"), getNotesForSession);
router.put("/:id", requirePermission("clinical_notes:update"), updateNote);
router.delete("/:id", requirePermission("clinical_notes:delete"), deleteNote);

export default router;
