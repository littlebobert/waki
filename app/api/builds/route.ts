import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { createBuildJob, getBuildForSession, toBrowserBuild } from "@/lib/build-store";
import { getMeetingSession, getSessionUtterances, normalizeTranscript } from "@/lib/meeting-store";
import { buildDemoRequest, createCoderJob, WakiCoderError } from "@/lib/waki-coder";

export const runtime = "nodejs";
const requestSchema = z.object({ sessionId: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "A valid meeting session is required." }, { status: 400 });

  const { DB, WAKI_PUBLIC_URL, WAKI_CODER_BASE_URL, WAKI_CODER_API_TOKEN } = getCloudflareEnv();
  const session = await getMeetingSession(DB, parsed.data.sessionId);
  if (!session) return Response.json({ error: "Meeting session not found." }, { status: 404 });
  const utterances = await getSessionUtterances(DB, session.id);
  const transcript = normalizeTranscript(utterances);
  if (!transcript.trim()) return Response.json({ error: "Wait for a usable transcript before building." }, { status: 409 });

  const existing = await getBuildForSession(DB, session.id);
  if (existing) return Response.json({ build: toBrowserBuild(existing) }, { status: 200 });

  try {
    const publicUrl = WAKI_PUBLIC_URL?.replace(/\/$/, "");
    if (!publicUrl) throw new WakiCoderError("Waki's public URL is not configured.", 503, "NOT_CONFIGURED");
    const demoRequest = buildDemoRequest({
      sessionId: session.id,
      transcript,
      utterances,
      callbackUrl: `${publicUrl}/api/waki-coder/webhook`,
    });
    const job = await createCoderJob({ baseUrl: WAKI_CODER_BASE_URL, token: WAKI_CODER_API_TOKEN }, demoRequest);
    const id = randomUUID();
    await createBuildJob(DB, { id, sessionId: session.id, requestId: demoRequest.requestId, job });
    const build = await getBuildForSession(DB, session.id);
    if (!build) return Response.json({ error: "Could not persist the app build." }, { status: 502 });
    return Response.json({ build: toBrowserBuild(build) }, { status: 201 });
  } catch (error) {
    if (error instanceof WakiCoderError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "Could not start the app build." }, { status: 502 });
  }
}
