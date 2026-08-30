// Cookie attributes for the session cookie.
//
// Production is cross-site (Vercel frontend → Render backend), which requires
// SameSite=None + Secure for the browser to send the cookie at all. In dev,
// Vite's proxy makes requests same-origin, so Lax + non-secure works over http.

import { CookieOptions } from "express";
import { SESSION_COOKIE_MAX_AGE_MS } from "./jwt";

const isProduction = process.env.NODE_ENV === "production";

export const sessionCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  maxAge: SESSION_COOKIE_MAX_AGE_MS,
  path: "/",
};

export const clearCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/",
};
