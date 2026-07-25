import { describe, expect, it } from "vitest";
import type { DemoRequest, ProductSpec } from "@waki/contracts";
import type {
  BuildArtifact,
  EvaluationReport,
  ProductSpecArtifact,
  SandboxHandle,
} from "./provider-contracts.js";
import { JobRepository } from "./repository.js";
import { StageTwoWorkflow } from "./workflow.js";

const request: DemoRequest = {
  schemaVersion: "1.0",
  requestId: "req_stage_two",
  conversationId: "conv_stage_two",
  userId: "user_stage_two",
  project: {
    name: "Campaign Pulse",
    description: "Build the dashboard agreed in the meeting.",
  },
  inputs: {
    text: [{ id: "notes", content: "Four KPIs and a campaign table." }],
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
    summary: "A campaign dashboard.",
    primaryUser: "Marketing lead",
    primaryGoal: "Review campaign performance",
  },
  pages: [
    {
      route: "/",
      name: "Overview",
      purpose: "Review performance.",
      sections: ["Metrics", "Campaigns"],
      interactions: ["Filter campaign status"],
    },
  ],
  design: {
    visualDirection: "Calm and data-forward.",
    primaryColor: "#2563EB",
    accentColor: "#14B8A6",
    backgroundColor: "#F8FAFC",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  mockData: [
    {
      name: "campaigns",
      description: "Campaign records.",
      sampleRecords: [{ name: "Spring", status: "Active" }],
    },
  ],
  acceptanceCriteria: [
    {
      id: "AC-1",
      requirement: "Show four metrics.",
      evidence: "Four labelled metric cards are visible.",
    },
  ],
  assumptions: ["Mock data is acceptable."],
  conflicts: [],
  openQuestions: [],
};

describe("StageTwoWorkflow", () => {
  it("takes makeup meeting data through a validated preview", async () => {
    const repository = new JobRepository(":memory:");
    const { job } = repository.createJob(request);
    const calls: string[] = [];
    const workflow = new StageTwoWorkflow({
      repository,
      requirements: {
        async createProductSpec(): Promise<ProductSpecArtifact> {
          calls.push("qwen");
          return { version: 1, document: specification };
        },
      },
      sandboxes: {
        async create(): Promise<SandboxHandle> {
          calls.push("daytona.create");
          return { id: "sandbox_test", workspacePath: "/workspace/app" };
        },
        async uploadDirectory(): Promise<void> {
          calls.push("daytona.upload");
        },
        async execute(_sandbox, command) {
          calls.push(command);
          return { exitCode: 0, stdout: "ok", stderr: "" };
        },
        async destroy(): Promise<void> {},
      },
      codeAgent: {
        async build(): Promise<BuildArtifact> {
          calls.push("qoder");
          return {
            commit: null,
            changedFiles: ["src/App.tsx"],
            localPath: "/tmp/fake-build",
          };
        },
        async repair(): Promise<BuildArtifact> {
          throw new Error("repair should not be called");
        },
      },
      evaluator: {
        async evaluate(): Promise<EvaluationReport> {
          calls.push("evaluate");
          return {
            passed: true,
            functionalFailures: [],
            visualIssues: [],
          };
        },
      },
      previews: {
        async publish() {
          calls.push("publish");
          return {
            url: "https://preview.example.test",
            expiresAt: "2030-01-01T00:00:00.000Z",
          };
        },
      },
    });

    expect(await workflow.runUntilIdle()).toBe(6);
    expect(repository.getJob(job.jobId)).toMatchObject({
      status: "PREVIEW_READY",
      specVersion: 1,
      sandboxId: "sandbox_test",
      previewUrl: "https://preview.example.test",
      previewExpiresAt: "2030-01-01T00:00:00.000Z",
    });
    expect(
      repository.getArtifact<ProductSpec>(job.jobId, "product-spec", 1)
        ?.payload,
    ).toEqual(specification);
    expect(calls).toEqual([
      "qwen",
      "daytona.create",
      "qoder",
      "daytona.upload",
      "npm install --no-audit --no-fund",
      "npm run build",
      "evaluate",
      "publish",
    ]);
    expect(
      repository
        .listEvents(job.jobId)
        .map((event) => event.event)
        .at(-1),
    ).toBe("demo.preview_ready");
    repository.close();
  });

  it("records provider failures on the job", async () => {
    const repository = new JobRepository(":memory:");
    const { job } = repository.createJob({
      ...request,
      requestId: "req_failure",
    });
    const workflow = new StageTwoWorkflow({
      repository,
      requirements: {
        async createProductSpec(): Promise<ProductSpecArtifact> {
          throw new Error("Qwen unavailable");
        },
      },
      sandboxes: {
        async create(): Promise<SandboxHandle> {
          throw new Error("not reached");
        },
        async uploadDirectory(): Promise<void> {},
        async execute() {
          return { exitCode: 0, stdout: "", stderr: "" };
        },
        async destroy(): Promise<void> {},
      },
      codeAgent: {
        async build(): Promise<BuildArtifact> {
          throw new Error("not reached");
        },
        async repair(): Promise<BuildArtifact> {
          throw new Error("not reached");
        },
      },
      evaluator: {
        async evaluate(): Promise<EvaluationReport> {
          throw new Error("not reached");
        },
      },
      previews: {
        async publish() {
          throw new Error("not reached");
        },
      },
    });

    await workflow.runOne();
    await workflow.runOne();
    expect(repository.getJob(job.jobId)).toMatchObject({
      status: "FAILED",
      error: {
        code: "STAGE_TWO_FAILED",
        message: "Qwen unavailable",
      },
    });
    repository.close();
  });
});
