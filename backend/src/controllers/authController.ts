// HTTP layer for /api/v1/auth.

import { Request, Response, NextFunction } from "express";
import * as authService from "../services/authService";
import { loginSchema, changePasswordSchema } from "../validators/authValidators";
import { sendSuccess } from "../utils/responseHelper";
import { signToken, SESSION_COOKIE_NAME } from "../auth/jwt";
import { sessionCookieOptions, clearCookieOptions } from "../auth/cookies";

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const { userId, view } = await authService.login(username, password);

    const token = signToken({ userId });
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions);

    sendSuccess(res, { user: view });
  } catch (err) {
    next(err);
  }
}

export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie(SESSION_COOKIE_NAME, clearCookieOptions);
  sendSuccess(res, { message: "Logged out" });
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // requireAuth already validated the session; req.user is guaranteed set.
    const view = await authService.getUserView(req.user!.id);
    if (!view) {
      res.status(401).json({ success: false, error: { message: "Not authenticated" } });
      return;
    }
    sendSuccess(res, { user: view });
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { current_password, new_password } = changePasswordSchema.parse(req.body);
    await authService.changePassword(req.user!.id, current_password, new_password);

    // Issue a fresh token for the current session so the user isn't logged
    // out here; any *other* sessions become invalid via passwordChangedAt.
    const token = signToken({ userId: req.user!.id });
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions);

    sendSuccess(res, { message: "Password changed" });
  } catch (err) {
    next(err);
  }
}
