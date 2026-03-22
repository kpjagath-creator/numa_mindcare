// Entry point for the Numa Mindcare Express application.
// Configures middleware, mounts the /api/v1 router, and registers global error handling.

import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { logger } from "./middleware/logger";
import { errorHandler } from "./middleware/errorHandler";
import v1Router from "./routes/index";

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

// ── API v1 ─────────────────────────────────────────────────────────────────────
app.use("/api/v1", v1Router);

// ── Global error handler (must be last) ───────────────────────────────────────
app.use(errorHandler);

const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
