import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";

export interface WakiEnv {
  DB: D1Database;
}

export function getCloudflareEnv(): WakiEnv {
  return getCloudflareContext().env as unknown as WakiEnv;
}
