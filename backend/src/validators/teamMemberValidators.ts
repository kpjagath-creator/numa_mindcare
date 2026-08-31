// Zod validation schemas for all team-member-related API request payloads.

import { z } from "zod";
import { EMPLOYEE_TYPES } from "../types/index";

// ── POST /api/v1/team-members ──────────────────────────────────────────────────

export const createTeamMemberSchema = z.object({
  name: z.string().min(1, "name is required"),
  employee_type: z.enum(EMPLOYEE_TYPES, {
    errorMap: () => ({
      message: `employee_type must be one of: ${EMPLOYEE_TYPES.join(", ")}`,
    }),
  }),
  // Required on new onboarding (MEET-01) so every newly created therapist can be added as a
  // Google Calendar attendee. The database column stays nullable for records created before this
  // rule existed — those are repaired through PUT /team-members/:id, not by a backfill.
  email: z.string().email("email must be a valid email address"),
});

// ── PUT /api/v1/team-members/:id ───────────────────────────────────────────────
//
// Partial update, mirroring the patient update schema. Scoped deliberately to the four editable
// therapist attributes — employeeCode is system-generated and not editable here.

export const updateTeamMemberSchema = z
  .object({
    name: z.string().min(1, "name must not be empty").optional(),
    employee_type: z
      .enum(EMPLOYEE_TYPES, {
        errorMap: () => ({
          message: `employee_type must be one of: ${EMPLOYEE_TYPES.join(", ")}`,
        }),
      })
      .optional(),
    email: z.string().email("email must be a valid email address").optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "at least one field must be provided",
  });
