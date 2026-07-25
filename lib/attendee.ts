import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const attendeeWebhookSchema = z.object({
  idempotency_key: z.string().min(1),
  bot_id: z.string().min(1),
  trigger: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});

export const transcriptUpdateSchema = z.object({
  speaker_name: z.string().default("Unknown speaker"),
  speaker_uuid: z.string().nullable().optional(),
  timestamp_ms: z.number().int().nonnegative(),
  duration_ms: z.number().int().nonnegative().default(0),
  transcription: z.object({
    transcript: z.string().min(1),
  }),
});

const supportedMeetingHosts = [
  "meet.google.com",
  "zoom.us",
  "teams.microsoft.com",
  "teams.live.com",
];

export const terminalBotStates = new Set(["ended", "fatal_error", "data_deleted"]);

export function isSupportedMeetingUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return supportedMeetingHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortKeys((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }
  return value;
}

export function canonicalizeWebhookPayload(payload: unknown) {
  return JSON.stringify(sortKeys(payload));
}

export function signWebhookPayload(payload: unknown, secretBase64: string) {
  return createHmac("sha256", Buffer.from(secretBase64, "base64"))
    .update(canonicalizeWebhookPayload(payload), "utf8")
    .digest("base64");
}

export function verifyWebhookSignature(payload: unknown, signature: string, secretBase64: string) {
  if (!signature || !secretBase64) return false;
  const calculated = signWebhookPayload(payload, secretBase64);
  const expected = Buffer.from(calculated);
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function publicWebhookUrl(requestUrl: string) {
  const configured = process.env.WAKI_PUBLIC_URL?.replace(/\/$/, "");
  return `${configured || new URL(requestUrl).origin}/api/attendee/webhook`;
}
