// Zod validation schemas for therapist availability API request payloads.

import { z } from "zod";

// ── PUT /api/v1/availability/therapist/:id/slots ─────────────────────────────

export const setAvailabilitySchema = z.object({
  slots: z.array(
    z.object({
      day_of_week: z.number().int().min(0).max(6),
      start_time: z.string().regex(/^\d{2}:\d{2}$/, "start_time must be HH:MM"),
      end_time: z.string().regex(/^\d{2}:\d{2}$/, "end_time must be HH:MM"),
    })
  ),
});

// ── POST /api/v1/availability/therapist/:id/blockouts ────────────────────────

export const createBlockoutSchema = z.object({
  block_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "block_date must be YYYY-MM-DD"),
  reason: z.string().optional(),
});
