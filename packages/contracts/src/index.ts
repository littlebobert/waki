import { z } from "zod";

const IdentifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export const TextInputSchema = z
  .object({
    id: IdentifierSchema,
    content: z.string().min(1).max(100_000),
  })
  .strict();

export const AudioInputSchema = z
  .object({
    id: IdentifierSchema,
    url: z.string().url(),
    mimeType: z.enum([
      "audio/mpeg",
      "audio/mp4",
      "audio/wav",
      "audio/webm",
      "audio/ogg",
    ]),
  })
  .strict();

export const ScreenshotInputSchema = z
  .object({
    id: IdentifierSchema,
    url: z
      .string()
      .url()
      .refine(
        (value) => {
          try {
            return new URL(value).protocol === "https:";
          } catch {
            return false;
          }
        },
        { message: "Screenshot URL must use HTTPS" },
      ),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    description: z.string().max(2_000).optional(),
  })
  .strict();

export const DemoRequestSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    requestId: IdentifierSchema,
    conversationId: IdentifierSchema,
    userId: IdentifierSchema,
    project: z
      .object({
        name: z.string().min(1).max(120),
        description: z.string().min(1).max(10_000),
      })
      .strict(),
    inputs: z
      .object({
        text: z.array(TextInputSchema).max(20).default([]),
        audio: z.array(AudioInputSchema).max(1).default([]),
        screenshots: z.array(ScreenshotInputSchema).max(3).default([]),
      })
      .strict()
      .refine(
        (inputs) =>
          inputs.text.length + inputs.audio.length + inputs.screenshots.length >
          0,
        { message: "At least one meeting input is required" },
      ),
    preferences: z
      .object({
        targetDevice: z
          .enum(["responsive", "desktop", "mobile"])
          .default("responsive"),
        preferredFramework: z.enum(["react"]).default("react"),
        language: z.string().min(2).max(64).default("English"),
        allowMockData: z.literal(true).default(true),
        allowBackend: z.literal(false).default(false),
      })
      .strict()
      .default({
        targetDevice: "responsive",
        preferredFramework: "react",
        language: "English",
        allowMockData: true,
        allowBackend: false,
      }),
    callback: z
      .object({
        type: z.literal("webhook"),
        url: z.string().url(),
      })
      .strict(),
  })
  .strict();

export const ClarificationAnswerSchema = z
  .object({
    questionId: IdentifierSchema,
    answer: z.union([
      z.string().min(1).max(10_000),
      z.array(z.string().min(1).max(2_000)).min(1).max(20),
    ]),
  })
  .strict();

export const FeedbackRequestSchema = z
  .object({
    feedbackId: IdentifierSchema,
    text: z.string().min(1).max(20_000).optional(),
    audio: AudioInputSchema.optional(),
    screenshots: z.array(ScreenshotInputSchema).max(3).default([]),
  })
  .strict()
  .refine(
    (feedback) =>
      Boolean(feedback.text) ||
      Boolean(feedback.audio) ||
      feedback.screenshots.length > 0,
    { message: "Feedback must include text, audio, or a screenshot" },
  );

export const ApprovalRequestSchema = z
  .object({
    approved: z.literal(true),
    specVersion: z.number().int().positive(),
  })
  .strict();

export const JobStatusSchema = z.enum([
  "ACCEPTED",
  "INPUTS_DOWNLOADING",
  "AUDIO_TRANSCRIBING",
  "SCREENSHOTS_ANALYZING",
  "SPEC_GENERATING",
  "CLARIFICATION_REQUIRED",
  "SPEC_READY",
  "SANDBOX_CREATING",
  "BUILDING",
  "FUNCTIONAL_TESTING",
  "VISUAL_TESTING",
  "REPAIRING",
  "PREVIEW_READY",
  "FEEDBACK_RECEIVED",
  "DEPLOYING",
  "DEPLOYED",
  "FAILED",
]);

const ProductSpecTextSchema = z.string().trim().min(1).max(2_000);

export const ProductSpecSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    project: z
      .object({
        name: z.string().trim().min(1).max(120),
        summary: ProductSpecTextSchema,
        primaryUser: z.string().trim().min(1).max(300),
        primaryGoal: z.string().trim().min(1).max(500),
      })
      .strict(),
    pages: z
      .array(
        z
          .object({
            route: z
              .string()
              .regex(/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/),
            name: z.string().trim().min(1).max(80),
            purpose: ProductSpecTextSchema,
            sections: z.array(ProductSpecTextSchema).min(1).max(10),
            interactions: z.array(ProductSpecTextSchema).max(12),
          })
          .strict(),
      )
      .min(1)
      .max(3),
    design: z
      .object({
        visualDirection: z.string().trim().min(1).max(500),
        primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        fontFamily: z.string().trim().min(1).max(120),
      })
      .strict(),
    mockData: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(80),
            description: ProductSpecTextSchema,
            sampleRecords: z.array(z.record(z.string(), z.unknown())).min(1).max(12),
          })
          .strict(),
      )
      .max(8),
    acceptanceCriteria: z
      .array(
        z
          .object({
            id: z.string().regex(/^AC-[1-9][0-9]*$/),
            requirement: ProductSpecTextSchema,
            evidence: ProductSpecTextSchema,
          })
          .strict(),
      )
      .min(1)
      .max(20),
    assumptions: z.array(ProductSpecTextSchema).max(12),
    conflicts: z.array(ProductSpecTextSchema).max(12),
    openQuestions: z.array(ProductSpecTextSchema).max(8),
  })
  .strict();

export type DemoRequest = z.infer<typeof DemoRequestSchema>;
export type ClarificationAnswer = z.infer<
  typeof ClarificationAnswerSchema
>;
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
export type ProductSpec = z.infer<typeof ProductSpecSchema>;

export interface JobProgress {
  stage: string;
  percent: number;
}

export interface JobResponse {
  jobId: string;
  requestId: string;
  status: JobStatus;
  progress: JobProgress;
  specVersion: number;
  previewUrl: string | null;
  previewExpiresAt: string | null;
  sandboxId: string | null;
  approvedAt: string | null;
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobArtifact<T = unknown> {
  jobId: string;
  type: string;
  version: number;
  payload: T;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface JobEvent {
  event: string;
  jobId: string;
  occurredAt: string;
  [key: string]: unknown;
}
