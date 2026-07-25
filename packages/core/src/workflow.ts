import type { ProductSpec } from "@waki/contracts";
import type {
  CodeAgentProvider,
  DemoEvaluator,
  PreviewPublisher,
  RequirementProcessor,
  SandboxHandle,
  SandboxProvider,
} from "./provider-contracts.js";
import type { JobRepository } from "./repository.js";

/**
 * Stage 1 proves durable orchestration only. Stage 2 replaces these placeholder
 * transitions with provider-backed ProductSpec generation and site building.
 */
export class StageOneWorkflow {
  constructor(private readonly repository: JobRepository) {}

  runOne(): boolean {
    const job = this.repository.findNextStageOneJob();
    if (!job) {
      return false;
    }

    if (job.status === "ACCEPTED") {
      return this.repository.transition(
        job.jobId,
        "ACCEPTED",
        "SPEC_GENERATING",
        "Normalizing meeting inputs",
        15,
      );
    }

    if (job.status === "FEEDBACK_RECEIVED") {
      return this.repository.transition(
        job.jobId,
        "FEEDBACK_RECEIVED",
        "SPEC_GENERATING",
        "Applying feedback to product specification",
        20,
      );
    }

    if (job.status === "SPEC_GENERATING") {
      return this.repository.markSpecReady(job.jobId);
    }

    return false;
  }

  runUntilIdle(maxSteps = 100): number {
    let completedSteps = 0;
    while (completedSteps < maxSteps && this.runOne()) {
      completedSteps += 1;
    }
    return completedSteps;
  }
}

type BuildRuntime = SandboxProvider &
  Required<Pick<SandboxProvider, "uploadDirectory" | "execute">>;

export interface StageTwoWorkflowDependencies {
  repository: JobRepository;
  requirements: RequirementProcessor;
  sandboxes: BuildRuntime;
  codeAgent: CodeAgentProvider;
  evaluator: DemoEvaluator;
  previews: PreviewPublisher;
}

export class StageTwoWorkflow {
  constructor(private readonly dependencies: StageTwoWorkflowDependencies) {}

  async runOne(): Promise<boolean> {
    const { repository } = this.dependencies;
    const job = repository.findNextWorkflowJob();
    if (!job) {
      return false;
    }

    try {
      if (job.status === "ACCEPTED") {
        return repository.transition(
          job.jobId,
          "ACCEPTED",
          "SPEC_GENERATING",
          "Converting meeting notes into a ProductSpec",
          10,
        );
      }

      if (job.status === "FEEDBACK_RECEIVED") {
        return repository.transition(
          job.jobId,
          "FEEDBACK_RECEIVED",
          "SPEC_GENERATING",
          "Applying feedback to the ProductSpec",
          10,
        );
      }

      if (job.status === "SPEC_GENERATING") {
        const request = repository.getRequest(job.jobId);
        if (!request) {
          throw new Error("Job request could not be loaded");
        }
        const specification =
          await this.dependencies.requirements.createProductSpec(request);
        return repository.markSpecReady(job.jobId, specification.document);
      }

      if (job.status === "SPEC_READY") {
        return repository.transition(
          job.jobId,
          "SPEC_READY",
          "SANDBOX_CREATING",
          "Creating an isolated Daytona sandbox",
          35,
        );
      }

      if (job.status === "SANDBOX_CREATING") {
        const sandbox = await this.dependencies.sandboxes.create(
          job.jobId,
          "react-static-v1",
        );
        if (!repository.setSandbox(job.jobId, sandbox.id)) {
          return false;
        }
        return repository.transition(
          job.jobId,
          "SANDBOX_CREATING",
          "BUILDING",
          "Qoder is implementing the mini-app",
          45,
        );
      }

      if (job.status === "BUILDING") {
        const sandbox = this.requireSandbox(job);
        const specification = this.requireSpecification(
          repository.getArtifact<ProductSpec>(
            job.jobId,
            "product-spec",
            job.specVersion,
          )?.payload,
          job.jobId,
        );
        const build = await this.dependencies.codeAgent.build(sandbox, {
          version: job.specVersion,
          document: specification,
        });
        if (!build.localPath) {
          throw new Error("Code agent did not return a local build directory");
        }
        await this.dependencies.sandboxes.uploadDirectory(
          sandbox,
          build.localPath,
        );
        const install = await this.dependencies.sandboxes.execute(
          sandbox,
          "npm install --no-audit --no-fund",
          600,
        );
        if (install.exitCode !== 0) {
          throw new Error(`Dependency install failed: ${install.stderr || install.stdout}`);
        }
        const compile = await this.dependencies.sandboxes.execute(
          sandbox,
          "npm run build",
          600,
        );
        if (compile.exitCode !== 0) {
          throw new Error(`Production build failed: ${compile.stderr || compile.stdout}`);
        }
        repository.saveArtifact(job.jobId, "build-report", job.specVersion, {
          changedFiles: build.changedFiles,
          installOutput: install.stdout.slice(-4_000),
          buildOutput: compile.stdout.slice(-4_000),
        });
        return repository.transition(
          job.jobId,
          "BUILDING",
          "FUNCTIONAL_TESTING",
          "Checking the production build",
          80,
        );
      }

      if (job.status === "FUNCTIONAL_TESTING") {
        const sandbox = this.requireSandbox(job);
        const specification = this.requireSpecification(
          repository.getArtifact<ProductSpec>(
            job.jobId,
            "product-spec",
            job.specVersion,
          )?.payload,
          job.jobId,
        );
        const report = await this.dependencies.evaluator.evaluate(sandbox, {
          version: job.specVersion,
          document: specification,
        });
        repository.saveArtifact(
          job.jobId,
          "evaluation-report",
          job.specVersion,
          report,
        );
        if (!report.passed) {
          throw new Error(
            `Functional checks failed: ${report.functionalFailures.join("; ")}`,
          );
        }
        const preview = await this.dependencies.previews.publish(sandbox);
        return repository.markPreviewReady(job.jobId, preview);
      }

      return false;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown workflow failure";
      repository.failJob(job.jobId, "STAGE_TWO_FAILED", message);
      return true;
    }
  }

  async runUntilIdle(maxSteps = 100): Promise<number> {
    let completedSteps = 0;
    while (completedSteps < maxSteps && (await this.runOne())) {
      completedSteps += 1;
    }
    return completedSteps;
  }

  private requireSandbox(job: {
    jobId: string;
    sandboxId: string | null;
  }): SandboxHandle {
    if (!job.sandboxId) {
      throw new Error(`Job ${job.jobId} has no sandbox`);
    }
    return { id: job.sandboxId, workspacePath: "/home/daytona/app" };
  }

  private requireSpecification(
    specification: ProductSpec | undefined,
    jobId: string,
  ): ProductSpec {
    if (!specification) {
      throw new Error(`Job ${jobId} has no ProductSpec artifact`);
    }
    return specification;
  }
}
