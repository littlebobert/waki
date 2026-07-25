import {
  JobRepository,
  loadConfig,
  loadWorkspaceEnvironment,
  StageTwoWorkflow,
  WebhookDispatcher,
} from "@waki/core";
import {
  DaytonaRuntime,
  QoderCodeAgent,
  QwenRequirementProcessor,
} from "@waki/providers";

const workspaceRoot = loadWorkspaceEnvironment();
const config = loadConfig(process.env, workspaceRoot);
const repository = new JobRepository(config.databasePath);
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
const callbacks = new WebhookDispatcher(repository, {
  signingSecret: config.webhookSigningSecret,
  allowedOrigins: config.callbackAllowedOrigins,
});

let stopping = false;

const stop = (): void => {
  stopping = true;
};

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

while (!stopping) {
  const workflowSteps = await workflow.runUntilIdle();
  const callbacksDelivered = await callbacks.deliverPending();

  if (workflowSteps === 0 && callbacksDelivered === 0) {
    await new Promise((resolve) =>
      setTimeout(resolve, config.workerPollIntervalMs),
    );
  }
}

repository.close();
