// src/routes/search.ts
import { Router, Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";
import * as pineconeService from "../services/pineconeService";
import * as grokService from "../services/grokService";
import { AppError } from "../middleware/errorHandler";
import { SearchResult } from "../types";

const router = Router();

function validate(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }
  next();
}

router.post(
  "/",
  [
    body("query").isString().trim().isLength({ min: 1, max: 1000 }),
    body("limit").optional().isInt({ min: 1, max: 20 }),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { query, limit = 5 } = req.body as { query: string; limit?: number };

      const vectorResults = await pineconeService.searchSimilarContent(query, limit);

      if (vectorResults.length === 0) {
        res.json({
          success: true,
          data: {
            results: [],
            answer: "No relevant meetings found for your query.",
          },
        });
        return;
      }

      const context = vectorResults.map(
        (r) => `[Meeting: ${r.meetingTitle} - ${new Date(r.meetingDate).toLocaleDateString()}]\n${r.text}`
      );

      const answer = await grokService.answerWithContext(query, context);

      const results: SearchResult[] = vectorResults.map((r) => ({
        meeting_id: r.meetingId,
        meeting_title: r.meetingTitle,
        meeting_date: r.meetingDate,
        excerpt: r.text.slice(0, 200) + (r.text.length > 200 ? "..." : ""),
        score: r.score,
        type: r.contentType as SearchResult["type"],
      }));

      res.json({
        success: true,
        data: { answer, results },
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/stats",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await pineconeService.getIndexStats();
      res.json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  }
);

export default router;