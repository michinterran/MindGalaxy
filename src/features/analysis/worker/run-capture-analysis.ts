import { randomUUID } from "node:crypto";
import { zodTextFormat } from "openai/helpers/zod";
import { JOB_REGISTRY } from "@/config/registry";
import {
  captureAnalysisSchema,
  type CaptureAnalysisOutput,
} from "@/features/analysis/model/extraction-schema";
import { verifyEvidenceQuote } from "@/features/analysis/model/evidence";
import { scoreAnalysis } from "@/features/analysis/model/scoring";
import {
  analysisErrorCode,
  logAnalysisEvent,
} from "@/features/analysis/observability";
import {
  claimAnalysisJob,
  claimAnalysisJobById,
  getAnalysisJobState,
  type AnalysisJobState,
} from "@/features/analysis/worker/claim";
import { embedCaptureAnalysis } from "@/features/analysis/worker/embeddings";
import {
  failAnalysisJob,
  persistAnalysisResult,
} from "@/features/analysis/worker/persist-analysis";
import { CAPTURE_ANALYSIS_SYSTEM_PROMPT } from "@/features/analysis/worker/prompt";
import { getOpenAIClient } from "@/lib/ai/client";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

function attachVerifiedEvidence(
  analysis: CaptureAnalysisOutput,
  rawText: string,
  model: string,
  promptVersion: string,
  captureId: string,
  processingJobId: string,
  attemptId: string,
) {
  const evidenceItems: Array<{
    evidence: ReturnType<typeof verifyEvidenceQuote>;
    confidence: number;
  }> = [];

  const withMetadata = {
    ...analysis,
    nodes: analysis.nodes.map((node) => {
      const evidence = verifyEvidenceQuote(rawText, node.evidence?.quote);
      evidenceItems.push({ evidence, confidence: node.confidence });

      return {
        ...node,
        evidence: evidence
          ? {
              ...evidence,
              captureId,
              model,
              promptVersion,
              processingJobId,
              attemptId,
            }
          : null,
      };
    }),
    edges: analysis.edges.map((edge) => {
      const evidence = verifyEvidenceQuote(rawText, edge.evidence?.quote);
      evidenceItems.push({ evidence, confidence: edge.confidence });

      return {
        ...edge,
        evidence: evidence
          ? {
              ...evidence,
              captureId,
              model,
              promptVersion,
              processingJobId,
              attemptId,
            }
          : null,
      };
    }),
    contexts: analysis.contexts.map((context) => {
      const evidence = verifyEvidenceQuote(rawText, context.evidence?.quote);
      evidenceItems.push({ evidence, confidence: context.confidence });

      return {
        ...context,
        evidence: evidence
          ? {
              ...evidence,
              captureId,
              model,
              promptVersion,
              processingJobId,
              attemptId,
            }
          : null,
      };
    }),
  } satisfies CaptureAnalysisOutput;

  return {
    analysis: withMetadata,
    score: scoreAnalysis(withMetadata, evidenceItems),
  };
}

export type CaptureAnalysisRunDisposition =
  | "batch"
  | "processed"
  | "terminal"
  | "pending";

export type CaptureAnalysisRunOptions = {
  maxAttempts?: number;
  rethrowFailures?: boolean;
  jobId?: string;
  expectedCaptureId?: string;
  expectedWorkspaceId?: string;
};

export class CaptureAnalysisRunError extends Error {
  constructor(
    message: string,
    readonly jobId: string,
    readonly terminal: boolean,
  ) {
    super(message);
    this.name = "CaptureAnalysisRunError";
  }
}

function assertEventCorrelation(
  state: AnalysisJobState,
  options: CaptureAnalysisRunOptions,
) {
  if (
    (options.expectedCaptureId &&
      state.captureId !== options.expectedCaptureId) ||
    (options.expectedWorkspaceId &&
      state.workspaceId !== options.expectedWorkspaceId)
  ) {
    throw new Error("ANALYSIS_QUEUE_CORRELATION_MISMATCH");
  }
}

function isTerminalState(
  state: AnalysisJobState,
  maxAttempts?: number,
) {
  if (state.status === "completed" || state.status === "needs_review") {
    return true;
  }

  const retryLimit = Math.min(
    state.maxAttempts,
    maxAttempts ?? state.maxAttempts,
  );
  return state.status === "failed" && state.retryCount >= retryLimit;
}

export async function runCaptureAnalysisBatch(
  limit: number,
  options: CaptureAnalysisRunOptions = {},
) {
  const safeLimit = Math.min(Math.max(limit, 1), JOB_REGISTRY.captureStructuring.maxBatchSize);
  const supabase = getSupabaseServiceRoleClient();

  if (!supabase) {
    throw new Error("ANALYSIS_WORKER_NOT_CONFIGURED");
  }

  const workerId = `mindgalaxy-worker-${process.pid}-${randomUUID()}`;
  const results = {
    claimed: 0,
    completed: 0,
    needsReview: 0,
    failed: 0,
    jobIds: [] as string[],
    errorCodes: [] as string[],
    disposition: (options.jobId ? "pending" : "batch") as CaptureAnalysisRunDisposition,
    status: null as string | null,
  };

  if (options.jobId) {
    const state = await getAnalysisJobState(supabase, options.jobId);

    if (!state) {
      throw new Error("ANALYSIS_JOB_NOT_FOUND");
    }

    assertEventCorrelation(state, options);
    results.status = state.status;

    if (isTerminalState(state, options.maxAttempts)) {
      results.disposition = "terminal";
      return results;
    }
  }

  const openai = getOpenAIClient();

  if (!openai) {
    throw new Error("ANALYSIS_WORKER_NOT_CONFIGURED");
  }

  for (let index = 0; index < safeLimit; index += 1) {
    const job = options.jobId
      ? await claimAnalysisJobById(
          supabase,
          options.jobId,
          workerId,
          options.maxAttempts,
        )
      : await claimAnalysisJob(
          supabase,
          workerId,
          options.maxAttempts,
        );

    if (!job) {
      if (options.jobId) {
        const state = await getAnalysisJobState(supabase, options.jobId);

        if (!state) {
          throw new Error("ANALYSIS_JOB_NOT_FOUND");
        }

        assertEventCorrelation(state, options);
        results.status = state.status;
        results.disposition = isTerminalState(state, options.maxAttempts)
          ? "terminal"
          : "pending";
      }
      break;
    }

    results.claimed += 1;
    results.jobIds.push(job.jobId);
    results.disposition = options.jobId ? "processed" : "batch";
    results.status = "running";
    const jobStartedAt = performance.now();

    logAnalysisEvent("info", {
      event: "job.claimed",
      stage: "claim",
      jobId: job.jobId,
      captureId: job.captureId,
      workspaceId: job.workspaceId,
      attemptNumber: job.attemptNumber,
      outcome: "running",
    });

    try {
      const extractionStartedAt = performance.now();
      logAnalysisEvent("info", {
        event: "stage.started",
        stage: "extract",
        jobId: job.jobId,
        captureId: job.captureId,
        attemptNumber: job.attemptNumber,
      });

      const response = await openai.responses.parse({
        model: job.model,
        input: [
          {
            role: "system",
            content: CAPTURE_ANALYSIS_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: job.rawText,
          },
        ],
        text: {
          format: zodTextFormat(captureAnalysisSchema, "capture_analysis"),
        },
      });

      if (!response.output_parsed) {
        throw new Error("ANALYSIS_EMPTY_PARSED_OUTPUT");
      }

      logAnalysisEvent("info", {
        event: "stage.completed",
        stage: "extract",
        jobId: job.jobId,
        captureId: job.captureId,
        attemptNumber: job.attemptNumber,
        durationMs: Math.round(performance.now() - extractionStartedAt),
      });

      const { analysis, score } = attachVerifiedEvidence(
        response.output_parsed,
        job.rawText,
        job.model,
        job.promptVersion,
        job.captureId,
        job.jobId,
        job.attemptId,
      );
      const embeddingStartedAt = performance.now();
      logAnalysisEvent("info", {
        event: "stage.started",
        stage: "embed",
        jobId: job.jobId,
        captureId: job.captureId,
        attemptNumber: job.attemptNumber,
      });
      const analysisWithEmbeddings = await embedCaptureAnalysis(openai, job, analysis);

      logAnalysisEvent("info", {
        event: "stage.completed",
        stage: "embed",
        jobId: job.jobId,
        captureId: job.captureId,
        attemptNumber: job.attemptNumber,
        durationMs: Math.round(performance.now() - embeddingStartedAt),
      });

      const persistStartedAt = performance.now();
      logAnalysisEvent("info", {
        event: "stage.started",
        stage: "persist",
        jobId: job.jobId,
        captureId: job.captureId,
        attemptNumber: job.attemptNumber,
      });
      await persistAnalysisResult(
        supabase,
        job,
        workerId,
        analysisWithEmbeddings,
        score,
      );

      logAnalysisEvent("info", {
        event: "stage.completed",
        stage: "persist",
        jobId: job.jobId,
        captureId: job.captureId,
        attemptNumber: job.attemptNumber,
        durationMs: Math.round(performance.now() - persistStartedAt),
      });

      if (score.reviewRequired) results.needsReview += 1;
      else results.completed += 1;
      results.status = score.reviewRequired ? "needs_review" : "completed";

      logAnalysisEvent("info", {
        event: "job.completed",
        stage: "complete",
        jobId: job.jobId,
        captureId: job.captureId,
        workspaceId: job.workspaceId,
        attemptNumber: job.attemptNumber,
        durationMs: Math.round(performance.now() - jobStartedAt),
        outcome: score.reviewRequired ? "needs_review" : "completed",
      });
    } catch (error) {
      const errorCode = analysisErrorCode(error);
      results.failed += 1;
      results.errorCodes.push(errorCode);
      const failure = await failAnalysisJob(
        supabase,
        job,
        workerId,
        errorCode,
      );
      results.status = failure.status;

      logAnalysisEvent("error", {
        event: "job.failed",
        stage: "failure",
        jobId: job.jobId,
        captureId: job.captureId,
        workspaceId: job.workspaceId,
        attemptNumber: job.attemptNumber,
        durationMs: Math.round(performance.now() - jobStartedAt),
        errorCode: failure.recorded
          ? errorCode
          : "ANALYSIS_FAILURE_PERSIST_FAILED",
        outcome: failure.recorded ? "retryable" : "unrecorded",
      });

      if (options.rethrowFailures) {
        throw new CaptureAnalysisRunError(
          failure.recorded ? errorCode : "ANALYSIS_FAILURE_PERSIST_FAILED",
          job.jobId,
          failure.status === "failed",
        );
      }
    }
  }

  return results;
}

export async function runCaptureAnalysisJob(
  jobId: string,
  options: Omit<CaptureAnalysisRunOptions, "jobId"> = {},
) {
  return runCaptureAnalysisBatch(1, {
    ...options,
    jobId,
  });
}
