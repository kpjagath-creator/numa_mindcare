// Zod validation schemas for clinical-notes API request payloads.

import { z } from "zod";

// ── POST /api/v1/clinical-notes/session/:sessionId ───────────────────────────

export const createNoteSchema = z.object({
  content: z.string().min(1, "Note content is required"),
  created_by_name: z.string().min(1, "created_by_name is required"),
});

// ── PUT /api/v1/clinical-notes/:id ───────────────────────────────────────────

export const updateNoteSchema = z.object({
  content: z.string().min(1, "Note content is required"),
});
