import { describe, it, expect } from "vitest";
import { PERMISSIONS, roleHasPermission, isKnownRole, permissionsForRole } from "../permissions";

describe("RBAC permissions — clinical_notes:sign (CLN-07)", () => {
  it("declares clinical_notes:sign as a known permission", () => {
    expect(PERMISSIONS).toContain("clinical_notes:sign");
  });

  it("grants clinical_notes:sign to admin, via the centralized map (no scattered role check)", () => {
    expect(roleHasPermission("admin", "clinical_notes:sign")).toBe(true);
  });

  it("an unrecognized role has no permissions — unauthorized sign/amend attempts are rejected at the RBAC layer", () => {
    expect(isKnownRole("front_desk")).toBe(false);
    expect(permissionsForRole("front_desk")).toEqual([]);
    expect(roleHasPermission("front_desk", "clinical_notes:sign")).toBe(false);
  });
});
