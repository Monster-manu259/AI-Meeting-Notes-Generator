import { Router, Request, Response, NextFunction } from "express";
import { param } from "express-validator";
import { validationResult } from "express-validator";
import * as meetingService from "../services/meetingService";
import * as grokService from "../services/grokService";
import * as pineconeService from "../services/pineconeService";
import { logger } from "../middleware/logger";

const router = Router();

function ok(req: Request, res: Response, next: NextFunction): void {
  const errs = validationResult(req);
  if (!errs.isEmpty()) {
    res.status(400).json({ success: false, errors: errs.array() });
    return;
  }
  next();
}

router.post("/analyze/:meetingId", [param("meetingId").isUUID()], ok,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { meetingId } = req.params;
      const meeting = await meetingService.getMeetingById(meetingId);

      if (!meeting.transcript || meeting.transcript.length === 0) {
        res.status(400).json({
          success: false,
          error: "No transcript available. Upload audio first.",
        });
        return;
      }

      logger.info(`[AI route] Running analysis for meeting ${meetingId}`);

      await meetingService.updateMeeting(meetingId, { status: "processing" });

      (async () => {
        try {
          const analysis = await grokService.analyzeMeetingTranscript(
            meeting.transcript,
            meeting.title
          );
          await meetingService.saveMeetingAnalysis(meetingId, { summary: analysis.summary, decisions: analysis.decisions, action_items: analysis.action_items.map((a) => ({ text: a.text, assignee: a.assignee, due_date: a.due_date ?? undefined, })), });
          logger.info(`[AI route] ✅ Analysis saved for meeting ${meetingId}`);

          try {
            const updated = await meetingService.getMeetingById(meetingId);
            const chunks = grokService.generateMeetingChunks({
              id: meetingId,
              title: updated.title,
              summary: updated.summary,
              transcript: updated.transcript,
              tags: updated.tags,
              participants: updated.participants,
            });
            await pineconeService.upsertMeetingVectors(
              chunks.map((c) => ({
                id: c.id,
                text: c.text,
                meetingId,
                meetingTitle: updated.title,
                meetingDate: updated.date,
                contentType: c.type,
              }))
            );
          } catch (pineconeErr) {
            logger.warn(`[AI route] Pinecone indexing failed (non-fatal)`, {
              error: pineconeErr instanceof Error ? pineconeErr.message : String(pineconeErr),
            });
          }
        } catch (analysisErr) {
          logger.error(`[AI route] Analysis failed for meeting ${meetingId}`, {
            error: analysisErr instanceof Error ? analysisErr.message : String(analysisErr),
            stack: analysisErr instanceof Error ? analysisErr.stack : undefined,
          });
          await meetingService.updateMeeting(meetingId, { status: "scheduled" }).catch(() => {});
        }
      })();

      res.json({
        success: true,
        message: "Analysis started. Refresh in 10-15 seconds.",
        data: { meetingId },
      });
    } catch (e) {
      next(e);
    }
  }
);

router.post("/index/:meetingId", [param("meetingId").isUUID()], ok,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { meetingId } = req.params;
      const meeting = await meetingService.getMeetingById(meetingId);

      if (!meeting.summary) {
        res.status(400).json({
          success: false,
          error: "No summary yet — run analysis first.",
        });
        return;
      }

      const chunks = grokService.generateMeetingChunks({
        id: meetingId,
        title: meeting.title,
        summary: meeting.summary,
        transcript: meeting.transcript,
        tags: meeting.tags,
        participants: meeting.participants,
      });

      await pineconeService.upsertMeetingVectors(
        chunks.map((c) => ({
          id: c.id,
          text: c.text,
          meetingId,
          meetingTitle: meeting.title,
          meetingDate: meeting.date,
          contentType: c.type,
        }))
      );

      res.json({
        success: true,
        message: `Indexed ${chunks.length} vectors.`,
        data: { vectorCount: chunks.length },
      });
    } catch (e) {
      next(e);
    }
  }
);

export default router;