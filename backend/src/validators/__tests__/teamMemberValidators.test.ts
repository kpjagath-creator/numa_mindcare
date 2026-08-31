// Validation rules for therapist onboarding and editing (MEET-01).
//
// Email became mandatory on *new* onboarding so every newly created therapist can be added as an
// attendee on session calendar invitations. The database column stays nullable so records created
// before that rule keep working — which is why the update schema treats email as optional.

import { describe, it, expect } from "vitest";
import { createTeamMemberSchema, updateTeamMemberSchema } from "../teamMemberValidators";

describe("createTeamMemberSchema — email required on new onboarding", () => {
  it("rejects a new therapist with no email at all", () => {
    const result = createTeamMemberSchema.safeParse({
      name: "Dr. Meera Nair",
      employee_type: "psychologist",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("email"))).toBe(true);
    }
  });

  it("rejects a new therapist with a malformed email", () => {
    const result = createTeamMemberSchema.safeParse({
      name: "Dr. Meera Nair",
      employee_type: "psychologist",
      email: "not-an-email",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty-string email rather than treating it as absent", () => {
    const result = createTeamMemberSchema.safeParse({
      name: "Dr. Meera Nair",
      employee_type: "psychologist",
      email: "",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a new therapist with a valid email", () => {
    const result = createTeamMemberSchema.safeParse({
      name: "Dr. Meera Nair",
      employee_type: "psychologist",
      email: "meera.nair@example.com",
    });

    expect(result.success).toBe(true);
  });
});

describe("updateTeamMemberSchema — editing an existing therapist", () => {
  it("accepts adding an email on its own (the repair path for pre-MEET-01 records)", () => {
    const result = updateTeamMemberSchema.safeParse({ email: "added@example.com" });

    expect(result.success).toBe(true);
  });

  it("accepts editing an existing email", () => {
    const result = updateTeamMemberSchema.safeParse({ email: "changed@example.com" });

    expect(result.success).toBe(true);
  });

  it("accepts an edit that omits email entirely, so a record without one stays editable", () => {
    const result = updateTeamMemberSchema.safeParse({ name: "Dr. Meera Nair-Kumar", is_active: false });

    expect(result.success).toBe(true);
    if (result.success) expect("email" in result.data).toBe(false);
  });

  it("rejects a malformed email on edit", () => {
    const result = updateTeamMemberSchema.safeParse({ email: "still-not-an-email" });

    expect(result.success).toBe(false);
  });

  it("rejects an empty update payload", () => {
    const result = updateTeamMemberSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejects an unknown employee type", () => {
    const result = updateTeamMemberSchema.safeParse({ employee_type: "surgeon" });

    expect(result.success).toBe(false);
  });
});
