import {
  ProductSpecSchema,
  type DemoRequest,
  type ProductSpec,
} from "@waki/contracts";
import type {
  ProductSpecArtifact,
  RequirementProcessor,
} from "@waki/core";

interface QwenRequirementProcessorOptions {
  apiKey: string;
  baseUrl?: string | undefined;
  model?: string | undefined;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}

interface QwenChatCompletion {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    code?: string;
    message?: string;
  };
}

function normalizedBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function meetingContext(request: DemoRequest): Record<string, unknown> {
  return {
    project: request.project,
    textInputs: request.inputs.text.map((input) => input.content),
    screenshotNotes: request.inputs.screenshots.map((input) => ({
      id: input.id,
      description: input.description ?? "No description provided",
      mimeType: input.mimeType,
    })),
    audioInputs: request.inputs.audio.map((input) => ({
      mimeType: input.mimeType,
      note: "Audio transcription is not enabled in the Stage 2 baseline.",
    })),
    preferences: request.preferences,
  };
}

function productSpecPrompt(request: DemoRequest): string {
  return [
    "Create a ProductSpec JSON object for a hackathon mini-app.",
    "Optimize for a simple, convincing hackathon demo that can be built quickly.",
    "Focus on one primary user workflow and only the features explicitly needed",
    "to demonstrate the meeting's core idea. Avoid speculative or enterprise features.",
    "The attached images are visual references for the requested demo.",
    "Use them to identify relevant metrics, labels, layout, filters, and design cues.",
    "Prioritize the meeting transcript if it conflicts with an image.",
    "Use representative mock data; do not reproduce sensitive or personal data.",
    "Capture important visual findings in the ProductSpec so the coding agent",
    "can implement them without direct access to the images.",
    "Return JSON only. Do not use Markdown or commentary.",
    "Use schemaVersion 1.0.",
    "Limit the result to 1-3 pages and a frontend-only React experience.",
    "Use realistic local mock data. Do not require authentication, a backend,",
    "external APIs, paid assets, or remote images.",
    "Every acceptance criterion needs a unique AC-N id and observable evidence.",
    "Record missing details as assumptions or openQuestions; never invent secrets.",
    "",
    "Required JSON shape:",
    JSON.stringify({
      schemaVersion: "1.0",
      project: {
        name: "string",
        summary: "string",
        primaryUser: "string",
        primaryGoal: "string",
      },
      pages: [
        {
          route: "/",
          name: "string",
          purpose: "string",
          sections: ["string"],
          interactions: ["string"],
        },
      ],
      design: {
        visualDirection: "string",
        primaryColor: "#RRGGBB",
        accentColor: "#RRGGBB",
        backgroundColor: "#RRGGBB",
        fontFamily: "string",
      },
      mockData: [
        {
          name: "string",
          description: "string",
          sampleRecords: [{ field: "value" }],
        },
      ],
      acceptanceCriteria: [
        {
          id: "AC-1",
          requirement: "string",
          evidence: "string",
        },
      ],
      assumptions: ["string"],
      conflicts: ["string"],
      openQuestions: ["string"],
    }),
    "",
    "Meeting input:",
    JSON.stringify(meetingContext(request)),
  ].join("\n");
}

export class QwenRequirementProcessor implements RequirementProcessor {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: QwenRequirementProcessorOptions) {
    if (!options.apiKey.trim()) {
      throw new Error("DASHSCOPE_API_KEY is required for Qwen");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = normalizedBaseUrl(
      options.baseUrl ??
        "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    );
    if (
      this.apiKey.startsWith("sk-sp-") &&
      this.baseUrl.includes("dashscope-intl.aliyuncs.com/compatible-mode")
    ) {
      throw new Error(
        "Qwen credential mismatch: sk-sp- plan keys cannot use the " +
          "pay-as-you-go DashScope endpoint. Waki's custom backend should use " +
          "a regular pay-as-you-go QwenCloud API key.",
      );
    }
    this.model = options.model ?? "qwen3.7-plus";
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 180_000;
  }

  async createProductSpec(
    request: DemoRequest,
  ): Promise<ProductSpecArtifact> {
    const userContent = [
      ...request.inputs.screenshots.map((screenshot) => ({
        type: "image_url",
        image_url: { url: screenshot.url },
      })),
      {
        type: "text",
        text: productSpecPrompt(request),
      },
    ];
    const response = await this.fetchImplementation(
      `${this.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content:
                "You are a product requirements analyst. Output strict JSON.",
            },
            {
              role: "user",
              content: userContent,
            },
          ],
          response_format: { type: "json_object" },
          enable_thinking: false,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      },
    );

    const rawBody = await response.text();
    let body: QwenChatCompletion;
    try {
      body = JSON.parse(rawBody) as QwenChatCompletion;
    } catch {
      throw new Error(
        `Qwen returned a non-JSON HTTP response (${response.status})`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `Qwen HTTP ${response.status}: ${
          body.error?.message ?? rawBody.slice(0, 500)
        }`,
      );
    }

    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Qwen response did not contain message content");
    }

    let document: ProductSpec;
    try {
      document = ProductSpecSchema.parse(JSON.parse(content));
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Qwen returned an invalid ProductSpec: ${detail}`);
    }

    return { version: 1, document };
  }
}
