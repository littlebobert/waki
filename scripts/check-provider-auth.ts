import "dotenv/config";
import {
  accessTokenFromEnv,
  query,
} from "@qoder-ai/qoder-agent-sdk";

interface CheckResult {
  provider: string;
  status: "verified" | "skipped" | "failed";
  detail: string;
}

const results: CheckResult[] = [];

function normalizedBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

async function checkQwen(): Promise<void> {
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim();
  const baseUrl =
    process.env.QWEN_BASE_URL?.trim() ||
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  const model = process.env.QWEN_MODEL?.trim() || "qwen3.7-plus";

  if (!apiKey) {
    results.push({
      provider: "Qwen",
      status: "skipped",
      detail: "DASHSCOPE_API_KEY is not configured",
    });
    return;
  }
  if (
    apiKey.startsWith("sk-sp-") &&
    baseUrl.includes("dashscope-intl.aliyuncs.com/compatible-mode")
  ) {
    throw new Error(
      "credential mismatch: sk-sp- plan key with the pay-as-you-go endpoint. " +
        "Use a regular QwenCloud pay-as-you-go key for this backend.",
    );
  }
  const response = await fetch(
    `${normalizedBaseUrl(baseUrl)}/chat/completions`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: "Reply with exactly AUTH_OK.",
          },
        ],
        max_tokens: 8,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    try {
      const parsed = JSON.parse(body) as {
        error?: { code?: string };
      };
      if (parsed.error?.code === "AccessDenied.Unpurchased") {
        throw new Error(
          "Qwen Cloud denied model access. Confirm this is a pay-as-you-go key " +
            "created at home.qwencloud.com and that the account has free quota " +
            "or billing enabled.",
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Qwen Cloud denied")
      ) {
        throw error;
      }
    }
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  results.push({
    provider: "Qwen",
    status: "verified",
    detail: `authenticated with ${model}`,
  });
}

async function checkDaytona(): Promise<void> {
  const apiKey = process.env.DAYTONA_API_KEY?.trim();
  const apiUrl =
    process.env.DAYTONA_API_URL?.trim() || "https://app.daytona.io/api";

  if (!apiKey) {
    results.push({
      provider: "Daytona",
      status: "skipped",
      detail: "DAYTONA_API_KEY is not configured",
    });
    return;
  }

  const response = await fetch(
    `${normalizedBaseUrl(apiUrl)}/api-keys/current`,
    {
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  results.push({
    provider: "Daytona",
    status: "verified",
    detail: "API key accepted",
  });
}

async function checkQoder(): Promise<void> {
  if (!process.env.QODER_PERSONAL_ACCESS_TOKEN?.trim()) {
    results.push({
      provider: "Qoder",
      status: "skipped",
      detail: "QODER_PERSONAL_ACCESS_TOKEN is not configured",
    });
    return;
  }

  const messages = query({
    prompt: "Reply with exactly AUTH_OK. Do not use tools.",
    options: {
      auth: accessTokenFromEnv(),
      tools: [],
      permissionMode: "dontAsk",
      maxTurns: 1,
    },
  });

  let succeeded = false;
  try {
    for await (const message of messages) {
      if (message.type === "result") {
        if (message.subtype !== "success") {
          throw new Error(
            message.errors?.join("; ") || `query ended with ${message.subtype}`,
          );
        }
        succeeded = true;
      }
    }
  } finally {
    await messages.close?.();
  }

  if (!succeeded) {
    throw new Error("Qoder query ended without a successful result");
  }

  results.push({
    provider: "Qoder",
    status: "verified",
    detail: "PAT accepted",
  });
}

async function main(): Promise<void> {
  const checks: Array<[string, () => Promise<void>]> = [
    ["Qwen", checkQwen],
    ["Daytona", checkDaytona],
    ["Qoder", checkQoder],
  ];

  for (const [provider, check] of checks) {
    try {
      await check();
    } catch (error) {
      results.push({
        provider,
        status: "failed",
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  for (const result of results) {
    console.log(
      `${result.status.toUpperCase().padEnd(8)} ${result.provider}: ${result.detail}`,
    );
  }

  if (results.some((result) => result.status === "failed")) {
    process.exitCode = 1;
  }
}

void main();
