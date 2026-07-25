import { describe, expect, it } from "vitest";
import {
  DemoRequestSchema,
  FeedbackRequestSchema,
  ProductSpecSchema,
} from "./index.js";

describe("DemoRequestSchema", () => {
  it("applies safe MVP defaults", () => {
    const request = DemoRequestSchema.parse({
      schemaVersion: "1.0",
      requestId: "req_1",
      conversationId: "conv_1",
      userId: "user_1",
      project: {
        name: "Demo",
        description: "Build a simple demo",
      },
      inputs: {
        text: [{ id: "text-1", content: "A small analytics dashboard" }],
      },
      callback: {
        type: "webhook",
        url: "https://bot.example.com/demo-events",
      },
    });

    expect(request.preferences).toEqual({
      targetDevice: "responsive",
      preferredFramework: "react",
      language: "English",
      allowMockData: true,
      allowBackend: false,
    });
    expect(request.inputs.audio).toEqual([]);
    expect(request.inputs.screenshots).toEqual([]);
  });

  it("requires at least one meeting input", () => {
    const result = DemoRequestSchema.safeParse({
      schemaVersion: "1.0",
      requestId: "req_1",
      conversationId: "conv_1",
      userId: "user_1",
      project: {
        name: "Demo",
        description: "Build a simple demo",
      },
      inputs: {},
      callback: {
        type: "webhook",
        url: "https://bot.example.com/demo-events",
      },
    });

    expect(result.success).toBe(false);
  });

  it("requires HTTPS for screenshots sent to the vision model", () => {
    const result = DemoRequestSchema.safeParse({
      schemaVersion: "1.0",
      requestId: "req_image",
      conversationId: "conv_image",
      userId: "user_image",
      project: {
        name: "Visual demo",
        description: "Use a spreadsheet screenshot as a reference",
      },
      inputs: {
        screenshots: [
          {
            id: "sheet-1",
            url: "http://localhost/private-sheet.png",
            mimeType: "image/png",
          },
        ],
      },
      callback: {
        type: "webhook",
        url: "https://bot.example.com/demo-events",
      },
    });

    expect(result.success).toBe(false);
  });
});

describe("FeedbackRequestSchema", () => {
  it("does not accept empty feedback", () => {
    expect(
      FeedbackRequestSchema.safeParse({
        feedbackId: "feedback_1",
      }).success,
    ).toBe(false);
  });
});

describe("ProductSpecSchema", () => {
  it("accepts a small, testable mini-app specification", () => {
    const result = ProductSpecSchema.parse({
      schemaVersion: "1.0",
      project: {
        name: "Campaign Pulse",
        summary: "A compact campaign performance dashboard.",
        primaryUser: "A growth marketing lead",
        primaryGoal: "Identify campaign performance changes quickly",
      },
      pages: [
        {
          route: "/",
          name: "Overview",
          purpose: "Summarize the active campaigns.",
          sections: ["Header", "Metric cards", "Campaign table"],
          interactions: ["Filter campaigns by status"],
        },
      ],
      design: {
        visualDirection: "Calm, data-forward, and presentation-ready.",
        primaryColor: "#2563EB",
        accentColor: "#14B8A6",
        backgroundColor: "#F8FAFC",
        fontFamily: "Inter, system-ui, sans-serif",
      },
      mockData: [
        {
          name: "campaigns",
          description: "Representative campaign performance records.",
          sampleRecords: [{ name: "Spring launch", conversions: 184 }],
        },
      ],
      acceptanceCriteria: [
        {
          id: "AC-1",
          requirement: "Show four campaign metrics.",
          evidence: "The overview renders four labelled metric cards.",
        },
      ],
      assumptions: ["The demo uses local mock data."],
      conflicts: [],
      openQuestions: [],
    });

    expect(result.pages[0]?.route).toBe("/");
  });

  it("rejects untestable acceptance criteria without evidence", () => {
    const result = ProductSpecSchema.safeParse({
      schemaVersion: "1.0",
      project: {
        name: "Demo",
        summary: "A demo",
        primaryUser: "A user",
        primaryGoal: "Complete a task",
      },
      pages: [],
      design: {
        visualDirection: "Clean",
        primaryColor: "#000000",
        accentColor: "#FFFFFF",
        backgroundColor: "#FFFFFF",
        fontFamily: "system-ui",
      },
      mockData: [],
      acceptanceCriteria: [{ id: "AC-1", requirement: "It works" }],
      assumptions: [],
      conflicts: [],
      openQuestions: [],
    });

    expect(result.success).toBe(false);
  });
});
