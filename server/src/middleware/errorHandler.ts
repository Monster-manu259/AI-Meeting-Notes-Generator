// src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from "express";
import { MulterError } from "multer";
import { logger } from "./logger";
import { ApiResponse } from "../types";

// ── Typed application error ───────────────────────────────────────────────────
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly isOperational = true
  ) {
    super(message);
    this.name = "AppError";
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// ── Global error handler (must have 4 params for Express to use it) ───────────
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 1. Known operational errors
  if (err instanceof AppError) {
    logger.warn("AppError", {
      statusCode: err.statusCode,
      message: err.message,
      path: req.path,
      method: req.method,
    });
    const body: ApiResponse = { success: false, error: err.message };
    res.status(err.statusCode).json(body);
    return;
  }

  // 2. Multer errors (file upload)
  if (err instanceof MulterError) {
    let message = "File upload error";
    let statusCode = 400;
    if (err.code === "LIMIT_FILE_SIZE") {
      const maxMB = process.env.MAX_FILE_SIZE_MB ?? "500";
      message = `File too large. Maximum size is ${maxMB} MB.`;
    } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
      message = `Unexpected field: ${err.field}. Use field name "audio".`;
    }
    res.status(statusCode).json({ success: false, error: message });
    return;
  }

  // 3. Validation errors from express-validator (array shape)
  if (Array.isArray((err as any)?.errors)) {
    res.status(400).json({ success: false, errors: (err as any).errors });
    return;
  }

  // 4. Unknown / unexpected errors
  const message = err instanceof Error ? err.message : "Internal server error";
  logger.error("Unhandled error", {
    error: message,
    stack: err instanceof Error ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  const body: ApiResponse = {
    success: false,
    error: process.env.NODE_ENV === "production" ? "Internal server error" : message,
  };
  res.status(500).json(body);
}

// ── 404 handler ───────────────────────────────────────────────────────────────
export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Not found: ${req.method} ${req.path}`,
  } satisfies ApiResponse);
}