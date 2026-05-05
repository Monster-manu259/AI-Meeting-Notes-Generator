import { Router, Request, Response, NextFunction } from "express";
import { body, param, query as qv, validationResult } from "express-validator";
import multer from "multer";
import path from "path";
import fs from "fs";
import * as meetingService from "../services/meetingService";
import * as grokService from "../services/grokService";
import * as elevenService from "../services/ElevenlabService";
import * as pineconeService from "../services/pineconeService";
import { AppError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { logger } from "../middleware/logger";
import { extractAudio, isVideoFile } from "../utils/media";

const router = Router();

router.use(requireAuth);

const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => {
      const uid = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${uid}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE_MB ?? "500") * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("audio/") || file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new AppError(400, "Only audio or video files are allowed"));
    }
  },
});

function ok(req: Request, res: Response, next: NextFunction): void {
  const errs = validationResult(req);
  if (!errs.isEmpty()) { res.status(400).json({ success: false, errors: errs.array() }); return; }
  next();
}

router.get("/",
  [qv("status").optional().isIn(["completed", "processing", "scheduled"]), qv("search").optional().isString().trim()],
  ok,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const meetings = await meetingService.getAllMeetings(
        req.user!.id,
        req.query.status as string | undefined,
        req.query.search as string | undefined
      );
      res.json({ success: true, data: meetings });
    } catch (e) { next(e); }
  }
);

router.get("/stats", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await meetingService.getStats(req.user!.id) });
  } catch (e) { next(e); }
});

router.get("/:id", [param("id").isUUID()], ok,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const meeting = await meetingService.getMeetingById(req.params.id, req.user!.id);
      res.json({ success: true, data: meeting });
    } catch (e) { next(e); }
  }
);

router.post("/",
  [
    body("title").isString().trim().isLength({ min: 1, max: 500 }),
    body("date").isISO8601(),
    body("participants").isArray({ min: 1 }),
    body("participants.*").isString().trim(),
    body("tags").optional().isArray(),
    body("status").optional().isIn(["completed", "processing", "scheduled"]),
    body("duration").optional().isString().trim(),
  ], ok,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const meeting = await meetingService.createMeeting(req.user!.id, req.body);
      res.status(201).json({ success: true, data: meeting, message: "Meeting created" });
    } catch (e) { next(e); }
  }
);

router.patch("/:id",
  [
    param("id").isUUID(),
    body("title").optional().isString().trim().isLength({ min: 1, max: 500 }),
    body("date").optional().isISO8601(),
    body("duration").optional().isString().trim(),
    body("participants").optional().isArray(),
    body("tags").optional().isArray(),
    body("status").optional().isIn(["completed", "processing", "scheduled"]),
    body("summary").optional().isString(),
  ], ok,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const meeting = await meetingService.updateMeeting(req.params.id, req.body, req.user!.id);
      res.json({ success: true, data: meeting });
    } catch (e) { next(e); }
  }
);

router.delete("/:id", [param("id").isUUID()], ok,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await meetingService.deleteMeeting(req.params.id, req.user!.id);
      res.json({ success: true, message: "Meeting deleted" });
    } catch (e) { next(e); }
  }
);

router.get("/:id/action-items", [param("id").isUUID()], ok,
  async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ success: true, data: await meetingService.getActionItems(req.params.id) }); }
    catch (e) { next(e); }
  }
);

router.post("/:id/action-items",
  [param("id").isUUID(), body("text").isString().trim().notEmpty(), body("assignee").isString().trim().notEmpty(), body("due_date").optional().isISO8601()], ok,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await meetingService.createActionItem(req.params.id, req.body);
      res.status(201).json({ success: true, data: item });
    } catch (e) { next(e); }
  }
);

router.patch("/:id/action-items/:itemId/toggle",
  [param("id").isUUID(), param("itemId").isUUID()], ok,
  async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ success: true, data: await meetingService.toggleActionItem(req.params.id, req.params.itemId) }); }
    catch (e) { next(e); }
  }
);

router.delete("/:id/action-items/:itemId",
  [param("id").isUUID(), param("itemId").isUUID()], ok,
  async (req: Request, res: Response, next: NextFunction) => {
    try { await meetingService.deleteActionItem(req.params.id, req.params.itemId); res.json({ success: true }); }
    catch (e) { next(e); }
  }
);

router.post("/:id/upload", [param("id").isUUID()], ok,
  upload.single("audio"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new AppError(400, "No audio file provided.");
      const meetingId = req.params.id;
      const userId = req.user!.id;

      await meetingService.getMeetingById(meetingId, userId);
      await meetingService.updateMeeting(meetingId, { status: "processing" }, userId);

      processMeetingAudio(meetingId, req.file.path, req.file.originalname)
        .catch((err) => logger.error(`[pipeline] FATAL for meeting ${meetingId}`, {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        }));

      res.json({
        success: true,
        message: "Audio received. Processing in background.",
        data: { meetingId, filename: req.file.originalname, size: req.file.size },
      });
    } catch (e) { next(e); }
  }
);

router.get("/:id/pipeline-status", [param("id").isUUID()], ok,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const m = await meetingService.getMeetingById(req.params.id, req.user!.id);
      res.json({
        success: true,
        data: {
          status: m.status,
          hasSummary: !!m.summary,
          transcriptRows: m.transcript.length,
          actionItemRows: m.action_items.length,
          decisionRows: m.decisions.length,
        },
      });
    } catch (e) { next(e); }
  }
);

async function processMeetingAudio(
  meetingId: string,
  filePath: string,
  originalName: string
): Promise<void> {
  logger.info(`[pipeline] ▶ start — ${meetingId}`);
  let extractedAudioPath: string | null = null;

  try {
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

    let audioFilePath = filePath;
    if (isVideoFile(originalName)) {
      extractedAudioPath = await extractAudio(filePath);
      audioFilePath = extractedAudioPath;
    }

    const audioBuffer = fs.readFileSync(audioFilePath);
    const raw = await elevenService.transcribeAudio(audioBuffer, originalName, { diarize: true });
    const segments = elevenService.normaliseTranscription(raw);

    if (segments.length === 0) throw new Error("Empty transcription returned.");

    await meetingService.saveTranscript(meetingId, segments.map((s) => ({
      speaker: s.speaker, text: s.text, timestamp: s.timestamp,
    })));

    const meeting = await meetingService.getMeetingById(meetingId);
    const analysis = await grokService.analyzeMeetingTranscript(meeting.transcript, meeting.title);

    await meetingService.saveMeetingAnalysis(meetingId, {
      summary: analysis.summary,
      decisions: analysis.decisions,
      action_items: analysis.action_items.map((a) => ({
        text: a.text, assignee: a.assignee, due_date: a.due_date ?? undefined,
      })),
    });

    try {
      const updated = await meetingService.getMeetingById(meetingId);
      const chunks = grokService.generateMeetingChunks({
        id: meetingId, title: updated.title, summary: updated.summary,
        transcript: updated.transcript, tags: updated.tags, participants: updated.participants,
      });
      await pineconeService.upsertMeetingVectors(chunks.map((c) => ({
        id: c.id, text: c.text, meetingId,
        meetingTitle: updated.title, meetingDate: updated.date, contentType: c.type,
      })));
    } catch (pineconeErr) {
      logger.warn(`[pipeline] Pinecone failed (non-fatal)`, {
        error: pineconeErr instanceof Error ? pineconeErr.message : String(pineconeErr),
      });
    }

    logger.info(`[pipeline] ✅ ${meetingId} complete`);
  } catch (err) {
    logger.error(`[pipeline] ❌ ${meetingId}`, { error: err instanceof Error ? err.message : err });
    await meetingService.updateMeeting(meetingId, { status: "scheduled" }).catch(() => {});
    throw err;
  } finally {
    fs.unlink(filePath, () => {});
    if (extractedAudioPath) fs.unlink(extractedAudioPath, () => {});
  }
}

export default router;