// Zod validation schemas for all patient-related API request payloads and query params.
// Controllers call .parse() on these schemas before passing data to the service layer.

import { z } from "zod";
import { PATIENT_STATUSES } from "../types/index";

// ── POST /api/v1/patients ──────────────────────────────────────────────────────

export const createPatientSchema = z.object({
  name: z.string().min(1, "name is required"),
  mobile: z
    .string()
    .regex(/^\d{10}$/, "mobile must be exactly 10 digits"),
  email: z.string().email("email must be a valid email address"),
  age: z
    .number({ invalid_type_error: "age must be a number" })
    .int("age must be an integer")
    .min(1, "age must be at least 1")
    .max(120, "age must be at most 120"),
  source: z.string().optional(),
  referred_by: z.string().optional(),
  therapist_id: z.number().int().positive().optional(),
});

// ── PATCH /api/v1/patients/:id/status ─────────────────────────────────────────

export const updateStatusSchema = z.object({
  new_status: z.enum(PATIENT_STATUSES, {
    errorMap: () => ({
      message: `new_status must be one of: ${PATIENT_STATUSES.join(", ")}`,
    }),
  }),
  changed_by_name: z.string().min(1, "changed_by_name is required"),
  notes: z.string().optional(),
});

// ── PATCH /api/v1/patients/:id/therapist ──────────────────────────────────────

export const updateTherapistSchema = z.object({
  therapist_id: z.number().int().positive().nullable(),
  changed_by_name: z.string().min(1, "changed_by_name is required"),
});

// ── PUT /api/v1/patients/:id ───────────────────────────────────────────────────

export const updatePatientInfoSchema = z.object({
  name: z.string().min(1).optional(),
  mobile: z.string().regex(/^\d{10}$/, "mobile must be exactly 10 digits").optional(),
  email: z.string().email().optional(),
  age: z.number().int().min(1).max(120).optional(),
  source: z.string().nullable().optional(),
  referred_by: z.string().nullable().optional(),
});

// ── GET /api/v1/patients (query params) ───────────────────────────────────────
// req.query values arrive as strings, so page/limit are transformed before validation.

export const listPatientsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : 1))
    .pipe(z.number({ invalid_type_error: "page must be a number" }).int().min(1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : 20))
    .pipe(
      z
        .number({ invalid_type_error: "limit must be a number" })
        .int()
        .min(1)
        .max(500)
    ),
  search: z.string().optional(),
  status: z.enum(PATIENT_STATUSES).optional(),
});
