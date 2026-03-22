// Route definitions for the /clinical-notes resource group under /api/v1.

import { Router } from "express";
import {
  createNote,
  getNotesForSession,
  updateNote,
  deleteNote,
} from "../controllers/clinicalNotesController";

const router = Router();

router.post("/session/:sessionId", createNote);
router.get("/session/:sessionId", getNotesForSession);
router.put("/:id", updateNote);
router.delete("/:id", deleteNote);

export default router;
