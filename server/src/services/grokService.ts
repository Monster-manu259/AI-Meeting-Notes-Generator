// src/services/grokService.ts
import Groq from "groq-sdk";
import { logger } from "../middleware/logger";
import { AIAnalysis, TranscriptEntry } from "../types";

let groqClient: Groq | null = null;

const MODELS = ["llama-3.3-70b-versatile", "llama3-70b-8192", "llama3-8b-8192"];

function getClient(): Groq {
  if (groqClient) return groqClient;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set. Get a key at https://console.groq.com");
  groqClient = new Groq({ apiKey });
  return groqClient;
}

export async function analyzeMeetingTranscript(
  transcript: TranscriptEntry[],
  meetingTitle: string
): Promise<AIAnalysis> {
  const client = getClient();

  const transcriptText = transcript
    .map((e) => `[${e.timestamp}] ${e.speaker}: ${e.text}`)
    .join("\n");

  const prompt = `You are an expert meeting analyst. Analyze this transcript for the meeting titled "${meetingTitle}".

TRANSCRIPT:
${transcriptText}

Respond ONLY with a valid JSON object — no markdown fences, no preamble, no explanation.
Use exactly this structure:
{
  "summary": "2-3 sentence plain-English summary of what was discussed",
  "action_items": [
    { "text": "action description", "assignee": "person name or Unknown", "due_date": null }
  ],
  "decisions": ["decision 1", "decision 2"],
  "key_topics": ["topic 1", "topic 2", "topic 3"],
  "sentiment": "positive"
}

Rules:
- sentiment must be exactly one of: "positive", "neutral", "negative"
- due_date must be null or a "YYYY-MM-DD" string
- action_items may be an empty array [] if there are none
- decisions may be an empty array [] if there are none
- Always include all 5 fields`;

  let lastError: Error | null = null;

  for (const model of MODELS) {
    try {
      logger.info(`[Groq] Trying model: ${model}`);

      const completion = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 2000,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error("Empty response from Groq");

      logger.debug(`[Groq] Raw response preview: ${content.slice(0, 200)}`);

      const cleaned = content
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error(`No JSON object found in response: ${cleaned.slice(0, 200)}`);

      const analysis: AIAnalysis = JSON.parse(jsonMatch[0]);

      if (!analysis.summary) throw new Error("Missing 'summary' field in response");
      if (!Array.isArray(analysis.action_items)) analysis.action_items = [];
      if (!Array.isArray(analysis.decisions)) analysis.decisions = [];
      if (!Array.isArray(analysis.key_topics)) analysis.key_topics = [];
      if (!["positive", "neutral", "negative"].includes(analysis.sentiment)) {
        analysis.sentiment = "neutral";
      }

      logger.info(`[Groq] ✅ Analysis complete with model ${model}`, {
        meetingTitle,
        model,
        actionItems: analysis.action_items.length,
        decisions: analysis.decisions.length,
        sentiment: analysis.sentiment,
      });

      return analysis;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn(`[Groq] Model ${model} failed: ${lastError.message}`);
    }
  }

  logger.error("[Groq] All models failed", { error: lastError?.message, meetingTitle });
  throw new Error(`Groq analysis failed after trying all models: ${lastError?.message}`);
}

export async function answerWithContext(
  question: string,
  contextChunks: string[]
): Promise<string> {
  const client = getClient();
  const contextText = contextChunks.join("\n\n---\n\n");

  const prompt = `You are a helpful meeting assistant. Answer the user's question using ONLY the meeting context below.
If the answer is not present in the context, say "I couldn't find that in your meetings."

MEETING CONTEXT:
${contextText}

QUESTION: ${question}

Answer concisely in 2-3 sentences:`;

  for (const model of MODELS) {
    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
      });
      return completion.choices[0]?.message?.content ?? "No response generated.";
    } catch {
      continue;
    }
  }
  return "I was unable to process your query at this time.";
}

export function generateMeetingChunks(meeting: {
  id: string;
  title: string;
  summary: string | null;
  transcript: TranscriptEntry[];
  tags: string[];
  participants: string[];
}): Array<{ id: string; text: string; type: "summary" | "transcript" }> {
  const chunks: Array<{ id: string; text: string; type: "summary" | "transcript" }> = [];

  if (meeting.summary) {
    chunks.push({
      id: `${meeting.id}_summary`,
      text: `Meeting: ${meeting.title}\nParticipants: ${meeting.participants.join(", ")}\nSummary: ${meeting.summary}`,
      type: "summary",
    });
  }

  const windowSize = 6;
  const step = 4;
  for (let i = 0; i < meeting.transcript.length; i += step) {
    const slice = meeting.transcript.slice(i, i + windowSize);
    const text = slice.map((e) => `${e.speaker}: ${e.text}`).join("\n");
    chunks.push({
      id: `${meeting.id}_transcript_${i}`,
      text: `Meeting: ${meeting.title}\n${text}`,
      type: "transcript",
    });
    if (i + windowSize >= meeting.transcript.length) break;
  }

  return chunks;
}