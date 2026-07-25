import { z } from "zod";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { toBrowserBuild } from "@/lib/build-store";
import { startBuildForSession } from "@/lib/start-build";
import { WakiCoderError } from "@/lib/waki-coder";

export const runtime = "nodejs";
const requestSchema = z.object({ sessionId: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "A valid meeting session is required." }, { status: 400 });

  const env = getCloudflareEnv();
  try {
    const build = await startBuildForSession(env.DB, env, parsed.data.sessionId);
    return Response.json({ build: toBrowserBuild(build) }, { status: 201 });
  } catch (error) {
    if (error instanceof WakiCoderError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "Could not start the app build." }, { status: 502 });
  }
}
