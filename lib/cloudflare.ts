import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database, DurableObjectNamespace } from "@cloudflare/workers-types";

export interface WakiEnv {
  DB: D1Database;
  ATTENDEE_VIDEO_STREAM: DurableObjectNamespace;
  ATTENDEE_VIDEO_STREAM_TOKEN: string;
  WAKI_PUBLIC_URL: string;
  WAKI_CODER_BASE_URL: string;
  WAKI_CODER_API_TOKEN: string;
  WAKI_CODER_WEBHOOK_SECRET: string;
}

export function getCloudflareEnv(): WakiEnv {
  return getCloudflareContext().env as unknown as WakiEnv;
}
