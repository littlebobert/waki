import { describe, expect, it } from "vitest";
import {
  canonicalizeWebhookPayload,
  isSupportedMeetingUrl,
  signWebhookPayload,
  terminalBotStates,
  verifyWebhookSignature,
} from "@/lib/attendee";
import { normalizeTranscript } from "@/lib/meeting-store";

describe("Attendee integration helpers", () => {
  it("canonicalizes nested webhook objects with stable key order", () => {
    expect(canonicalizeWebhookPayload({ z: 1, data: { b: 2, a: 1 }, a: [2, { y: 1, x: 0 }] }))
      .toBe('{"a":[2,{"x":0,"y":1}],"data":{"a":1,"b":2},"z":1}');
  });

  it("verifies valid signatures and rejects altered payloads", () => {
    const secret = Buffer.from("attendee-test-secret").toString("base64");
    const payload = { bot_id: "bot_1", trigger: "transcript.update", data: { text: "hello" } };
    const signature = signWebhookPayload(payload, secret);

    expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
    expect(verifyWebhookSignature({ ...payload, bot_id: "bot_2" }, signature, secret)).toBe(false);
  });

  it.each([
    "https://meet.google.com/abc-defg-hij",
    "https://us02web.zoom.us/j/123456",
    "https://teams.microsoft.com/l/meetup-join/abc",
  ])("accepts supported meeting URL %s", (url) => {
    expect(isSupportedMeetingUrl(url)).toBe(true);
  });

  it.each([
    "http://meet.google.com/abc-defg-hij",
    "https://example.com/meeting",
    "not-a-url",
  ])("rejects unsupported meeting URL %s", (url) => {
    expect(isSupportedMeetingUrl(url)).toBe(false);
  });

  it("normalizes ordered utterances for generation", () => {
    expect(normalizeTranscript([
      { speakerName: "Maya", speakerUuid: "1", timestampMs: 1, durationMs: 20, transcript: " Hello team. " },
      { speakerName: "Kenji", speakerUuid: "2", timestampMs: 2, durationMs: 30, transcript: "こんにちは。" },
    ])).toBe("Maya: Hello team.\n\nKenji: こんにちは。");
  });

  it("identifies terminal bot states", () => {
    expect(terminalBotStates.has("ended")).toBe(true);
    expect(terminalBotStates.has("fatal_error")).toBe(true);
    expect(terminalBotStates.has("joined_recording")).toBe(false);
  });
});
