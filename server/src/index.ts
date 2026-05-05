import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { logger } from "./middleware/logger";
import { errorHandler, notFound } from "./middleware/errorHandler";
import { testConnection } from "./db";
import { testPineconeConnection } from "./services/pineconeService";

import meetingsRouter from "./routes/meetings";
import searchRouter from "./routes/search";
import aiRouter from "./routes/ai";

import authRouter from "./routes/auth"

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001");

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:8080",
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
app.use(
  morgan("combined", {
    stream: { write: (msg) => logger.info(msg.trim()) },
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", async (_req, res) => {
  const [dbOk, pineconeOk] = await Promise.allSettled([
    testConnection(),
    testPineconeConnection(),
  ]);

  const status = {
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      database: dbOk.status === "fulfilled" && dbOk.value ? "connected" : "error",
      pinecone: pineconeOk.status === "fulfilled" && pineconeOk.value ? "connected" : "error",
      grok: process.env.GROK_API_KEY ? "configured" : "missing_key",
    },
  };

  const allOk = Object.values(status.services).every(
    (s) => s === "connected" || s === "configured"
  );

  res.status(allOk ? 200 : 503).json(status);
});

app.use("/api/auth", authRouter);
app.use("/api/meetings", meetingsRouter);
app.use("/api/search", searchRouter);
app.use("/api/ai", aiRouter);

app.use(notFound);
app.use(errorHandler);

async function start() {
  logger.info("Starting MeetingMind API server...");

  await testConnection();
  testPineconeConnection().catch((err) =>
    logger.warn("Pinecone connection check failed on startup", err)
  );

  app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
    logger.info(`API docs: http://localhost:${PORT}/health`);
    logger.info(`Environment: ${process.env.NODE_ENV ?? "development"}`);
  });
}

start().catch((err) => {
  logger.error("Failed to start server", err);
  process.exit(1);
});

export default app;