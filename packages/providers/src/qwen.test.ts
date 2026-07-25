import { describe, expect, it, vi } from "vitest";
import type { DemoRequest, ProductSpec } from "@waki/contracts";
import { QwenRequirementProcessor } from "./qwen.js";

const request: DemoRequest = {
  schemaVersion: "1.0",
  requestId: "req_1",
  conversationId: "conv_1",
  userId: "user_1",
  project: {
    name: "Campaign Pulse",
    description: "A campaign overview discussed in our meeting.",
  },
  inputs: {
    text: [{ id: "text-1", content: "Show four metrics and a table." }],
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
  callback: { type: "webhook", url: "http://localhost:4100/events" },
};

const specification: ProductSpec = {
  schemaVersion: "1.0",
  project: {
    name: "Campaign Pulse",
    summary: "A campaign overview.",
    primaryUser: "Marketing lead",
    primaryGoal: "Review performance",
  },
  pages: [
    {
      route: "/",
      name: "Overview",
      purpose: "Review campaign performance.",
      sections: ["Metrics", "Campaign table"],
      interactions: ["Filter by status"],
    },
  ],
  design: {
    visualDirection: "Clean and data-forward.",
    primaryColor: "#2563EB",
    accentColor: "#14B8A6",
    backgroundColor: "#F8FAFC",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  backend: {
    enabled: false,
    framework: "none",
    storage: "none",
    endpoints: [],
  },
  mockData: [
    {
      name: "campaigns",
      description: "Campaign records.",
      sampleRecords: [{ name: "Spring", conversions: 184 }],
    },
  ],
  acceptanceCriteria: [
    {
      id: "AC-1",
      requirement: "Show campaign metrics.",
      evidence: "Four labelled metric cards are visible.",
    },
  ],
  assumptions: ["Mock data is acceptable."],
  conflicts: [],
  openQuestions: [],
};

describe("QwenRequirementProcessor", () => {
  it("requests structured JSON and validates the result", async () => {
    const fetchImplementation = vi.fn(async (_input, init) => {
      const payload = JSON.parse(String(init?.body)) as {
        response_format: unknown;
        enable_thinking?: boolean;
        max_tokens?: number;
        messages: Array<{ role: string; content: unknown }>;
      };
      expect(payload.response_format).toEqual({ type: "json_object" });
      expect(payload.enable_thinking).toBe(false);
      expect(payload.max_tokens).toBeUndefined();
      expect(payload.messages[1]?.content).toEqual([
        expect.objectContaining({ type: "text" }),
      ]);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(specification) } }],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const provider = new QwenRequirementProcessor({
      apiKey: "test-key",
      fetchImplementation,
    });

    await expect(provider.createProductSpec(request)).resolves.toEqual({
      version: 1,
      document: specification,
    });
  });

  it("passes screenshot URLs as multimodal image content", async () => {
    const fetchImplementation = vi.fn(async (_input, init) => {
      const payload = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string; content: unknown }>;
      };
      expect(payload.messages[1]?.content).toEqual([
        {
          type: "image_url",
          image_url: {
            url: "https://assets.example.com/regional-sales.png?signature=123",
          },
        },
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining(
            "The attached images are visual references",
          ),
        }),
      ]);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(specification) } }],
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    const provider = new QwenRequirementProcessor({
      apiKey: "test-key",
      fetchImplementation,
    });

    await provider.createProductSpec({
      ...request,
      inputs: {
        ...request.inputs,
        screenshots: [
          {
            id: "sheet-1",
            url: "https://assets.example.com/regional-sales.png?signature=123",
            mimeType: "image/png",
            description: "Regional sales spreadsheet",
          },
        ],
      },
    });

    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("requests the bounded FastAPI shape only when backend is allowed", async () => {
    const backendSpecification: ProductSpec = {
      ...specification,
      backend: {
        enabled: true,
        framework: "fastapi",
        storage: "memory",
        endpoints: [
          {
            method: "GET",
            path: "/api/teams",
            purpose: "List teams and votes.",
          },
          {
            method: "POST",
            path: "/api/teams/{team_id}/vote",
            purpose: "Submit a vote.",
          },
        ],
      },
    };
    const fetchImplementation = vi.fn(async (_input, init) => {
      const payload = JSON.parse(String(init?.body)) as {
        messages: Array<{
          content: Array<{ type: string; text?: string }>;
        }>;
      };
      const prompt = payload.messages[1]?.content.at(-1)?.text;
      expect(prompt).toContain("A tiny backend is allowed");
      expect(prompt).toContain("FastAPI with in-memory storage");
      expect(prompt).toContain(
        "Never put parameters, colons, braces, or query strings in routes",
      );
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(backendSpecification),
              },
            },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    const provider = new QwenRequirementProcessor({
      apiKey: "test-key",
      fetchImplementation,
    });

    await expect(
      provider.createProductSpec({
        ...request,
        preferences: {
          ...request.preferences,
          allowBackend: true,
        },
      }),
    ).resolves.toMatchObject({
      document: {
        backend: {
          enabled: true,
          framework: "fastapi",
          storage: "memory",
        },
      },
    });
  });

  it("rejects a structurally invalid ProductSpec", async () => {
    const provider = new QwenRequirementProcessor({
      apiKey: "test-key",
      fetchImplementation: (async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ nope: true }) } }],
          }),
          { status: 200 },
        )) as typeof fetch,
    });

    await expect(provider.createProductSpec(request)).rejects.toThrow(
      "invalid ProductSpec",
    );
  });

  it("rejects a backend setting that contradicts the request", async () => {
    const provider = new QwenRequirementProcessor({
      apiKey: "test-key",
      fetchImplementation: (async () =>
        new Response(
          JSON.stringify({
            choices: [
              { message: { content: JSON.stringify(specification) } },
            ],
          }),
          { status: 200 },
        )) as typeof fetch,
    });

    await expect(
      provider.createProductSpec({
        ...request,
        preferences: {
          ...request.preferences,
          allowBackend: true,
        },
      }),
    ).rejects.toThrow("backend setting does not match");
  });

  it("rejects a plan key paired with the pay-as-you-go endpoint", () => {
    expect(
      () =>
        new QwenRequirementProcessor({
          apiKey: "sk-sp-test",
          baseUrl:
            "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        }),
    ).toThrow("credential mismatch");
  });

  it("rejects the thinking-only preview model", () => {
    expect(
      () =>
        new QwenRequirementProcessor({
          apiKey: "test-key",
          model: "qwen3.8-max-preview",
        }),
    ).toThrow("thinking-only");
  });
});
