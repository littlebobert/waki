import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type {
  ApprovalRequest,
  ClarificationAnswer,
  DemoRequest,
  FeedbackRequest,
  JobArtifact,
  JobEvent,
  JobResponse,
  JobStatus,
  ProductSpec,
} from "@waki/contracts";
import { AppError } from "./errors.js";

interface JobRow {
  job_id: string;
  request_id: string;
  request_json: string;
  status: JobStatus;
  stage: string;
  percent: number;
  spec_version: number;
  preview_url: string | null;
  preview_expires_at: string | null;
  sandbox_id: string | null;
  approved_at: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  payload_json: string;
}

interface ArtifactRow {
  job_id: string;
  artifact_type: string;
  version: number;
  payload_json: string;
  metadata_json: string;
  created_at: string;
}

interface OutboxRow {
  id: number;
  job_id: string;
  event_type: string;
  payload_json: string;
  attempts: number;
  request_json: string;
}

export interface OutboxDelivery {
  id: number;
  jobId: string;
  eventType: string;
  payload: JobEvent;
  attempts: number;
  callbackUrl: string;
}

function now(): string {
  return new Date().toISOString();
}

function createJobId(): string {
  return `job_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

export class JobRepository {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") {
      mkdirSync(path.dirname(databasePath), { recursive: true });
    }

    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec("PRAGMA journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        job_id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL UNIQUE,
        request_json TEXT NOT NULL,
        status TEXT NOT NULL,
        stage TEXT NOT NULL,
        percent INTEGER NOT NULL,
        spec_version INTEGER NOT NULL DEFAULT 0,
        preview_url TEXT,
        preview_expires_at TEXT,
        sandbox_id TEXT,
        approved_at TEXT,
        error_code TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS job_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS clarification_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
        question_id TEXT NOT NULL,
        answer_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(job_id, question_id)
      );

      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
        feedback_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(job_id, feedback_id)
      );

      CREATE TABLE IF NOT EXISTS webhook_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        available_at TEXT NOT NULL,
        delivered_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS job_artifacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
        artifact_type TEXT NOT NULL,
        version INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        UNIQUE(job_id, artifact_type, version)
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_status_updated
        ON jobs(status, updated_at);

      CREATE INDEX IF NOT EXISTS idx_outbox_pending
        ON webhook_outbox(delivered_at, available_at);
    `);

    this.addColumnIfMissing(
      "jobs",
      "preview_expires_at",
      "TEXT",
    );
    this.addColumnIfMissing("jobs", "sandbox_id", "TEXT");
  }

  private addColumnIfMissing(
    table: string,
    column: string,
    definition: string,
  ): void {
    const columns = this.database
      .prepare(`PRAGMA table_info(${table})`)
      .all() as unknown as Array<{ name: string }>;
    if (!columns.some((candidate) => candidate.name === column)) {
      this.database.exec(
        `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`,
      );
    }
  }

  createJob(request: DemoRequest): {
    job: JobResponse;
    created: boolean;
  } {
    const requestJson = JSON.stringify(request);
    const timestamp = now();
    const jobId = createJobId();

    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = this.database
        .prepare(
          `INSERT OR IGNORE INTO jobs (
            job_id, request_id, request_json, status, stage, percent,
            created_at, updated_at
          ) VALUES (?, ?, ?, 'ACCEPTED', 'Request accepted', 0, ?, ?)`,
        )
        .run(jobId, request.requestId, requestJson, timestamp, timestamp);

      if (result.changes === 0) {
        const existing = this.getJobRowByRequestId(request.requestId);
        if (!existing) {
          throw new Error("Idempotency lookup failed");
        }
        if (existing.request_json !== requestJson) {
          throw new AppError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The requestId was already used with a different payload",
          );
        }
        this.database.exec("COMMIT");
        return { job: this.toResponse(existing), created: false };
      }

      const event = this.buildEvent("demo.accepted", jobId, {
        status: "ACCEPTED",
        progress: { stage: "Request accepted", percent: 0 },
      });
      this.insertEventAndOutbox(jobId, event);
      this.database.exec("COMMIT");

      const created = this.getJob(jobId);
      if (!created) {
        throw new Error("Created job could not be loaded");
      }
      return { job: created, created: true };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getJob(jobId: string): JobResponse | null {
    const row = this.database
      .prepare("SELECT * FROM jobs WHERE job_id = ?")
      .get(jobId) as unknown as JobRow | undefined;
    return row ? this.toResponse(row) : null;
  }

  getRequest(jobId: string): DemoRequest | null {
    const row = this.database
      .prepare("SELECT request_json FROM jobs WHERE job_id = ?")
      .get(jobId) as unknown as { request_json: string } | undefined;
    return row ? parseJson<DemoRequest>(row.request_json) : null;
  }

  private getJobRowByRequestId(requestId: string): JobRow | null {
    const row = this.database
      .prepare("SELECT * FROM jobs WHERE request_id = ?")
      .get(requestId) as unknown as JobRow | undefined;
    return row ?? null;
  }

  transition(
    jobId: string,
    from: JobStatus,
    to: JobStatus,
    stage: string,
    percent: number,
  ): boolean {
    const timestamp = now();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = this.database
        .prepare(
          `UPDATE jobs
             SET status = ?, stage = ?, percent = ?, updated_at = ?
           WHERE job_id = ? AND status = ?`,
        )
        .run(to, stage, percent, timestamp, jobId, from);

      if (result.changes === 0) {
        this.database.exec("COMMIT");
        return false;
      }

      const event = this.buildEvent("demo.progress", jobId, {
        status: to,
        progress: { stage, percent },
      });
      this.insertEventAndOutbox(jobId, event);
      this.database.exec("COMMIT");
      return true;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  markSpecReady(jobId: string, specification?: ProductSpec): boolean {
    const timestamp = now();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const current = this.getJob(jobId);
      const nextVersion =
        current && current.specVersion > 0 ? current.specVersion + 1 : 1;
      const result = this.database
        .prepare(
          `UPDATE jobs
             SET status = 'SPEC_READY',
                 stage = 'Product specification ready',
                 percent = 30,
                 spec_version = CASE
                   WHEN spec_version = 0 THEN 1
                   ELSE spec_version + 1
                 END,
                 updated_at = ?
           WHERE job_id = ? AND status = 'SPEC_GENERATING'`,
        )
        .run(timestamp, jobId);

      if (result.changes === 0) {
        this.database.exec("COMMIT");
        return false;
      }

      if (specification) {
        this.insertArtifact(
          jobId,
          "product-spec",
          nextVersion,
          specification,
          { schemaVersion: specification.schemaVersion },
          timestamp,
        );
      }

      const row = this.getJob(jobId);
      const event = this.buildEvent("demo.progress", jobId, {
        status: "SPEC_READY",
        progress: { stage: "Product specification ready", percent: 30 },
        specVersion: row?.specVersion ?? 1,
      });
      this.insertEventAndOutbox(jobId, event);
      this.database.exec("COMMIT");
      return true;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  findNextWorkflowJob(): JobResponse | null {
    const row = this.database
      .prepare(
        `SELECT * FROM jobs
          WHERE status IN (
            'ACCEPTED',
            'SPEC_GENERATING',
            'SPEC_READY',
            'SANDBOX_CREATING',
            'BUILDING',
            'FUNCTIONAL_TESTING',
            'FEEDBACK_RECEIVED'
          )
          ORDER BY updated_at ASC
          LIMIT 1`,
      )
      .get() as unknown as JobRow | undefined;
    return row ? this.toResponse(row) : null;
  }

  findNextStageOneJob(): JobResponse | null {
    const row = this.database
      .prepare(
        `SELECT * FROM jobs
          WHERE status IN ('ACCEPTED', 'SPEC_GENERATING', 'FEEDBACK_RECEIVED')
          ORDER BY updated_at ASC
          LIMIT 1`,
      )
      .get() as unknown as JobRow | undefined;
    return row ? this.toResponse(row) : null;
  }

  saveArtifact<T>(
    jobId: string,
    type: string,
    version: number,
    payload: T,
    metadata: Record<string, unknown> = {},
  ): JobArtifact<T> {
    this.requireJob(jobId);
    const timestamp = now();
    this.insertArtifact(jobId, type, version, payload, metadata, timestamp);
    const artifact = this.getArtifact<T>(jobId, type, version);
    if (!artifact) {
      throw new Error("Saved artifact could not be loaded");
    }
    return artifact;
  }

  getArtifact<T>(
    jobId: string,
    type: string,
    version?: number,
  ): JobArtifact<T> | null {
    this.requireJob(jobId);
    const query =
      version === undefined
        ? `SELECT * FROM job_artifacts
            WHERE job_id = ? AND artifact_type = ?
            ORDER BY version DESC LIMIT 1`
        : `SELECT * FROM job_artifacts
            WHERE job_id = ? AND artifact_type = ? AND version = ?`;
    const row = (
      version === undefined
        ? this.database.prepare(query).get(jobId, type)
        : this.database.prepare(query).get(jobId, type, version)
    ) as unknown as ArtifactRow | undefined;
    return row ? this.toArtifact<T>(row) : null;
  }

  setSandbox(jobId: string, sandboxId: string): boolean {
    const result = this.database
      .prepare(
        `UPDATE jobs
            SET sandbox_id = ?, updated_at = ?
          WHERE job_id = ? AND status = 'SANDBOX_CREATING'`,
      )
      .run(sandboxId, now(), jobId);
    return result.changes > 0;
  }

  markPreviewReady(
    jobId: string,
    preview: { url: string; expiresAt: string },
  ): boolean {
    const timestamp = now();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = this.database
        .prepare(
          `UPDATE jobs
              SET status = 'PREVIEW_READY',
                  stage = 'Interactive preview ready',
                  percent = 100,
                  preview_url = ?,
                  preview_expires_at = ?,
                  updated_at = ?
            WHERE job_id = ? AND status = 'FUNCTIONAL_TESTING'`,
        )
        .run(preview.url, preview.expiresAt, timestamp, jobId);
      if (result.changes === 0) {
        this.database.exec("COMMIT");
        return false;
      }
      const event = this.buildEvent("demo.preview_ready", jobId, {
        status: "PREVIEW_READY",
        progress: { stage: "Interactive preview ready", percent: 100 },
        previewUrl: preview.url,
        previewExpiresAt: preview.expiresAt,
      });
      this.insertEventAndOutbox(jobId, event);
      this.database.exec("COMMIT");
      return true;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  failJob(jobId: string, code: string, message: string): JobResponse {
    const timestamp = now();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          `UPDATE jobs
              SET status = 'FAILED',
                  stage = 'Build failed',
                  error_code = ?,
                  error_message = ?,
                  updated_at = ?
            WHERE job_id = ? AND status <> 'FAILED'`,
        )
        .run(code.slice(0, 120), message.slice(0, 2_000), timestamp, jobId);
      const event = this.buildEvent("demo.failed", jobId, {
        status: "FAILED",
        error: { code, message: message.slice(0, 2_000) },
      });
      this.insertEventAndOutbox(jobId, event);
      this.database.exec("COMMIT");
      return this.requireJob(jobId);
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  saveAnswer(jobId: string, answer: ClarificationAnswer): JobResponse {
    const job = this.requireJob(jobId);
    if (job.status !== "CLARIFICATION_REQUIRED") {
      throw new AppError(
        409,
        "INVALID_JOB_STATE",
        "Clarification answers are accepted only while clarification is required",
      );
    }

    const timestamp = now();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          `INSERT INTO clarification_answers (
            job_id, question_id, answer_json, created_at
          ) VALUES (?, ?, ?, ?)
          ON CONFLICT(job_id, question_id)
          DO UPDATE SET answer_json = excluded.answer_json`,
        )
        .run(jobId, answer.questionId, JSON.stringify(answer.answer), timestamp);

      this.database
        .prepare(
          `UPDATE jobs
             SET status = 'SPEC_GENERATING',
                 stage = 'Applying clarification',
                 percent = 20,
                 updated_at = ?
           WHERE job_id = ?`,
        )
        .run(timestamp, jobId);

      const event = this.buildEvent("demo.progress", jobId, {
        status: "SPEC_GENERATING",
        progress: { stage: "Applying clarification", percent: 20 },
      });
      this.insertEventAndOutbox(jobId, event);
      this.database.exec("COMMIT");
      return this.requireJob(jobId);
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  saveFeedback(jobId: string, feedback: FeedbackRequest): JobResponse {
    const job = this.requireJob(jobId);
    if (job.status !== "PREVIEW_READY") {
      throw new AppError(
        409,
        "INVALID_JOB_STATE",
        "Feedback is accepted only when a preview is ready",
      );
    }

    const timestamp = now();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          `INSERT INTO feedback (
            job_id, feedback_id, payload_json, created_at
          ) VALUES (?, ?, ?, ?)
          ON CONFLICT(job_id, feedback_id) DO NOTHING`,
        )
        .run(jobId, feedback.feedbackId, JSON.stringify(feedback), timestamp);

      this.database
        .prepare(
          `UPDATE jobs
             SET status = 'FEEDBACK_RECEIVED',
                 stage = 'Feedback received',
                 percent = 10,
                 updated_at = ?
           WHERE job_id = ?`,
        )
        .run(timestamp, jobId);

      const event = this.buildEvent("demo.progress", jobId, {
        status: "FEEDBACK_RECEIVED",
        progress: { stage: "Feedback received", percent: 10 },
      });
      this.insertEventAndOutbox(jobId, event);
      this.database.exec("COMMIT");
      return this.requireJob(jobId);
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  approve(jobId: string, approval: ApprovalRequest): JobResponse {
    const job = this.requireJob(jobId);
    if (job.status !== "PREVIEW_READY") {
      throw new AppError(
        409,
        "INVALID_JOB_STATE",
        "A job can be approved only when a preview is ready",
      );
    }
    if (job.specVersion !== approval.specVersion) {
      throw new AppError(
        409,
        "SPEC_VERSION_CONFLICT",
        "The approved specVersion is not the latest version",
      );
    }
    if (job.approvedAt) {
      return job;
    }

    const timestamp = now();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          "UPDATE jobs SET approved_at = ?, updated_at = ? WHERE job_id = ?",
        )
        .run(timestamp, timestamp, jobId);
      const event = this.buildEvent("demo.approved", jobId, {
        status: "PREVIEW_READY",
        specVersion: approval.specVersion,
      });
      this.insertEventAndOutbox(jobId, event);
      this.database.exec("COMMIT");
      return this.requireJob(jobId);
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  listEvents(jobId: string): JobEvent[] {
    this.requireJob(jobId);
    const rows = this.database
      .prepare(
        `SELECT payload_json FROM job_events
          WHERE job_id = ?
          ORDER BY id ASC`,
      )
      .all(jobId) as unknown as EventRow[];
    return rows.map((row) => parseJson<JobEvent>(row.payload_json));
  }

  getPendingDeliveries(limit = 20): OutboxDelivery[] {
    const rows = this.database
      .prepare(
        `SELECT o.id, o.job_id, o.event_type, o.payload_json, o.attempts,
                j.request_json
           FROM webhook_outbox o
           JOIN jobs j ON j.job_id = o.job_id
          WHERE o.delivered_at IS NULL
            AND o.available_at <= ?
            AND o.attempts < 8
            AND NOT EXISTS (
              SELECT 1
                FROM webhook_outbox earlier
               WHERE earlier.job_id = o.job_id
                 AND earlier.id < o.id
                 AND earlier.delivered_at IS NULL
                 AND earlier.attempts < 8
            )
          ORDER BY o.id ASC
          LIMIT ?`,
      )
      .all(now(), limit) as unknown as OutboxRow[];

    return rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      eventType: row.event_type,
      payload: parseJson<JobEvent>(row.payload_json),
      attempts: row.attempts,
      callbackUrl: parseJson<DemoRequest>(row.request_json).callback.url,
    }));
  }

  markDeliverySucceeded(id: number): void {
    this.database
      .prepare(
        `UPDATE webhook_outbox
            SET delivered_at = ?, last_error = NULL
          WHERE id = ?`,
      )
      .run(now(), id);
  }

  markDeliveryFailed(id: number, attempts: number, error: string): void {
    const delaySeconds = Math.min(2 ** attempts, 300);
    const availableAt = new Date(
      Date.now() + delaySeconds * 1_000,
    ).toISOString();
    this.database
      .prepare(
        `UPDATE webhook_outbox
            SET attempts = ?,
                available_at = ?,
                last_error = ?
          WHERE id = ?`,
      )
      .run(attempts, availableAt, error.slice(0, 2_000), id);
  }

  close(): void {
    this.database.close();
  }

  private requireJob(jobId: string): JobResponse {
    const job = this.getJob(jobId);
    if (!job) {
      throw new AppError(404, "JOB_NOT_FOUND", "The requested job was not found");
    }
    return job;
  }

  private insertEventAndOutbox(jobId: string, event: JobEvent): void {
    const timestamp = now();
    const payloadJson = JSON.stringify(event);
    this.database
      .prepare(
        `INSERT INTO job_events (
          job_id, event_type, payload_json, created_at
        ) VALUES (?, ?, ?, ?)`,
      )
      .run(jobId, event.event, payloadJson, timestamp);
    this.database
      .prepare(
        `INSERT INTO webhook_outbox (
          job_id, event_type, payload_json, available_at, created_at
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(jobId, event.event, payloadJson, timestamp, timestamp);
  }

  private insertArtifact<T>(
    jobId: string,
    type: string,
    version: number,
    payload: T,
    metadata: Record<string, unknown>,
    timestamp: string,
  ): void {
    this.database
      .prepare(
        `INSERT INTO job_artifacts (
          job_id, artifact_type, version, payload_json, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(job_id, artifact_type, version)
        DO UPDATE SET
          payload_json = excluded.payload_json,
          metadata_json = excluded.metadata_json`,
      )
      .run(
        jobId,
        type,
        version,
        JSON.stringify(payload),
        JSON.stringify(metadata),
        timestamp,
      );
  }

  private buildEvent(
    event: string,
    jobId: string,
    details: Record<string, unknown>,
  ): JobEvent {
    return {
      event,
      jobId,
      occurredAt: now(),
      ...details,
    };
  }

  private toResponse(row: JobRow): JobResponse {
    return {
      jobId: row.job_id,
      requestId: row.request_id,
      status: row.status,
      progress: {
        stage: row.stage,
        percent: row.percent,
      },
      specVersion: row.spec_version,
      previewUrl: row.preview_url,
      previewExpiresAt: row.preview_expires_at,
      sandboxId: row.sandbox_id,
      approvedAt: row.approved_at,
      error:
        row.error_code && row.error_message
          ? { code: row.error_code, message: row.error_message }
          : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toArtifact<T>(row: ArtifactRow): JobArtifact<T> {
    return {
      jobId: row.job_id,
      type: row.artifact_type,
      version: row.version,
      payload: parseJson<T>(row.payload_json),
      metadata: parseJson<Record<string, unknown>>(row.metadata_json),
      createdAt: row.created_at,
    };
  }
}
