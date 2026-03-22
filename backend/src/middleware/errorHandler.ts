// Global Express error-handling middleware.
// Catches errors thrown by route handlers and returns a structured JSON response.

import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

interface AppError extends Error {
  statusCode?: number;
}

export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        message: "Validation error",
        details: err.errors,
      },
    });
    return;
  }

  const statusCode = err.statusCode ?? 500;
  const message = err.message ?? "Internal server error";

  console.error("[errorHandler]", statusCode, message, err.stack);

  res.status(statusCode).json({
    success: false,
    error: { message },
  });
};
