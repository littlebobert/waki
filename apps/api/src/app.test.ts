import { afterEach, describe, expect, it } from "vitest";
import type { DemoRequest } from "@waki/contracts";
import {
  JobRepository,
  StageOneWorkflow,
  WebhookDispatcher,
  signWebhook,
} from "@waki/core";
import { buildApp } from "./app.js";

const BOT_TOKEN = "test-bot-token";
const SIGNING_SECRET = "test-webhook-secret";
const repositories: JobRepository[] = [];

function createRepository(): JobRepository {
  const repository = new JobRepository(":memory:");
  repositories.push(repository);
  return repository;
}

function createRequest(
  overrides: Partial<DemoRequest> = {},
): DemoRequest {
  return {
    schemaVersion: "1.0",
    requestId: "req_dashboard_001",
    conversationId: "conv_001",
    userId: "user_001",
    project: {
      name: "Campaign Analytics Demo",
      description: "Create the dashboard discussed in the meeting",
    },
    inputs: {
      text: [
        {
          id: "text-1",
          content:
            "Build a responsive marketing dashboard with four metric cards.",
        },
      ],
      audio: [],
      screenshots: [],
    },
    preferences: {
      targetDevice: "responsive",
      preferredFramework: "react",
      language: "English",
      allowMockData: true,
      allowBackend: false,
    },
    callback: {
      type: "webhook",
      url: "http://127.0.0.1:4100/demo-events",
    },
    ...overrides,
  };
}

afterEach(() => {
  for (const repository of repositories.splice(0)) {
    repository.close();
  }
});

describe("Demo Builder API", () => {
  it("allows hackathon requests when bot auth is disabled", async () => {
    const repository = createRepository();
    const app = buildApp({
      repository,
      botApiToken: null,
      callbackAllowedOrigins: ["http://127.0.0.1:4100"],
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/demo-jobs",
      payload: createRequest(),
    });

    expect(response.statusCode).toBe(202);
    await app.close();
  });

  it("requires bot service authentication", async () => {
    const repository = createRepository();
    const app = buildApp({
      repository,
      botApiToken: BOT_TOKEN,
      callbackAllowedOrigins: ["http://127.0.0.1:4100"],
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/demo-jobs",
      payload: createRequest(),
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
    await app.close();
  });

  it("creates an idempotent job and exposes status", async () => {
    const repository = createRepository();
    const app = buildApp({
      repository,
      botApiToken: BOT_TOKEN,
      callbackAllowedOrigins: ["http://127.0.0.1:4100"],
    });
    const headers = { authorization: `Bearer ${BOT_TOKEN}` };
    const request = createRequest();

    const first = await app.inject({
      method: "POST",
      url: "/v1/demo-jobs",
      headers,
      payload: request,
    });
    const replay = await app.inject({
      method: "POST",
      url: "/v1/demo-jobs",
      headers,
      payload: request,
    });

    expect(first.statusCode).toBe(202);
    expect(replay.statusCode).toBe(202);
    expect(replay.json()).toMatchObject({
      jobId: first.json().jobId,
      idempotentReplay: true,
    });

    const workflow = new StageOneWorkflow(repository);
    expect(workflow.runUntilIdle()).toBe(2);

    const status = await app.inject({
      method: "GET",
      url: `/v1/demo-jobs/${first.json().jobId}`,
      headers,
    });
    expect(status.json()).toMatchObject({
      status: "SPEC_READY",
      specVersion: 1,
      progress: {
        stage: "Product specification ready",
        percent: 30,
      },
    });
    await app.close();
  });

  it("rejects reuse of a requestId with different content", async () => {
    const repository = createRepository();
    const app = buildApp({
      repository,
      botApiToken: BOT_TOKEN,
      callbackAllowedOrigins: ["http://127.0.0.1:4100"],
    });
    const headers = { authorization: `Bearer ${BOT_TOKEN}` };

    await app.inject({
      method: "POST",
      url: "/v1/demo-jobs",
      headers,
      payload: createRequest(),
    });
    const conflict = await app.inject({
      method: "POST",
      url: "/v1/demo-jobs",
      headers,
      payload: createRequest({
        project: {
          name: "Different project",
          description: "This payload must not replace the original request",
        },
      }),
    });

    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
    await app.close();
  });

  it("rejects callback origins outside the allowlist", async () => {
    const repository = createRepository();
    const app = buildApp({
      repository,
      botApiToken: BOT_TOKEN,
      callbackAllowedOrigins: ["https://bot.example.com"],
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/demo-jobs",
      headers: { authorization: `Bearer ${BOT_TOKEN}` },
      payload: createRequest(),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: "CALLBACK_URL_NOT_ALLOWED" },
    });
    await app.close();
  });
});

describe("webhook delivery", () => {
  it("signs callback bodies and preserves event order", async () => {
    const repository = createRepository();
    const request = createRequest();
    repository.createJob(request);
    new StageOneWorkflow(repository).runUntilIdle();

    const deliveries: Array<{
      body: string;
      headers: Headers;
    }> = [];
    const fetchImplementation = (async (
      _input: URL | RequestInfo,
      init?: RequestInit,
    ) => {
      deliveries.push({
        body: String(init?.body),
        headers: new Headers(init?.headers),
      });
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    const dispatcher = new WebhookDispatcher(repository, {
      signingSecret: SIGNING_SECRET,
      allowedOrigins: ["http://127.0.0.1:4100"],
      fetchImplementation,
    });

    expect(await dispatcher.deliverPending()).toBe(1);
    expect(await dispatcher.deliverPending()).toBe(1);
    expect(await dispatcher.deliverPending()).toBe(1);
    expect(deliveries.map((delivery) => delivery.headers.get("x-waki-event"))).toEqual([
      "demo.accepted",
      "demo.progress",
      "demo.progress",
    ]);

    for (const delivery of deliveries) {
      const timestamp = delivery.headers.get("x-waki-timestamp");
      expect(timestamp).not.toBeNull();
      expect(delivery.headers.get("x-waki-signature")).toBe(
        signWebhook(SIGNING_SECRET, timestamp!, delivery.body),
      );
    }
  });
});
