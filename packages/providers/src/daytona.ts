import { readdir } from "node:fs/promises";
import path from "node:path";
import { CodeLanguage, Daytona, type Sandbox } from "@daytona/sdk";
import type {
  DemoEvaluator,
  EvaluationReport,
  PreviewPublisher,
  ProductSpecArtifact,
  SandboxHandle,
  SandboxProvider,
} from "@waki/core";

const REMOTE_WORKSPACE = "/home/daytona/app";
const PREVIEW_PORT = 3000;

interface DaytonaRuntimeOptions {
  apiKey: string;
  apiUrl?: string | undefined;
  target?: string | undefined;
  ttlMinutes?: number;
  previewTtlSeconds?: number;
}

export class DaytonaRuntime
  implements SandboxProvider, DemoEvaluator, PreviewPublisher
{
  private readonly client: Daytona;
  private readonly ttlMinutes: number;
  private readonly previewTtlSeconds: number;

  constructor(options: DaytonaRuntimeOptions) {
    if (!options.apiKey.trim()) {
      throw new Error("DAYTONA_API_KEY is required for Daytona");
    }
    this.client = new Daytona({
      apiKey: options.apiKey,
      ...(options.apiUrl ? { apiUrl: options.apiUrl } : {}),
      ...(options.target ? { target: options.target } : {}),
    });
    this.ttlMinutes = options.ttlMinutes ?? 120;
    this.previewTtlSeconds = Math.min(
      options.previewTtlSeconds ?? 7_200,
      86_400,
    );
  }

  async create(
    jobId: string,
    _template: "react-static-v1",
  ): Promise<SandboxHandle> {
    const sandbox = await this.client.create(
      {
        language: CodeLanguage.TYPESCRIPT,
        labels: { application: "waki", jobId },
        ttlMinutes: this.ttlMinutes,
        autoDeleteInterval: this.ttlMinutes,
        public: false,
      },
      { timeout: 120 },
    );
    return { id: sandbox.id, workspacePath: REMOTE_WORKSPACE };
  }

  async destroy(sandboxId: string): Promise<void> {
    const sandbox = await this.client.get(sandboxId);
    await this.client.delete(sandbox, 60, true);
  }

  async uploadDirectory(
    handle: SandboxHandle,
    localPath: string,
  ): Promise<void> {
    const sandbox = await this.getSandbox(handle);
    await this.uploadTree(sandbox, localPath, REMOTE_WORKSPACE);
  }

  async execute(
    handle: SandboxHandle,
    command: string,
    timeoutSeconds = 600,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const sandbox = await this.getSandbox(handle);
    const result = await sandbox.process.executeCommand(
      command,
      REMOTE_WORKSPACE,
      {},
      timeoutSeconds,
    );
    return { exitCode: result.exitCode, stdout: result.result, stderr: "" };
  }

  async evaluate(
    handle: SandboxHandle,
    specification: ProductSpecArtifact,
  ): Promise<EvaluationReport> {
    const result = await this.execute(
      handle,
      "test -f dist/index.html && test -s dist/index.html",
      30,
    );
    return {
      passed: result.exitCode === 0,
      functionalFailures:
        result.exitCode === 0
          ? []
          : ["The production build did not create dist/index.html"],
      visualIssues: specification.document.openQuestions.length
        ? [
            {
              severity: "low",
              message:
                "The ProductSpec contains open questions; the demo uses documented assumptions.",
            },
          ]
        : [],
    };
  }

  async publish(
    handle: SandboxHandle,
  ): Promise<{ url: string; expiresAt: string }> {
    const sandbox = await this.getSandbox(handle);
    const sessionId = `preview-${handle.id.slice(0, 12)}`;
    await sandbox.process.createSession(sessionId);
    await sandbox.process.executeSessionCommand(sessionId, {
      command:
        `cd ${REMOTE_WORKSPACE} && ` +
        `npm run dev -- --host 0.0.0.0 --port ${PREVIEW_PORT}`,
      runAsync: true,
    });
    const preview = await sandbox.getSignedPreviewUrl(
      PREVIEW_PORT,
      this.previewTtlSeconds,
    );
    await this.waitUntilReachable(preview.url);
    return {
      url: preview.url,
      expiresAt: new Date(
        Date.now() + this.previewTtlSeconds * 1_000,
      ).toISOString(),
    };
  }

  private async waitUntilReachable(url: string): Promise<void> {
    let lastStatus: number | null = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(5_000),
        });
        lastStatus = response.status;
        if (response.ok) {
          return;
        }
      } catch {
        // Vite and the Daytona preview route may still be starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error(
      `Daytona preview did not become reachable${
        lastStatus ? ` (last HTTP status ${lastStatus})` : ""
      }`,
    );
  }

  private async getSandbox(handle: SandboxHandle): Promise<Sandbox> {
    return this.client.get(handle.id);
  }

  private async uploadTree(
    sandbox: Sandbox,
    localDirectory: string,
    remoteDirectory: string,
  ): Promise<void> {
    const entries = await readdir(localDirectory, { withFileTypes: true });
    await sandbox.fs.createFolder(remoteDirectory, "755");
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }
      const localEntry = path.join(localDirectory, entry.name);
      const remoteEntry = `${remoteDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        await this.uploadTree(sandbox, localEntry, remoteEntry);
      } else {
        await sandbox.fs.uploadFile(localEntry, remoteEntry);
      }
    }
  }
}
