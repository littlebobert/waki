import type { D1Database } from "@cloudflare/workers-types";
import type { WakiEnv } from "@/lib/cloudflare";
import { claimBuildChatDelivery, completeBuildChatDelivery, failBuildChatDelivery, type BuildJob } from "@/lib/build-store";
import { getMeetingSession } from "@/lib/meeting-store";

export async function deliverPreviewToMeeting(db: D1Database, env: Pick<WakiEnv, "ATTENDEE_API_KEY">, build: BuildJob) {
  if (build.status !== "PREVIEW_READY" || !build.previewUrl) return false;
  const claimed = await claimBuildChatDelivery(db, build.id);
  if (!claimed) return false;

  try {
    const session = await getMeetingSession(db, build.sessionId);
    if (!session?.attendeeBotId) throw new Error("The meeting bot is no longer available.");
    if (!env.ATTENDEE_API_KEY) throw new Error("Attendee API key is not configured.");
    const expiry = build.previewExpiresAt ? `\nPreview expires ${new Date(build.previewExpiresAt).toISOString()}.` : "";
    const response = await fetch(`https://app.attendee.dev/api/v1/bots/${encodeURIComponent(session.attendeeBotId)}/chat_messages`, {
      method: "POST",
      headers: { Authorization: `Token ${env.ATTENDEE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        to: "everyone",
        message: `Waki finished your app:\n${build.previewUrl}${expiry}`,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(detail || `Attendee returned ${response.status}`);
    }
    await completeBuildChatDelivery(db, build.id);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not post the preview to meeting chat.";
    await failBuildChatDelivery(db, build.id, message);
    console.error("Could not deliver Waki preview to meeting chat", error);
    return false;
  }
}
