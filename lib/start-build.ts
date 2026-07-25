import { randomUUID } from "node:crypto";
import type { D1Database } from "@cloudflare/workers-types";
import type { WakiEnv } from "@/lib/cloudflare";
import { createBuildJob, getBuildForSession } from "@/lib/build-store";
import { getLatestWakiChatCommand, getMeetingSession, getSessionUtterances, normalizeTranscript } from "@/lib/meeting-store";
import { buildDemoRequest, createCoderJob, WakiCoderError } from "@/lib/waki-coder";

export async function startBuildForSession(db: D1Database, env: Pick<WakiEnv, "WAKI_PUBLIC_URL" | "WAKI_CODER_BASE_URL" | "WAKI_CODER_API_TOKEN">, sessionId: string) {
  const existing = await getBuildForSession(db, sessionId);
  if (existing) return existing;

  const session = await getMeetingSession(db, sessionId);
  if (!session) throw new WakiCoderError("Meeting session not found.", 404, "SESSION_NOT_FOUND");
  const utterances = await getSessionUtterances(db, session.id);
  const transcript = normalizeTranscript(utterances);
  const chatCommand = await getLatestWakiChatCommand(db, session.id);
  if (!transcript.trim() && !chatCommand) {
    throw new WakiCoderError("Wait for a transcript or send a /waki command in meeting chat.", 409, "NO_INPUT");
  }

  const publicUrl = env.WAKI_PUBLIC_URL?.replace(/\/$/, "");
  if (!publicUrl) throw new WakiCoderError("Waki's public URL is not configured.", 503, "NOT_CONFIGURED");
  const demoRequest = buildDemoRequest({
    sessionId: session.id,
    transcript,
    utterances,
    callbackUrl: `${publicUrl}/api/waki-coder/webhook`,
    command: chatCommand?.command,
    commandId: chatCommand?.id,
  });
  const job = await createCoderJob({ baseUrl: env.WAKI_CODER_BASE_URL, token: env.WAKI_CODER_API_TOKEN }, demoRequest);
  await createBuildJob(db, { id: randomUUID(), sessionId: session.id, requestId: demoRequest.requestId, job });
  const build = await getBuildForSession(db, session.id);
  if (!build) throw new WakiCoderError("Could not persist the app build.", 502, "PERSISTENCE_FAILED");
  return build;
}
