import prisma from "../lib/prisma";
import { hashPassword, verifyPassword } from "../auth/password";
import { permissionsForRole, Role } from "../auth/permissions";

export class AuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface AuthenticatedUserView {
  id: number;
  username: string;
  name: string;
  role: Role;
  permissions: readonly string[];
}

function toView(user: { id: number; username: string; name: string; role: string }): AuthenticatedUserView {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role as Role,
    permissions: permissionsForRole(user.role),
  };
}

// Deliberately returns the same generic error for "no such user" and "wrong
// password" so login can't be used to enumerate valid usernames.
export async function login(username: string, password: string): Promise<{ userId: number; view: AuthenticatedUserView }> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.isActive) {
    throw new AuthError("Invalid username or password");
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new AuthError("Invalid username or password");
  }

  return { userId: user.id, view: toView(user) };
}

export async function getUserView(userId: number): Promise<AuthenticatedUserView | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) return null;
  return toView(user);
}

export async function changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AuthError("Not authenticated");

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw new AuthError("Current password is incorrect", 400);

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, passwordChangedAt: new Date() },
  });
}
