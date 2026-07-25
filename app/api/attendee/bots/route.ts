import { randomUUID } from "node:crypto";
import { isSupportedMeetingUrl, publicWebhookUrl } from "@/lib/attendee";
import { publicVideoWebSocketUrl } from "@/lib/attendee-video";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { attachAttendeeBot, createMeetingSession, markSessionError } from "@/lib/meeting-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const meetingUrl = typeof body?.meetingUrl === "string" ? body.meetingUrl.trim() : "";

  if (!isSupportedMeetingUrl(meetingUrl)) {
    return Response.json({ error: "Enter a valid Google Meet HTTPS URL." }, { status: 400 });
  }

  const apiKey = process.env.ATTENDEE_API_KEY;
  const { DB, ATTENDEE_VIDEO_STREAM_TOKEN } = getCloudflareEnv();
  if (!apiKey || !ATTENDEE_VIDEO_STREAM_TOKEN) {
    return Response.json({ error: "Attendee is not configured yet." }, { status: 503 });
  }

  const videoWebSocketUrl = publicVideoWebSocketUrl(request.url, ATTENDEE_VIDEO_STREAM_TOKEN);
  const sessionId = randomUUID();
  await createMeetingSession(DB, { id: sessionId, meetingUrl });

  try {
    const response = await fetch("https://app.attendee.dev/api/v1/bots", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        meeting_url: meetingUrl,
        bot_name: "Waki",
        deduplication_key: sessionId,
        transcription_settings: {
          openai: {
            model: "gpt-4o-transcribe",
          },
        },
        websocket_settings: {
          per_participant_video: {
            url: videoWebSocketUrl,
            webcam_resolution: "360p",
            screenshare_resolution: "360p",
          },
        },
        webhooks: [
          {
            url: publicWebhookUrl(request.url),
            triggers: ["bot.state_change", "transcript.update"],
          },
        ],
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || typeof data?.id !== "string") {
      const providerMessage = data?.detail || data?.error || data;
      const message = typeof providerMessage === "string"
        ? providerMessage
        : providerMessage
          ? JSON.stringify(providerMessage)
          : `Attendee returned ${response.status}`;
      throw new Error(message);
    }

    await attachAttendeeBot(DB, sessionId, {
      id: data.id,
      state: typeof data.state === "string" ? data.state : "joining",
      transcriptionState: typeof data.transcription_state === "string" ? data.transcription_state : undefined,
    });

    return Response.json({ sessionId, botId: data.id, state: data.state || "joining" }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Attendee could not create the bot.";
    await markSessionError(DB, sessionId, message);
    return Response.json({ error: message, sessionId }, { status: 502 });
  }
}
