// Authorization middleware — answers "is this user allowed to do this?"
// Must run after requireAuth. Never checks role names directly; delegates
// to the centralized Role → Permission map in auth/permissions.ts.

import { Request, Response, NextFunction } from "express";
import { Permission, roleHasPermission } from "../auth/permissions";

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: { message: "Not authenticated" } });
      return;
    }
    if (!roleHasPermission(req.user.role, permission)) {
      res.status(403).json({ success: false, error: { message: "You do not have permission to perform this action" } });
      return;
    }
    next();
  };
}
