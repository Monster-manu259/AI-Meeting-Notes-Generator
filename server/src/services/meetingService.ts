import { query, transaction } from "../db";
import { logger } from "../middleware/logger";
import {
  Meeting, MeetingWithDetails, CreateMeetingBody,
  UpdateMeetingBody, ActionItem, TranscriptEntry,
  AIAnalysis, NormalisedSegment,
} from "../types";


export async function getAllMeetings(
  userId: string,
  status?: string,
  search?: string
): Promise<Meeting[]> {
  let sql = `
    SELECT id, title, date, duration, participants, status, tags,
           summary, audio_file_path, created_at, updated_at
    FROM meetings
    WHERE user_id = $1
  `;
  const params: unknown[] = [userId];

  if (status) {
    params.push(status);
    sql += ` AND status = $${params.length}`;
  }
  if (search) {
    params.push(`%${search}%`);
    sql += ` AND (title ILIKE $${params.length} OR $${params.length} = ANY(tags))`;
  }

  sql += " ORDER BY date DESC";
  const result = await query<Meeting>(sql, params);
  return result.rows;
}

export async function getMeetingById(
  meetingId: string,
  userId?: string   
): Promise<MeetingWithDetails> {
  const conditions = userId
    ? "WHERE m.id = $1 AND m.user_id = $2"
    : "WHERE m.id = $1";
  const params = userId ? [meetingId, userId] : [meetingId];

  const result = await query<Meeting>(
    `SELECT id, title, date, duration, participants, status, tags,
            summary, audio_file_path, created_at, updated_at
     FROM meetings m ${conditions}`,
    params
  );

  if (result.rows.length === 0) {
    throw new Error(`Meeting not found`);
  }

  const meeting = result.rows[0];

  const [actionItems, transcript, decisions] = await Promise.all([
    query<ActionItem>(
      "SELECT * FROM action_items WHERE meeting_id = $1 ORDER BY created_at",
      [meetingId]
    ),
    query<TranscriptEntry>(
      "SELECT * FROM transcript_entries WHERE meeting_id = $1 ORDER BY sequence_order",
      [meetingId]
    ),
    query<{ id: string; meeting_id: string; text: string; created_at: string }>(
      "SELECT * FROM decisions WHERE meeting_id = $1 ORDER BY created_at",
      [meetingId]
    ),
  ]);

  return {
    ...meeting,
    action_items: actionItems.rows,
    transcript: transcript.rows,
    decisions: decisions.rows,
  };
}

export async function createMeeting(
  userId: string,
  body: CreateMeetingBody & { duration?: string }
): Promise<Meeting> {
  const result = await query<Meeting>(
    `INSERT INTO meetings (user_id, title, date, duration, participants, tags, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, title, date, duration, participants, status, tags,
               summary, audio_file_path, created_at, updated_at`,
    [
      userId,
      body.title,
      body.date,
      body.duration ?? null,
      body.participants,
      body.tags ?? [],
      body.status ?? "scheduled",
    ]
  );
  return result.rows[0];
}

export async function updateMeeting(
  meetingId: string,
  body: Partial<UpdateMeetingBody & { status: string }>,
  userId?: string
): Promise<Meeting> {
  const fields: string[] = [];
  const params: unknown[] = [];

  const allowed = ["title", "date", "duration", "participants", "tags", "status", "summary", "audio_file_path"] as const;
  for (const key of allowed) {
    if (body[key as keyof typeof body] !== undefined) {
      params.push(body[key as keyof typeof body]);
      fields.push(`${key} = $${params.length}`);
    }
  }

  if (fields.length === 0) return getMeetingById(meetingId, userId);

  params.push(meetingId);
  const idParam = `$${params.length}`;

  let sql = `UPDATE meetings SET ${fields.join(", ")} WHERE id = ${idParam}`;
  if (userId) {
    params.push(userId);
    sql += ` AND user_id = $${params.length}`;
  }
  sql += ` RETURNING id, title, date, duration, participants, status, tags,
                     summary, audio_file_path, created_at, updated_at`;

  const result = await query<Meeting>(sql, params);
  if (result.rows.length === 0) throw new Error("Meeting not found");
  return result.rows[0];
}

export async function deleteMeeting(meetingId: string, userId?: string): Promise<void> {
  const params: unknown[] = [meetingId];
  let sql = "DELETE FROM meetings WHERE id = $1";
  if (userId) { params.push(userId); sql += " AND user_id = $2"; }
  await query(sql, params);
}

export async function getStats(userId: string) {
  const result = await query<{
    total: string;
    completed: string;
    total_duration_minutes: string;
    actions_done: string;
    actions_pending: string;
  }>(
    `SELECT
       COUNT(DISTINCT m.id)::text AS total,
       COUNT(DISTINCT CASE WHEN m.status = 'completed' THEN m.id END)::text AS completed,
       COALESCE(SUM(
         CASE
           WHEN m.duration ~ '^[0-9]+$' THEN m.duration::int
           ELSE 0
         END
       ), 0)::text AS total_duration_minutes,
       COUNT(CASE WHEN ai.completed = TRUE THEN 1 END)::text AS actions_done,
       COUNT(CASE WHEN ai.completed = FALSE THEN 1 END)::text AS actions_pending
     FROM meetings m
     LEFT JOIN action_items ai ON ai.meeting_id = m.id
     WHERE m.user_id = $1`,
    [userId]
  );

  const row = result.rows[0];
  return {
    totalMeetings: parseInt(row.total),
    totalHours: Math.round(parseInt(row.total_duration_minutes) / 60 * 10) / 10,
    actionItemsCompleted: parseInt(row.actions_done),
    actionItemsPending: parseInt(row.actions_pending),
  };
}

export async function getActionItems(meetingId: string): Promise<ActionItem[]> {
  const result = await query<ActionItem>(
    "SELECT * FROM action_items WHERE meeting_id = $1 ORDER BY created_at",
    [meetingId]
  );
  return result.rows;
}

export async function createActionItem(
  meetingId: string,
  body: { text: string; assignee: string; due_date?: string }
): Promise<ActionItem> {
  const result = await query<ActionItem>(
    `INSERT INTO action_items (meeting_id, text, assignee, due_date)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [meetingId, body.text, body.assignee, body.due_date ?? null]
  );
  return result.rows[0];
}

export async function toggleActionItem(meetingId: string, itemId: string): Promise<ActionItem> {
  const result = await query<ActionItem>(
    `UPDATE action_items SET completed = NOT completed
     WHERE id = $1 AND meeting_id = $2
     RETURNING *`,
    [itemId, meetingId]
  );
  if (result.rows.length === 0) throw new Error("Action item not found");
  return result.rows[0];
}

export async function deleteActionItem(meetingId: string, itemId: string): Promise<void> {
  await query("DELETE FROM action_items WHERE id = $1 AND meeting_id = $2", [itemId, meetingId]);
}


export async function saveTranscript(
  meetingId: string,
  segments: Array<{ speaker: string; text: string; timestamp: string }>
): Promise<void> {
  await query("DELETE FROM transcript_entries WHERE meeting_id = $1", [meetingId]);

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    await query(
      `INSERT INTO transcript_entries (meeting_id, speaker, text, timestamp, sequence_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [meetingId, s.speaker, s.text, s.timestamp, i + 1]
    );
  }
}

export async function saveMeetingAnalysis(
  meetingId: string,
  analysis: {
    summary: string;
    decisions: string[];
    action_items: Array<{ text: string; assignee: string; due_date?: string }>;
  }
): Promise<void> {
  await query("UPDATE meetings SET summary = $1, status = 'completed' WHERE id = $2", [
    analysis.summary, meetingId,
  ]);

  await query("DELETE FROM decisions WHERE meeting_id = $1", [meetingId]);
  for (const text of analysis.decisions) {
    await query("INSERT INTO decisions (meeting_id, text) VALUES ($1, $2)", [meetingId, text]);
  }

  await query("DELETE FROM action_items WHERE meeting_id = $1", [meetingId]);
  for (const item of analysis.action_items) {
    await query(
      `INSERT INTO action_items (meeting_id, text, assignee, due_date)
       VALUES ($1, $2, $3, $4)`,
      [meetingId, item.text, item.assignee, item.due_date ?? null]
    );
  }
}