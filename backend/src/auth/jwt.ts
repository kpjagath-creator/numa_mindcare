// Signs and verifies the JWT carried in the httpOnly session cookie.

import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not set. Set it in backend/.env (local) or the Render service's environment variables (production)."
  );
}

const TOKEN_TTL = "12h";

export interface TokenPayload {
  userId: number;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET as string) as TokenPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = "numa_session";
export const SESSION_COOKIE_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12h, matches TOKEN_TTL
