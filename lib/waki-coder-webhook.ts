import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { wakiCoderStatusSchema } from "@/lib/waki-coder";

export const coderWebhookSchema = z.object({
  event: z.enum(["demo.accepted", "demo.progress", "demo.preview_ready", "demo.failed"]),
  jobId: z.string().min(1),
  occurredAt: z.string(),
  status: wakiCoderStatusSchema,
  progress: z.object({ stage: z.string(), percent: z.number() }).optional(),
  previewUrl: z.string().url().optional(),
  previewExpiresAt: z.string().optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});

export function verifyCoderWebhook(input: { rawBody: string; timestamp: string; signature: string; secret: string; now?: number }) {
  const timestampSeconds = Number(input.timestamp);
  const now = input.now ?? Date.now();
  if (!Number.isFinite(timestampSeconds) || Math.abs(now - timestampSeconds * 1000) > 5 * 60 * 1000) return false;
  if (!input.secret || !input.signature.startsWith("v1=")) return false;
  const expected = createHmac("sha256", input.secret).update(`${input.timestamp}.${input.rawBody}`).digest("hex");
  const provided = input.signature.slice(3);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
