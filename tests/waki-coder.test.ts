import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDemoRequest, createCoderJob } from "@/lib/waki-coder";
import { verifyCoderWebhook } from "@/lib/waki-coder-webhook";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.WAKI_CODER_BASE_URL;
  delete process.env.WAKI_CODER_API_TOKEN;
});

describe("Waki Coder integration", () => {
  it("maps a transcript to a stable, screenshot-ready request", () => {
    const request = buildDemoRequest({
      sessionId: "session-123",
      transcript: "Maya: Build a launch dashboard",
      utterances: [],
      callbackUrl: "https://waki.example.com/api/waki-coder/webhook",
    });
    expect(request.requestId).toBe("waki-build-session-123");
    expect(request.conversationId).toBe("session-123");
    expect(request.inputs.text[0].content).toContain("launch dashboard");
    expect(request.inputs.screenshots).toEqual([]);
    expect(request.preferences).toMatchObject({ preferredFramework: "react", targetDevice: "responsive", allowMockData: true });
  });

  it("uses bearer authentication for job creation", async () => {
    process.env.WAKI_CODER_BASE_URL = "https://coder.example.com";
    process.env.WAKI_CODER_API_TOKEN = "secret-token";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ jobId: "job_1", status: "ACCEPTED", idempotentReplay: false }), { status: 202, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const request = buildDemoRequest({ sessionId: "s1", transcript: "A: Build a tracker", utterances: [], callbackUrl: "https://waki.example.com/api/waki-coder/webhook" });
    await createCoderJob({ baseUrl: "https://coder.example.com", token: "secret-token" }, request);
    expect(fetchMock).toHaveBeenCalledWith("https://coder.example.com/v1/demo-jobs", expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer secret-token" }) }));
  });

  it("verifies signatures and rejects stale callbacks", () => {
    const rawBody = JSON.stringify({ event: "demo.accepted" });
    const timestamp = "1000";
    const secret = "callback-secret";
    const signature = `v1=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
    expect(verifyCoderWebhook({ rawBody, timestamp, signature, secret, now: 1000_000 })).toBe(true);
    expect(verifyCoderWebhook({ rawBody, timestamp, signature, secret, now: 1400_001 })).toBe(false);
  });
});
