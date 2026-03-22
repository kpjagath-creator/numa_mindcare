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
});
