import fs from "fs";
import https from "https";
import http from "http";
import path from "path";
import { logger } from "../middleware/logger";
import {
  ElevenLabsTranscription,
  ElevenLabsUtterance,
  NormalisedSegment,
} from "../types";

const ELEVENLABS_HOST = "api.elevenlabs.io";
const ELEVENLABS_PATH = "/v1/speech-to-text";

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set in .env");
  return key;
}

function buildMultipart(fields: Record<string, string>, fileBuffer: Buffer, filename: string, mimeType: string) {
  const boundary = `----MeetingMindBoundary${Date.now()}`;
  const parts: Buffer[] = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    ));
  }

  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
  ));
  parts.push(fileBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return { body: Buffer.concat(parts), boundary };
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string,
  options: { diarize?: boolean; languageCode?: string } = {}
): Promise<ElevenLabsTranscription> {
  const apiKey = getApiKey();
  const mimeType = detectMimeType(filename);

  const fields: Record<string, string> = {
    model_id: "scribe_v1",
    diarize: String(options.diarize ?? true),
  };
  if (options.languageCode) fields.language_code = options.languageCode;

  const { body, boundary } = buildMultipart(fields, audioBuffer, filename, mimeType);

  logger.info("[ElevenLabs] Starting transcription", { filename, size: audioBuffer.length, mimeType });

  return new Promise<ElevenLabsTranscription>((resolve, reject) => {
    const options_: https.RequestOptions = {
      hostname: ELEVENLABS_HOST,
      path: ELEVENLABS_PATH,
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
      },
    };

    const req = https.request(options_, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        logger.debug("[ElevenLabs] Raw response", { status: res.statusCode, preview: raw.slice(0, 300) });

        if (res.statusCode !== 200) {
          reject(new Error(`ElevenLabs API error [${res.statusCode}]: ${raw.slice(0, 500)}`));
          return;
        }

        try {
          const data = JSON.parse(raw) as ElevenLabsTranscription;
          logger.info("[ElevenLabs] Transcription complete", {
            filename,
            language: data.language_code,
            words: data.words?.length ?? 0,
            utterances: data.utterances?.length ?? 0,
            textPreview: data.text?.slice(0, 100),
          });
          resolve(data);
        } catch (e) {
          reject(new Error(`Failed to parse ElevenLabs response: ${raw.slice(0, 200)}`));
        }
      });
    });

    req.on("error", (err) => {
      reject(new Error(`ElevenLabs network error: ${err.message}`));
    });

    req.write(body);
    req.end();
  });
}

export function normaliseTranscription(
  transcription: ElevenLabsTranscription,
  speakerNames?: Record<string, string>
): NormalisedSegment[] {

  const mapSpeaker = (id: string): string => {
    if (speakerNames?.[id]) return speakerNames[id];
    const match = id.match(/\d+$/);
    return match ? `Speaker ${parseInt(match[0]) + 1}` : id;
  };

  if (transcription.utterances && transcription.utterances.length > 0) {
    return transcription.utterances.map((u: ElevenLabsUtterance) => ({
      speaker: mapSpeaker(u.speaker_id),
      text: u.text.trim(),
      timestamp: secondsToTimestamp(u.start),
      start: u.start,
      end: u.end,
    }));
  }

  if (transcription.words && transcription.words.length > 0) {

    const segments: NormalisedSegment[] = [];

    const CHUNK_SIZE = 15;

    for (let i = 0; i < transcription.words.length; i += CHUNK_SIZE) {

      const chunk = transcription.words.slice(i, i + CHUNK_SIZE);

      segments.push({
        speaker: "Speaker",
        text: chunk.map(w => w.text).join(" "),
        timestamp: secondsToTimestamp(chunk[0].start),
        start: chunk[0].start,
        end: chunk[chunk.length - 1].end,
      });

    }

    return segments;
  }


  if (!transcription.text) {
    logger.warn("[ElevenLabs] No transcription content");
    return [];
  }

  const sentences = transcription.text.split(/(?<=[.!?])\s+/).filter(Boolean);

  return sentences.map((sentence, i) => ({
    speaker: "Speaker",
    text: sentence.trim(),
    timestamp: secondsToTimestamp(i * 5), // fake but progressive timestamp
    start: i * 5,
    end: (i + 1) * 5,
  }));
}

function secondsToTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function detectMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".mp3": "audio/mpeg",
    ".mp4": "audio/mp4",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".webm": "audio/webm",
    ".flac": "audio/flac",
    ".aac": "audio/aac",
  };
  return map[ext] ?? "audio/mpeg";
}