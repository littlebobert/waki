import type { DemoRequest, ProductSpec } from "@waki/contracts";

export interface ProductSpecArtifact {
  version: number;
  document: ProductSpec;
}

export interface RequirementProcessor {
  createProductSpec(request: DemoRequest): Promise<ProductSpecArtifact>;
}

export interface SandboxHandle {
  id: string;
  workspacePath?: string;
}

export interface SandboxProvider {
  create(jobId: string, template: "react-static-v1"): Promise<SandboxHandle>;
  uploadDirectory?(sandbox: SandboxHandle, localPath: string): Promise<void>;
  execute?(
    sandbox: SandboxHandle,
    command: string,
    timeoutSeconds?: number,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  destroy(sandboxId: string): Promise<void>;
}

export interface BuildArtifact {
  commit: string | null;
  changedFiles: string[];
  localPath?: string;
}

export interface CodeAgentProvider {
  build(
    sandbox: SandboxHandle,
    specification: ProductSpecArtifact,
  ): Promise<BuildArtifact>;
  repair(
    sandbox: SandboxHandle,
    specification: ProductSpecArtifact,
    report: EvaluationReport,
  ): Promise<BuildArtifact>;
}

export interface EvaluationReport {
  passed: boolean;
  functionalFailures: string[];
  visualIssues: Array<{
    severity: "low" | "medium" | "high";
    message: string;
  }>;
}

export interface DemoEvaluator {
  evaluate(
    sandbox: SandboxHandle,
    specification: ProductSpecArtifact,
  ): Promise<EvaluationReport>;
}

export interface PreviewPublisher {
  publish(sandbox: SandboxHandle): Promise<{
    url: string;
    expiresAt: string;
  }>;
}
