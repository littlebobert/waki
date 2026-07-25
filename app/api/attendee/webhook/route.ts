import {
  attendeeWebhookSchema,
  transcriptUpdateSchema,
  verifyWebhookSignature,
} from "@/lib/attendee";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { insertUtterance, recordWebhookDelivery, updateSessionState } from "@/lib/meeting-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const secret = process.env.ATTENDEE_WEBHOOK_SECRET || "";
  const signature = request.headers.get("x-webhook-signature") || "";

  if (!payload || !verifyWebhookSignature(payload, signature, secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const parsed = attendeeWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    return new Response("Invalid payload", { status: 400 });
  }

  const event = parsed.data;
  const { DB } = getCloudflareEnv();
  const isNew = await recordWebhookDelivery(DB, {
    idempotencyKey: event.idempotency_key,
    botId: event.bot_id,
    trigger: event.trigger,
  });

  if (!isNew) return Response.json({ received: true, duplicate: true });

  if (event.trigger === "transcript.update") {
    const utterance = transcriptUpdateSchema.safeParse(event.data);
    if (utterance.success) {
      await insertUtterance(DB, event.bot_id, event.idempotency_key, {
        speakerName: utterance.data.speaker_name,
        speakerUuid: utterance.data.speaker_uuid || null,
        timestampMs: utterance.data.timestamp_ms,
        durationMs: utterance.data.duration_ms,
        transcript: utterance.data.transcription.transcript,
      });
    }
  }

  if (event.trigger === "bot.state_change") {
    const newState = typeof event.data.new_state === "string" ? event.data.new_state : null;
    if (newState) {
      const errorMessage = newState === "fatal_error"
        ? String(event.data.event_sub_type || event.data.event_type || "Attendee bot failed")
        : null;
      await updateSessionState(DB, event.bot_id, newState, errorMessage);
    }
  }

  return Response.json({ received: true });
}
