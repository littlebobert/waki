import { getCloudflareEnv } from "@/lib/cloudflare";
import { getBuildJob, toBrowserBuild, updateBuildJob } from "@/lib/build-store";
import { getCoderJob, WakiCoderError } from "@/lib/waki-coder";
import { deliverPreviewToMeeting } from "@/lib/meet-delivery";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const env = getCloudflareEnv();
  const { DB, WAKI_CODER_BASE_URL, WAKI_CODER_API_TOKEN } = env;
  let build = await getBuildJob(DB, id);
  if (!build) return Response.json({ error: "Build not found." }, { status: 404 });

  if (build.status !== "PREVIEW_READY" && build.status !== "FAILED") {
    try {
      const remote = await getCoderJob({ baseUrl: WAKI_CODER_BASE_URL, token: WAKI_CODER_API_TOKEN }, build.coderJobId);
      await updateBuildJob(DB, build.coderJobId, remote);
      build = await getBuildJob(DB, id) || build;
    } catch (error) {
      if (!(error instanceof WakiCoderError)) return Response.json({ error: "Could not read build status." }, { status: 502 });
    }
  }
  if (build.status === "PREVIEW_READY") await deliverPreviewToMeeting(DB, env, build);
  return Response.json({ build: toBrowserBuild(build) });
}
