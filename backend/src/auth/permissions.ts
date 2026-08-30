// Centralized Role → Permission mapping.
//
// This is the single source of truth for "what can a role do". Routes and
// controllers never check `role === "admin"` directly — they declare a
// required permission (see middleware/requirePermission.ts) and this file
// decides whether a role grants it.
//
// To add a new role: add a key here with its permission list. Nothing else
// in the authorization pipeline needs to change.

export const PERMISSIONS = [
  "patients:read",
  "patients:create",
  "patients:update",
  "patients:delete",

  "sessions:read",
  "sessions:create",
  "sessions:update",
  "sessions:delete",

  "billing:update",

  "clinical_notes:read",
  "clinical_notes:create",
  "clinical_notes:update",
  "clinical_notes:delete",
  "clinical_notes:sign",

  "team:read",
  "team:create",
  "team:delete",

  "availability:read",
  "availability:manage",

  "analytics:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ["admin"] as const;
export type Role = (typeof ROLES)[number];

// Deliberately no "*" wildcard: admin's grant is an explicit, auditable list
// so a future role can never accidentally inherit access it wasn't given.
const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
};

export function isKnownRole(role: string): role is Role {
  return (ROLES as readonly string[]).includes(role);
}

export function permissionsForRole(role: string): readonly Permission[] {
  if (!isKnownRole(role)) return [];
  return ROLE_PERMISSIONS[role];
}

export function roleHasPermission(role: string, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}
