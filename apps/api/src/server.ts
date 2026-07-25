import {
  JobRepository,
  loadConfig,
  loadWorkspaceEnvironment,
} from "@waki/core";
import { buildApp } from "./app.js";

const workspaceRoot = loadWorkspaceEnvironment();
const config = loadConfig(process.env, workspaceRoot);
const repository = new JobRepository(config.databasePath);
const app = buildApp({
  repository,
  botApiToken: config.botApiToken,
  callbackAllowedOrigins: config.callbackAllowedOrigins,
  logger: true,
});

const shutdown = async (): Promise<void> => {
  await app.close();
  repository.close();
};

process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});

await app.listen({
  host: config.host,
  port: config.port,
});
