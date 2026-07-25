import type { D1Database } from "@cloudflare/workers-types";
import type { WakiCoderJob, WakiCoderStatus } from "@/lib/waki-coder";

export type BuildJob = {
  id: string;
  sessionId: string;
  coderJobId: string;
  requestId: string;
  status: WakiCoderStatus;
  stage: string;
  percent: number;
  previewUrl: string | null;
  previewExpiresAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type BuildRow = {
  id: string; session_id: string; coder_job_id: string; request_id: string;
  status: WakiCoderStatus; stage: string; percent: number; preview_url: string | null;
  preview_expires_at: string | null; error_message: string | null; created_at: string; updated_at: string;
};

function map(row: BuildRow): BuildJob {
  return { id: row.id, sessionId: row.session_id, coderJobId: row.coder_job_id, requestId: row.request_id,
    status: row.status, stage: row.stage, percent: row.percent, previewUrl: row.preview_url,
    previewExpiresAt: row.preview_expires_at, errorMessage: row.error_message, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function createBuildJob(db: D1Database, input: { id: string; sessionId: string; requestId: string; job: WakiCoderJob }) {
  await db.prepare(`INSERT INTO build_jobs
    (id, session_id, coder_job_id, request_id, status, stage, percent, preview_url, preview_expires_at, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      coder_job_id = excluded.coder_job_id, status = excluded.status, stage = excluded.stage,
      percent = excluded.percent, preview_url = excluded.preview_url, preview_expires_at = excluded.preview_expires_at,
      error_message = excluded.error_message, updated_at = CURRENT_TIMESTAMP`)
    .bind(input.id, input.sessionId, input.job.jobId, input.requestId, input.job.status,
      input.job.progress?.stage || "Request accepted", input.job.progress?.percent || 0,
      input.job.previewUrl || null, input.job.previewExpiresAt || null, input.job.error?.message || null).run();
}

export async function updateBuildJob(db: D1Database, coderJobId: string, job: Partial<WakiCoderJob> & { status: WakiCoderStatus }) {
  await db.prepare(`UPDATE build_jobs SET status = ?, stage = COALESCE(?, stage), percent = COALESCE(?, percent),
    preview_url = COALESCE(?, preview_url), preview_expires_at = COALESCE(?, preview_expires_at),
    error_message = COALESCE(?, error_message), updated_at = CURRENT_TIMESTAMP WHERE coder_job_id = ?`)
    .bind(job.status, job.progress?.stage || null, job.progress?.percent ?? null, job.previewUrl || null,
      job.previewExpiresAt || null, job.error?.message || null, coderJobId).run();
}

export async function getBuildJob(db: D1Database, id: string) {
  const row = await db.prepare("SELECT * FROM build_jobs WHERE id = ?").bind(id).first<BuildRow>();
  return row ? map(row) : null;
}

export async function getBuildForSession(db: D1Database, sessionId: string) {
  const row = await db.prepare("SELECT * FROM build_jobs WHERE session_id = ?").bind(sessionId).first<BuildRow>();
  return row ? map(row) : null;
}

export function toBrowserBuild(build: BuildJob) {
  return {
    id: build.id,
    status: build.status,
    stage: build.stage,
    percent: build.percent,
    previewUrl: build.previewUrl,
    previewExpiresAt: build.previewExpiresAt,
    error: build.errorMessage,
    updatedAt: build.updatedAt,
  };
}

export async function recordBuildDelivery(db: D1Database, deliveryId: string, coderJobId: string, eventType: string) {
  const result = await db.prepare("INSERT OR IGNORE INTO build_webhook_deliveries (delivery_id, coder_job_id, event_type) VALUES (?, ?, ?)")
    .bind(deliveryId, coderJobId, eventType).run();
  return result.meta.changes > 0;
}
