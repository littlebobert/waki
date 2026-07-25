import { existsSync } from "node:fs";
import path from "node:path";
import { AppError } from "./errors.js";

export interface AppConfig {
  host: string;
  port: number;
  workerPollIntervalMs: number;
  databasePath: string;
  botApiToken: string | null;
  webhookSigningSecret: string | null;
  callbackAllowedOrigins: string[];
}

export function findWorkspaceRoot(start = process.cwd()): string {
  let candidate = path.resolve(start);
  while (true) {
    if (existsSync(path.join(candidate, "pnpm-workspace.yaml"))) {
      return candidate;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) {
      return path.resolve(start);
    }
    candidate = parent;
  }
}

export function loadWorkspaceEnvironment(start = process.cwd()): string {
  const workspaceRoot = findWorkspaceRoot(start);
  const envPath = path.join(workspaceRoot, ".env");
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
  return workspaceRoot;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new AppError(500, "CONFIGURATION_ERROR", `${name} is required`);
  }
  return value;
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new AppError(
      500,
      "CONFIGURATION_ERROR",
      `${name} must be a positive integer`,
    );
  }
  return parsed;
}

function enabled(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd = findWorkspaceRoot(),
): AppConfig {
  const databaseValue = env.DATABASE_PATH?.trim() || "./data/waki.sqlite";
  const botAuthEnabled = enabled(env.BOT_AUTH_ENABLED);

  return {
    host: env.HOST?.trim() || "127.0.0.1",
    port: positiveInteger(env.PORT, 3000, "PORT"),
    workerPollIntervalMs: positiveInteger(
      env.WORKER_POLL_INTERVAL_MS,
      500,
      "WORKER_POLL_INTERVAL_MS",
    ),
    databasePath:
      databaseValue === ":memory:"
        ? databaseValue
        : path.resolve(cwd, databaseValue),
    botApiToken: botAuthEnabled ? required(env, "BOT_API_TOKEN") : null,
    webhookSigningSecret: env.WEBHOOK_SIGNING_SECRET?.trim() || null,
    callbackAllowedOrigins: (env.BOT_CALLBACK_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
      .map((origin) => new URL(origin).origin),
  };
}
