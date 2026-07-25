import {
  attendeeWebhookSchema,
  chatMessageUpdateSchema,
  parseWakiCommand,
  transcriptUpdateSchema,
  verifyWebhookSignature,
} from "@/lib/attendee";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getMeetingSessionByBotId, insertUtterance, insertWakiChatCommand, recordWebhookDelivery, updateSessionState } from "@/lib/meeting-store";
import { startBuildForSession } from "@/lib/start-build";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const { DB, ATTENDEE_WEBHOOK_SECRET } = getCloudflareEnv();
  const signature = request.headers.get("x-webhook-signature") || "";

  if (!payload || !verifyWebhookSignature(payload, signature, ATTENDEE_WEBHOOK_SECRET || "")) {
    return new Response("Invalid signature", { status: 401 });
  }

  const parsed = attendeeWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    return new Response("Invalid payload", { status: 400 });
  }

  const event = parsed.data;
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

  if (event.trigger === "chat_messages.update") {
    const message = chatMessageUpdateSchema.safeParse(event.data);
    const command = message.success ? parseWakiCommand(message.data.text) : null;
    if (message.success && command) {
      await insertWakiChatCommand(DB, event.bot_id, {
        id: message.data.id,
        idempotencyKey: event.idempotency_key,
        senderName: message.data.sender_name,
        command,
        timestampMs: message.data.timestamp_ms,
      });
      const session = await getMeetingSessionByBotId(DB, event.bot_id);
      if (session) {
        try {
          await startBuildForSession(DB, getCloudflareEnv(), session.id);
        } catch (error) {
          console.error("Could not start /waki chat build", error);
        }
      }
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
