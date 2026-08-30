// Basic brute-force protection on the login endpoint. In-memory is sufficient
// for a single-instance deployment; revisit if the backend ever scales out
// to multiple instances (would need a shared store).

import rateLimit from "express-rate-limit";

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: "Too many login attempts. Try again later." } },
});
