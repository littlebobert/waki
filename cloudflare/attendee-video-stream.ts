import type {
  DurableObjectState,
  ResponseInit as CloudflareResponseInit,
  WebSocket as CloudflareWebSocket,
} from "@cloudflare/workers-types";
import {
  attendeeVideoMessageSchema,
  frameSampleKey,
  shouldSampleFrame,
} from "../lib/attendee-video";

export class AttendeeVideoStream {
  private readonly lastSampledAt = new Map<string, number>();

  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade.", { status: 426 });
    }

    const Pair = (globalThis as typeof globalThis & {
      WebSocketPair: new () => { 0: CloudflareWebSocket; 1: CloudflareWebSocket };
    }).WebSocketPair;
    const pair = new Pair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client } as unknown as ResponseInit & CloudflareResponseInit);
  }

  async webSocketMessage(_socket: CloudflareWebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;

    const json = (() => {
      try {
        return JSON.parse(message);
      } catch {
        return null;
      }
    })();
    const parsed = attendeeVideoMessageSchema.safeParse(json);
    if (!parsed.success) return;

    const now = Date.now();
    const key = frameSampleKey(parsed.data);
    const lastSampledAt = this.lastSampledAt.get(key);
    if (!shouldSampleFrame(lastSampledAt, now)) return;

    this.lastSampledAt.set(key, now);
    console.log("Sampled Attendee JPEG frame", {
      botId: parsed.data.bot_id,
      participantUuid: parsed.data.data.participant_uuid,
      source: parsed.data.data.source,
      receivedAt: new Date(now).toISOString(),
    });
  }
}
