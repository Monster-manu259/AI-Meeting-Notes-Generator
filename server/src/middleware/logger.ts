// src/middleware/logger.ts
import winston from "winston";
import fs from "fs";
import path from "path";

const isProd = process.env.NODE_ENV === "production";

// Auto-create logs directory in production so winston doesn't crash
if (isProd) {
  const logsDir = path.resolve("logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr =
      Object.keys(meta).length > 0
        ? " " + JSON.stringify(meta, null, 0)
        : "";
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: isProd ? "info" : "debug",
  format: isProd ? jsonFormat : consoleFormat,
  transports: [
    new winston.transports.Console(),
    ...(isProd
      ? [
          new winston.transports.File({
            filename: "logs/error.log",
            level: "error",
            maxsize: 10 * 1024 * 1024, // 10 MB
            maxFiles: 5,
          }),
          new winston.transports.File({
            filename: "logs/combined.log",
            maxsize: 20 * 1024 * 1024,
            maxFiles: 10,
          }),
        ]
      : []),
  ],
});