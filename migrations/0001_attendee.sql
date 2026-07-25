CREATE TABLE IF NOT EXISTS meeting_sessions (
  id TEXT PRIMARY KEY,
  attendee_bot_id TEXT UNIQUE,
  meeting_url TEXT NOT NULL,
  bot_state TEXT NOT NULL DEFAULT 'creating',
  transcription_state TEXT NOT NULL DEFAULT 'not_started',
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  idempotency_key TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transcript_utterances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  speaker_name TEXT NOT NULL,
  speaker_uuid TEXT,
  timestamp_ms INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  transcript TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES meeting_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transcript_session_timestamp
  ON transcript_utterances(session_id, timestamp_ms, id);
