// Authentication middleware — answers "who is this user?"
//
// Verifies the session JWT, then re-checks the user against the database
// (active + password not changed since the token was issued) so a disabled
// account or a password change invalidates already-issued tokens without
// needing a server-side session store.

import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { verifyToken, SESSION_COOKIE_NAME } from "../auth/jwt";
import { Role } from "../auth/permissions";

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) {
    res.status(401).json({ success: false, error: { message: "Not authenticated" } });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ success: false, error: { message: "Session expired or invalid" } });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || !user.isActive) {
    res.status(401).json({ success: false, error: { message: "Not authenticated" } });
    return;
  }

  // A token issued before the last password change is no longer valid —
  // this is what makes "change password" and "logout everywhere" work
  // without a server-side session table. Compared at whole-second
  // granularity: JWT `iat` is an integer number of seconds, but
  // passwordChangedAt keeps milliseconds, so a token minted immediately
  // after (and in response to) the very password change that set it can
  // land in the same second and appear "issued before" it — which would
  // incorrectly invalidate the session doing the changing. Rejecting only
  // strictly earlier *seconds* avoids that off-by-a-fraction-of-a-second
  // false rejection while still invalidating genuinely older sessions.
  const tokenIssuedAt = (payload as any).iat as number | undefined;
  const passwordChangedAtSeconds = Math.floor(user.passwordChangedAt.getTime() / 1000);
  if (tokenIssuedAt !== undefined && tokenIssuedAt < passwordChangedAtSeconds) {
    res.status(401).json({ success: false, error: { message: "Session expired or invalid" } });
    return;
  }

  req.user = { id: user.id, username: user.username, name: user.name, role: user.role as Role };
  next();
}
