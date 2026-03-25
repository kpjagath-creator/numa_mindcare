// Zod validation schemas for therapy session endpoints.

import { z } from "zod";

// ── POST /api/v1/therapy-sessions ─────────────────────────────────────────────

export const createSessionSchema = z.object({
  patient_id: z.number({ invalid_type_error: "patient_id must be a number" }).int().positive(),
  therapist_id: z.number({ invalid_type_error: "therapist_id must be a number" }).int().positive(),
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "session_date must be YYYY-MM-DD"),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, "start_time must be HH:MM"),
  duration_mins: z.number({ invalid_type_error: "duration_mins must be a number" }).int().min(15, "minimum 15 minutes").max(480, "maximum 8 hours"),
  session_type: z.enum(["therapy", "discovery"]).optional(),
  notes: z.string().optional(),
});

export const cancelSessionSchema = z.object({
  reason: z.string().min(1, "cancellation reason is required"),
});

export const completeSessionSchema = z.object({
  charges: z.number({ invalid_type_error: "charges must be a number" }).nonnegative("charges cannot be negative").optional(),
  notes: z.string().optional(),
});

// ── POST /api/v1/therapy-sessions/:id/reschedule ─────────────────────────────

export const rescheduleSessionSchema = z.object({
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  duration_mins: z.number().int().min(15).max(480),
  notes: z.string().optional(),
});

// ── PATCH /api/v1/therapy-sessions/:id/no-show ──────────────────────────────

export const noShowSessionSchema = z.object({
  no_show_fee: z.number().min(0).optional(),
});

// ── PATCH /api/v1/therapy-sessions/:id/payment-status ───────────────────────

export const updatePaymentStatusSchema = z.object({
  payment_status: z.enum(["unpaid", "paid", "partial"]),
  changed_by_name: z.string().min(1),
});

// ── GET /api/v1/therapy-sessions (query params) ────────────────────────────────

export const listSessionsQuerySchema = z.object({
  page: z
    .string().optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : 1))
    .pipe(z.number().int().min(1)),
  limit: z
    .string().optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : 50))
    .pipe(z.number().int().min(1).max(200)),
  patient_id: z
    .string().optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : undefined))
    .pipe(z.number().int().positive().optional()),
  therapist_id: z
    .string().optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : undefined))
    .pipe(z.number().int().positive().optional()),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(["upcoming", "completed", "cancelled", "no_show", "rescheduled"]).optional(),
});
