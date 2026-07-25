CREATE TABLE IF NOT EXISTS waki_chat_commands (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  sender_name TEXT NOT NULL,
  command TEXT NOT NULL,
  timestamp_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES meeting_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_waki_chat_commands_session_timestamp
  ON waki_chat_commands(session_id, timestamp_ms DESC);
