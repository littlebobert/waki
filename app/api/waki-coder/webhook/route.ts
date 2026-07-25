import { getCloudflareEnv } from "@/lib/cloudflare";
import { getBuildByCoderJobId, recordBuildDelivery, updateBuildJob } from "@/lib/build-store";
import { deliverPreviewToMeeting } from "@/lib/meet-delivery";
import { coderWebhookSchema, verifyCoderWebhook } from "@/lib/waki-coder-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-waki-timestamp") || "";
  const signature = request.headers.get("x-waki-signature") || "";
  const delivery = request.headers.get("x-waki-delivery") || "";
  const env = getCloudflareEnv();
  const { DB, WAKI_CODER_WEBHOOK_SECRET } = env;
  const secret = WAKI_CODER_WEBHOOK_SECRET || "";
  if (!delivery || !verifyCoderWebhook({ rawBody, timestamp, signature, secret })) {
    return new Response("Invalid callback", { status: 401 });
  }

  const payload = (() => {
    try { return JSON.parse(rawBody) as unknown; } catch { return null; }
  })();
  const parsed = coderWebhookSchema.safeParse(payload);
  if (!parsed.success) return new Response("Invalid payload", { status: 400 });
  const event = parsed.data;
  const isNew = await recordBuildDelivery(DB, delivery, event.jobId, event.event);
  if (!isNew) return Response.json({ received: true, duplicate: true });

  await updateBuildJob(DB, event.jobId, {
    status: event.status,
    progress: event.progress,
    previewUrl: event.previewUrl,
    previewExpiresAt: event.previewExpiresAt,
    error: event.error || null,
  });
  if (event.status === "PREVIEW_READY") {
    const build = await getBuildByCoderJobId(DB, event.jobId);
    if (build) await deliverPreviewToMeeting(DB, env, build);
  }
  return Response.json({ received: true });
}
