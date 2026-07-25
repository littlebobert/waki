import { readFile } from "node:fs/promises";
import path from "node:path";
import { DemoRequestSchema } from "../packages/contracts/src/index.js";
import {
  JobRepository,
  loadWorkspaceEnvironment,
  StageTwoWorkflow,
} from "../packages/core/src/index.js";
import {
  DaytonaRuntime,
  QoderCodeAgent,
  QwenRequirementProcessor,
} from "../packages/providers/src/index.js";

async function main(): Promise<void> {
  const workspaceRoot = loadWorkspaceEnvironment();
  const request = DemoRequestSchema.parse(
    JSON.parse(
      await readFile(
        path.join(workspaceRoot, "examples/demo-request.json"),
        "utf8",
      ),
    ),
  );
  const repository = new JobRepository(":memory:");
  const daytona = new DaytonaRuntime({
    apiKey: process.env.DAYTONA_API_KEY ?? "",
    apiUrl: process.env.DAYTONA_API_URL,
    target: process.env.DAYTONA_TARGET,
  });
  const workflow = new StageTwoWorkflow({
    repository,
    requirements: new QwenRequirementProcessor({
      apiKey: process.env.DASHSCOPE_API_KEY ?? "",
      baseUrl: process.env.QWEN_BASE_URL,
      model: process.env.QWEN_MODEL,
    }),
    sandboxes: daytona,
    codeAgent: new QoderCodeAgent({
      accessToken: process.env.QODER_PERSONAL_ACCESS_TOKEN ?? "",
    }),
    evaluator: daytona,
    previews: daytona,
  });

  const { job } = repository.createJob({
    ...request,
    requestId: `baseline_${Date.now()}`,
  });
  console.log(`Created ${job.jobId}`);

  while (await workflow.runOne()) {
    const current = repository.getJob(job.jobId);
    console.log(
      `${current?.status.padEnd(20)} ${current?.progress.percent}% ${
        current?.progress.stage
      }`,
    );
    if (current?.status === "FAILED") {
      break;
    }
  }

  const result = repository.getJob(job.jobId);
  if (result?.status !== "PREVIEW_READY") {
    throw new Error(result?.error?.message ?? "Baseline did not produce a preview");
  }
  console.log(`Preview: ${result.previewUrl}`);
  console.log(`Expires: ${result.previewExpiresAt}`);
  repository.close();
}

void main();
