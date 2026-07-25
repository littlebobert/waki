import { getCloudflareEnv } from "@/lib/cloudflare";
import { recordBuildDelivery, updateBuildJob } from "@/lib/build-store";
import { coderWebhookSchema, verifyCoderWebhook } from "@/lib/waki-coder-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-waki-timestamp") || "";
  const signature = request.headers.get("x-waki-signature") || "";
  const delivery = request.headers.get("x-waki-delivery") || "";
  const secret = process.env.WAKI_CODER_WEBHOOK_SECRET || "";
  if (!delivery || !verifyCoderWebhook({ rawBody, timestamp, signature, secret })) {
    return new Response("Invalid callback", { status: 401 });
  }

  const payload = (() => {
    try { return JSON.parse(rawBody) as unknown; } catch { return null; }
  })();
  const parsed = coderWebhookSchema.safeParse(payload);
  if (!parsed.success) return new Response("Invalid payload", { status: 400 });
  const { DB } = getCloudflareEnv();
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
  return Response.json({ received: true });
}
