import { terminalBotStates } from "@/lib/attendee";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getMeetingSession, getSessionUtterances, normalizeTranscript } from "@/lib/meeting-store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { DB } = getCloudflareEnv();
  const session = await getMeetingSession(DB, id);

  if (!session) {
    return Response.json({ error: "Meeting session not found." }, { status: 404 });
  }

  const utterances = await getSessionUtterances(DB, id);
  return Response.json({
    session,
    utterances,
    transcript: normalizeTranscript(utterances),
    terminal: terminalBotStates.has(session.botState),
  });
}
