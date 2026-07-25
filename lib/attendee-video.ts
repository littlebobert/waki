import { z } from "zod";

export const FRAME_SAMPLE_INTERVAL_MS = 5_000;

export const attendeeVideoMessageSchema = z.object({
  bot_id: z.string().min(1),
  trigger: z.literal("realtime_video.per_participant"),
  data: z.object({
    participant_uuid: z.string().min(1),
    frame: z.string().min(1),
    format: z.literal("jpeg").optional(),
    source: z.enum(["webcam", "screenshare"]),
  }),
});

export type AttendeeVideoMessage = z.infer<typeof attendeeVideoMessageSchema>;

export function frameSampleKey(message: AttendeeVideoMessage) {
  return `${message.data.participant_uuid}:${message.data.source}`;
}

export function shouldSampleFrame(lastSampledAt: number | undefined, now: number) {
  return lastSampledAt === undefined || now - lastSampledAt >= FRAME_SAMPLE_INTERVAL_MS;
}

export function publicVideoWebSocketUrl(requestUrl: string, token: string) {
  const configured = process.env.WAKI_PUBLIC_URL?.replace(/\/$/, "");
  const url = new URL(configured || new URL(requestUrl).origin);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
  url.pathname = "/api/attendee/video";
  url.search = new URLSearchParams({ token }).toString();
  return url.toString();
}
