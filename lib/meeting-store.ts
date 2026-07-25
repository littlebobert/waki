import type { D1Database } from "@cloudflare/workers-types";

export type MeetingSession = {
  id: string;
  attendeeBotId: string | null;
  meetingUrl: string;
  botState: string;
  transcriptionState: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TranscriptUtterance = {
  speakerName: string;
  speakerUuid: string | null;
  timestampMs: number;
  durationMs: number;
  transcript: string;
};

type SessionRow = {
  id: string;
  attendee_bot_id: string | null;
  meeting_url: string;
  bot_state: string;
  transcription_state: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type UtteranceRow = {
  speaker_name: string;
  speaker_uuid: string | null;
  timestamp_ms: number;
  duration_ms: number;
  transcript: string;
};

function mapSession(row: SessionRow): MeetingSession {
  return {
    id: row.id,
    attendeeBotId: row.attendee_bot_id,
    meetingUrl: row.meeting_url,
    botState: row.bot_state,
    transcriptionState: row.transcription_state,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createMeetingSession(db: D1Database, session: { id: string; meetingUrl: string }) {
  await db.prepare(
    "INSERT INTO meeting_sessions (id, meeting_url) VALUES (?, ?)",
  ).bind(session.id, session.meetingUrl).run();
}

export async function attachAttendeeBot(db: D1Database, sessionId: string, bot: { id: string; state: string; transcriptionState?: string }) {
  await db.prepare(
    `UPDATE meeting_sessions
     SET attendee_bot_id = ?, bot_state = ?, transcription_state = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).bind(bot.id, bot.state, bot.transcriptionState || "not_started", sessionId).run();
}

export async function markSessionError(db: D1Database, sessionId: string, message: string) {
  await db.prepare(
    "UPDATE meeting_sessions SET bot_state = 'fatal_error', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(message, sessionId).run();
}

export async function updateSessionState(db: D1Database, botId: string, state: string, errorMessage: string | null = null) {
  await db.prepare(
    `UPDATE meeting_sessions
     SET bot_state = ?, error_message = COALESCE(?, error_message), updated_at = CURRENT_TIMESTAMP
     WHERE attendee_bot_id = ?`,
  ).bind(state, errorMessage, botId).run();
}

export async function recordWebhookDelivery(db: D1Database, delivery: { idempotencyKey: string; botId: string; trigger: string }) {
  const result = await db.prepare(
    "INSERT OR IGNORE INTO webhook_deliveries (idempotency_key, bot_id, trigger) VALUES (?, ?, ?)",
  ).bind(delivery.idempotencyKey, delivery.botId, delivery.trigger).run();
  return result.meta.changes > 0;
}

export async function insertWakiChatCommand(db: D1Database, botId: string, input: {
  id: string;
  idempotencyKey: string;
  senderName: string;
  command: string;
  timestampMs: number;
}) {
  await db.prepare(
    `INSERT OR IGNORE INTO waki_chat_commands
      (id, session_id, idempotency_key, sender_name, command, timestamp_ms)
     SELECT ?, id, ?, ?, ?, ? FROM meeting_sessions WHERE attendee_bot_id = ?`,
  ).bind(input.id, input.idempotencyKey, input.senderName, input.command, input.timestampMs, botId).run();
}

export async function getLatestWakiChatCommand(db: D1Database, sessionId: string) {
  return db.prepare(
    `SELECT id, sender_name AS senderName, command, timestamp_ms AS timestampMs
     FROM waki_chat_commands WHERE session_id = ? ORDER BY timestamp_ms DESC LIMIT 1`,
  ).bind(sessionId).first<{ id: string; senderName: string; command: string; timestampMs: number }>();
}

export async function insertUtterance(db: D1Database, botId: string, idempotencyKey: string, utterance: TranscriptUtterance) {
  await db.prepare(
    `INSERT OR IGNORE INTO transcript_utterances
      (session_id, idempotency_key, speaker_name, speaker_uuid, timestamp_ms, duration_ms, transcript)
     SELECT id, ?, ?, ?, ?, ?, ? FROM meeting_sessions WHERE attendee_bot_id = ?`,
  ).bind(
    idempotencyKey,
    utterance.speakerName,
    utterance.speakerUuid,
    utterance.timestampMs,
    utterance.durationMs,
    utterance.transcript,
    botId,
  ).run();
}

export async function getMeetingSessionByBotId(db: D1Database, botId: string) {
  const row = await db.prepare(
    `SELECT id, attendee_bot_id, meeting_url, bot_state, transcription_state, error_message, created_at, updated_at
     FROM meeting_sessions WHERE attendee_bot_id = ?`,
  ).bind(botId).first<SessionRow>();
  return row ? mapSession(row) : null;
}

export async function getMeetingSession(db: D1Database, sessionId: string) {
  const row = await db.prepare(
    `SELECT id, attendee_bot_id, meeting_url, bot_state, transcription_state, error_message, created_at, updated_at
     FROM meeting_sessions WHERE id = ?`,
  ).bind(sessionId).first<SessionRow>();
  return row ? mapSession(row) : null;
}

export async function getSessionUtterances(db: D1Database, sessionId: string) {
  const result = await db.prepare(
    `SELECT speaker_name, speaker_uuid, timestamp_ms, duration_ms, transcript
     FROM transcript_utterances WHERE session_id = ? ORDER BY timestamp_ms ASC, id ASC`,
  ).bind(sessionId).all<UtteranceRow>();

  return result.results.map((row) => ({
    speakerName: row.speaker_name,
    speakerUuid: row.speaker_uuid,
    timestampMs: row.timestamp_ms,
    durationMs: row.duration_ms,
    transcript: row.transcript,
  }));
}

export function normalizeTranscript(utterances: TranscriptUtterance[]) {
  return utterances.map((utterance) => `${utterance.speakerName || "Unknown speaker"}: ${utterance.transcript.trim()}`).join("\n\n");
}
