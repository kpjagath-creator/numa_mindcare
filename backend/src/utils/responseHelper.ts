// Standard response envelope helpers used by all API controllers.
// Ensures every response has a consistent { success, data } or { success, error } shape.

import { Response } from "express";

interface SuccessPayload<T> {
  success: true;
  data: T;
}

interface ErrorPayload {
  success: false;
  error: {
    message: string;
    details?: unknown;
  };
}

/**
 * Send a successful JSON response.
 * @param res   - Express Response object
 * @param data  - Payload to include in the `data` field
 * @param status - HTTP status code (default 200)
 */
export const sendSuccess = <T>(res: Response, data: T, status = 200): void => {
  const body: SuccessPayload<T> = { success: true, data };
  res.status(status).json(body);
};

/**
 * Send an error JSON response.
 * @param res     - Express Response object
 * @param message - Human-readable error message
 * @param status  - HTTP status code (default 500)
 * @param details - Optional additional error details
 */
export const sendError = (
  res: Response,
  message: string,
  status = 500,
  details?: unknown
): void => {
  const body: ErrorPayload = {
    success: false,
    error: { message, ...(details !== undefined && { details }) },
  };
  res.status(status).json(body);
};
