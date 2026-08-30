// Entry point for the Numa Mindcare Express application.
// Configures middleware, mounts the /api/v1 router, and registers global error handling.
// v2 — includes sessionType in all session API responses

import "./env"; // must run first — populates process.env before anything below reads it

import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { logger } from "./middleware/logger";
import { errorHandler } from "./middleware/errorHandler";
import v1Router from "./routes/index";
import prisma from "./lib/prisma";

const app = express();

// Render (and any single-hop PaaS reverse proxy) terminates TLS and forwards
// requests with X-Forwarded-For/-Proto set. Without this, req.ip resolves to
// the proxy's own address for every request — which would make the login
// rate limiter (keyed by IP) treat all users as one client, letting one
// person's failed logins lock out everyone else. "1" trusts exactly one
// hop, matching Render's topology (app isn't behind a second/CDN proxy).
app.set("trust proxy", 1);

// ── Core middleware ────────────────────────────────────────────────────────────
// Cookie-based auth requires an explicit origin (not "*") plus credentials:true —
// the browser refuses to send/accept cookies on a wildcard-origin CORS response.
const allowedOrigins = (process.env.FRONTEND_URL ?? "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

// crossOriginResourcePolicy defaults to "same-origin", which would let the
// browser block the frontend's cross-origin (Vercel → Render) fetches.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(logger);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (_req: Request, res: Response) => {
  res.json({ success: true, data: { message: "numa-mindcare backend is running" } });
});

// ── DB connectivity check ──────────────────────────────────────────────────────
app.get("/api/v1/health/db", async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ success: true, data: { db: "connected" } });
  } catch (err: any) {
    console.error("[db-health]", err.message);
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// ── API v1 ─────────────────────────────────────────────────────────────────────
app.use("/api/v1", v1Router);

// ── Global error handler (must be last) ───────────────────────────────────────
app.use(errorHandler);

const PORT = process.env.PORT ?? 3001;
app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

export default app;
