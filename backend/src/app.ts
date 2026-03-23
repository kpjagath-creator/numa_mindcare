// Entry point for the Numa Mindcare Express application.
// Configures middleware, mounts the /api/v1 router, and registers global error handling.

import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { logger } from "./middleware/logger";
import { errorHandler } from "./middleware/errorHandler";
import v1Router from "./routes/index";
import prisma from "./lib/prisma";

dotenv.config();

const app = express();

// ── Core middleware ────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
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

const PORT = process.env.PORT ?? 4000;
app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

export default app;
