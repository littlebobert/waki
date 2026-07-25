import { createHash, timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import {
  ApprovalRequestSchema,
  ClarificationAnswerSchema,
  DemoRequestSchema,
  FeedbackRequestSchema,
} from "@waki/contracts";
import {
  AppError,
  assertAllowedCallbackUrl,
  type JobRepository,
} from "@waki/core";

export interface ApiDependencies {
  repository: JobRepository;
  botApiToken: string | null;
  callbackAllowedOrigins: readonly string[];
  logger?: boolean;
}

function tokenDigest(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

function hasValidBearerToken(
  authorization: string | undefined,
  expectedToken: string,
): boolean {
  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }
  const providedToken = authorization.slice("Bearer ".length);
  return timingSafeEqual(
    tokenDigest(providedToken),
    tokenDigest(expectedToken),
  );
}

export function buildApp(dependencies: ApiDependencies): FastifyInstance {
  const app = Fastify({
    logger: dependencies.logger ?? false,
    bodyLimit: 1_000_000,
  });

  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/v1/") || !dependencies.botApiToken) {
      return;
    }

    if (
      !hasValidBearerToken(
        request.headers.authorization,
        dependencies.botApiToken,
      )
    ) {
      await reply.code(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "A valid bot service token is required",
        },
      });
    }
  });

  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof ZodError) {
      await reply.code(400).send({
        error: {
          code: "INVALID_REQUEST",
          message: "The request payload is invalid",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
      return;
    }

    if (error instanceof AppError) {
      await reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }

    app.log.error(error);
    await reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    });
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "waki-demo-builder",
  }));

  app.post("/v1/demo-jobs", async (request, reply) => {
    const payload = DemoRequestSchema.parse(request.body);
    assertAllowedCallbackUrl(
      payload.callback.url,
      dependencies.callbackAllowedOrigins,
    );
    const result = dependencies.repository.createJob(payload);

    await reply.code(202).send({
      jobId: result.job.jobId,
      status: result.job.status,
      idempotentReplay: !result.created,
    });
  });

  app.get<{ Params: { jobId: string } }>(
    "/v1/demo-jobs/:jobId",
    async (request) => {
      const job = dependencies.repository.getJob(request.params.jobId);
      if (!job) {
        throw new AppError(
          404,
          "JOB_NOT_FOUND",
          "The requested job was not found",
        );
      }
      return job;
    },
  );

  app.get<{ Params: { jobId: string } }>(
    "/v1/demo-jobs/:jobId/events",
    async (request) => ({
      jobId: request.params.jobId,
      events: dependencies.repository.listEvents(request.params.jobId),
    }),
  );

  app.get<{ Params: { jobId: string } }>(
    "/v1/demo-jobs/:jobId/spec",
    async (request) => {
      const job = dependencies.repository.getJob(request.params.jobId);
      if (!job) {
        throw new AppError(
          404,
          "JOB_NOT_FOUND",
          "The requested job was not found",
        );
      }
      if (job.specVersion === 0) {
        throw new AppError(
          409,
          "SPEC_NOT_READY",
          "The ProductSpec is not ready yet",
        );
      }
      return dependencies.repository.getArtifact(
        request.params.jobId,
        "product-spec",
        job.specVersion,
      );
    },
  );

  app.post<{ Params: { jobId: string } }>(
    "/v1/demo-jobs/:jobId/answers",
    async (request, reply) => {
      const answer = ClarificationAnswerSchema.parse(request.body);
      const job = dependencies.repository.saveAnswer(
        request.params.jobId,
        answer,
      );
      await reply.code(202).send({
        jobId: job.jobId,
        status: job.status,
      });
    },
  );

  app.post<{ Params: { jobId: string } }>(
    "/v1/demo-jobs/:jobId/feedback",
    async (request, reply) => {
      const feedback = FeedbackRequestSchema.parse(request.body);
      const job = dependencies.repository.saveFeedback(
        request.params.jobId,
        feedback,
      );
      await reply.code(202).send({
        jobId: job.jobId,
        status: job.status,
      });
    },
  );

  app.post<{ Params: { jobId: string } }>(
    "/v1/demo-jobs/:jobId/approve",
    async (request, reply) => {
      const approval = ApprovalRequestSchema.parse(request.body);
      const job = dependencies.repository.approve(
        request.params.jobId,
        approval,
      );
      await reply.code(202).send({
        jobId: job.jobId,
        status: job.status,
        approvedAt: job.approvedAt,
      });
    },
  );

  return app;
}
