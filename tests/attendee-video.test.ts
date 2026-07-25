import { describe, expect, it } from "vitest";
import {
  attendeeVideoMessageSchema,
  FRAME_SAMPLE_INTERVAL_MS,
  frameSampleKey,
  publicVideoWebSocketUrl,
  shouldSampleFrame,
} from "@/lib/attendee-video";

const message = attendeeVideoMessageSchema.parse({
  bot_id: "bot_123",
  trigger: "realtime_video.per_participant",
  data: {
    participant_uuid: "participant_123",
    frame: "/9j/example",
    format: "jpeg",
    source: "screenshare",
  },
});

describe("Attendee video frame sampling", () => {
  it("samples the first frame and then at five-second intervals", () => {
    expect(shouldSampleFrame(undefined, 1_000)).toBe(true);
    expect(shouldSampleFrame(1_000, 1_000 + FRAME_SAMPLE_INTERVAL_MS - 1)).toBe(false);
    expect(shouldSampleFrame(1_000, 1_000 + FRAME_SAMPLE_INTERVAL_MS)).toBe(true);
  });

  it("tracks participant and source independently", () => {
    expect(frameSampleKey(message)).toBe("participant_123:screenshare");
  });

  it("builds an authenticated secure WebSocket URL", () => {
    expect(publicVideoWebSocketUrl("https://waki.example.com/api/attendee/bots", "secret token"))
      .toBe("wss://waki.example.com/api/attendee/video?token=secret+token");
  });
});
