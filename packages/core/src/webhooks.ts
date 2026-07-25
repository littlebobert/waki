import { createHmac } from "node:crypto";
import { assertAllowedCallbackUrl } from "./callback-policy.js";
import type { JobRepository, OutboxDelivery } from "./repository.js";

export function signWebhook(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
): string {
  const digest = createHmac("sha256", signingSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return `v1=${digest}`;
}

export interface WebhookDispatcherOptions {
  signingSecret?: string | null;
  allowedOrigins: readonly string[];
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}

export class WebhookDispatcher {
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;

  constructor(
    private readonly repository: JobRepository,
    private readonly options: WebhookDispatcherOptions,
  ) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async deliverPending(limit = 20): Promise<number> {
    const deliveries = this.repository.getPendingDeliveries(limit);
    let delivered = 0;

    for (const delivery of deliveries) {
      try {
        await this.deliver(delivery);
        this.repository.markDeliverySucceeded(delivery.id);
        delivered += 1;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown callback error";
        this.repository.markDeliveryFailed(
          delivery.id,
          delivery.attempts + 1,
          message,
        );
      }
    }

    return delivered;
  }

  private async deliver(delivery: OutboxDelivery): Promise<void> {
    const url = assertAllowedCallbackUrl(
      delivery.callbackUrl,
      this.options.allowedOrigins,
    );
    const body = JSON.stringify(delivery.payload);
    const timestamp = Math.floor(Date.now() / 1_000).toString();
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-waki-delivery": `delivery_${delivery.id}`,
      "x-waki-event": delivery.eventType,
      "x-waki-timestamp": timestamp,
    };

    if (this.options.signingSecret) {
      headers["x-waki-signature"] = signWebhook(
        this.options.signingSecret,
        timestamp,
        body,
      );
    }

    const response = await this.fetchImplementation(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Callback returned HTTP ${response.status}`);
    }
  }
}
