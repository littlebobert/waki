CREATE TABLE IF NOT EXISTS build_jobs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  coder_job_id TEXT NOT NULL UNIQUE,
  request_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  percent INTEGER NOT NULL DEFAULT 0,
  preview_url TEXT,
  preview_expires_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES meeting_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS build_webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  coder_job_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_build_jobs_session ON build_jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_build_jobs_coder_job ON build_jobs(coder_job_id);
