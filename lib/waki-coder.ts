import { z } from "zod";
import type { TranscriptUtterance } from "@/lib/meeting-store";

export const wakiCoderStatusSchema = z.enum([
  "ACCEPTED", "INPUTS_DOWNLOADING", "AUDIO_TRANSCRIBING", "SCREENSHOTS_ANALYZING",
  "SPEC_GENERATING", "CLARIFICATION_REQUIRED", "SPEC_READY", "SANDBOX_CREATING",
  "BUILDING", "FUNCTIONAL_TESTING", "VISUAL_TESTING", "REPAIRING", "PREVIEW_READY",
  "FEEDBACK_RECEIVED", "DEPLOYING", "DEPLOYED", "FAILED",
]);

export const wakiCoderJobSchema = z.object({
  jobId: z.string().min(1),
  requestId: z.string().min(1).optional(),
  status: wakiCoderStatusSchema,
  progress: z.object({ stage: z.string(), percent: z.number().min(0).max(100) }).optional(),
  previewUrl: z.string().url().nullable().optional(),
  previewExpiresAt: z.string().nullable().optional(),
  error: z.object({ code: z.string(), message: z.string() }).nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  idempotentReplay: z.boolean().optional(),
});

export const screenshotInputSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  description: z.string().optional(),
});

export const demoRequestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  requestId: z.string(),
  conversationId: z.string(),
  userId: z.string(),
  project: z.object({ name: z.string(), description: z.string() }),
  inputs: z.object({
    text: z.array(z.object({ id: z.string(), content: z.string() })),
    audio: z.array(z.never()),
    screenshots: z.array(screenshotInputSchema).max(3),
  }),
  preferences: z.object({
    targetDevice: z.literal("responsive"),
    preferredFramework: z.literal("react"),
    language: z.string(),
    allowMockData: z.literal(true),
    allowBackend: z.boolean(),
  }),
  callback: z.object({ type: z.literal("webhook"), url: z.string().url() }),
});

export type WakiCoderStatus = z.infer<typeof wakiCoderStatusSchema>;
export type WakiCoderJob = z.infer<typeof wakiCoderJobSchema>;
export type DemoRequest = z.infer<typeof demoRequestSchema>;
export type ScreenshotInput = z.infer<typeof screenshotInputSchema>;

export class WakiCoderError extends Error {
  constructor(message: string, readonly status: number, readonly code = "WAKI_CODER_ERROR") {
    super(message);
  }
}

export type WakiCoderConfig = { baseUrl: string; token: string };

function config(input: WakiCoderConfig) {
  const baseUrl = input.baseUrl?.replace(/\/$/, "");
  const token = input.token;
  if (!baseUrl) throw new WakiCoderError("Waki Coder service URL is not configured.", 503, "BASE_URL_NOT_CONFIGURED");
  if (!token) throw new WakiCoderError("Waki Coder API token is not configured.", 503, "API_TOKEN_NOT_CONFIGURED");
  return { baseUrl, token };
}

async function coderFetch(configuration: WakiCoderConfig, path: string, init?: RequestInit) {
  const { baseUrl, token } = config(configuration);
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
  if (!response.ok) {
    throw new WakiCoderError(body?.error?.message || "The app builder request failed.", response.status, body?.error?.code);
  }
  return body;
}

export async function createCoderJob(configuration: WakiCoderConfig, request: DemoRequest) {
  const body = await coderFetch(configuration, "/v1/demo-jobs", { method: "POST", body: JSON.stringify(demoRequestSchema.parse(request)) });
  return wakiCoderJobSchema.parse(body);
}

export async function getCoderJob(configuration: WakiCoderConfig, jobId: string) {
  const body = await coderFetch(configuration, `/v1/demo-jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
  return wakiCoderJobSchema.parse(body);
}

export function buildDemoRequest(input: {
  sessionId: string;
  transcript: string;
  utterances: TranscriptUtterance[];
  callbackUrl: string;
  command?: string;
  commandId?: string;
  screenshots?: ScreenshotInput[];
}): DemoRequest {
  const instruction = input.command?.trim() || input.transcript;
  const firstWords = instruction.replace(/^[^:]+:\s*/, "").trim().split(/\s+/).slice(0, 6).join(" ");
  return demoRequestSchema.parse({
    schemaVersion: "1.0",
    requestId: `waki-build-${input.commandId || input.sessionId}`,
    conversationId: input.sessionId,
    userId: "waki-anonymous-demo",
    project: {
      name: firstWords ? `Meeting app: ${firstWords}`.slice(0, 120) : "Meeting app",
      description: input.command || "Build a polished, focused mini-app directly from this meeting transcript.",
    },
    inputs: {
      text: [
        ...(input.command ? [{ id: `command-${input.commandId || input.sessionId}`, content: `Primary build instruction: ${input.command}` }] : []),
        ...(input.transcript ? [{ id: `transcript-${input.sessionId}`, content: `Meeting transcript context:\n${input.transcript}` }] : []),
      ],
      audio: [],
      screenshots: input.screenshots || [],
    },
    preferences: {
      targetDevice: "responsive",
      preferredFramework: "react",
      language: "English",
      allowMockData: true,
      allowBackend: false,
    },
    callback: { type: "webhook", url: input.callbackUrl },
  });
}
