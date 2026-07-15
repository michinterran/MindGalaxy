import type { MessageMetadata, RetryDirective } from "@vercel/queue";
import {
  ANALYSIS_QUEUE_REGISTRY,
  JOB_REGISTRY,
} from "@/config/registry";
import {
  analysisErrorCode,
  logAnalysisEvent,
} from "@/features/analysis/observability";
import {
  captureAnalysisEventSchema,
} from "@/features/analysis/queue/contracts";
import {
  CaptureAnalysisRunError,
  runCaptureAnalysisJob,
} from "@/features/analysis/worker/run-capture-analysis";

type AnalysisRunner = typeof runCaptureAnalysisJob;

export async function consumeCaptureAnalysisEvent(
  message: unknown,
  metadata: MessageMetadata,
  runner: AnalysisRunner = runCaptureAnalysisJob,
) {
  const parsed = captureAnalysisEventSchema.safeParse(message);

  if (!parsed.success) {
    throw new Error("ANALYSIS_QUEUE_MESSAGE_INVALID");
  }

  const startedAt = performance.now();
  logAnalysisEvent("info", {
    event: "queue.received",
    stage: "consume",
    jobId: parsed.data.processingJobId,
    captureId: parsed.data.captureId,
    workspaceId: parsed.data.workspaceId,
    queueMessageId: metadata.messageId,
    deliveryCount: metadata.deliveryCount,
    outcome: "started",
  });

  const result = await runner(parsed.data.processingJobId, {
    expectedCaptureId: parsed.data.captureId,
    expectedWorkspaceId: parsed.data.workspaceId,
    maxAttempts: JOB_REGISTRY.captureStructuring.maxAttempts,
    rethrowFailures: true,
  });

  if (result.disposition === "pending") {
    throw new Error("ANALYSIS_JOB_NOT_READY");
  }

  logAnalysisEvent("info", {
    event: "queue.consumed",
    stage: "consume",
    jobId: parsed.data.processingJobId,
    captureId: parsed.data.captureId,
    workspaceId: parsed.data.workspaceId,
    queueMessageId: metadata.messageId,
    deliveryCount: metadata.deliveryCount,
    durationMs: Math.round(performance.now() - startedAt),
    outcome:
      result.disposition === "terminal"
        ? "idempotent_terminal"
        : "completed",
  });
}

export function captureAnalysisRetry(
  error: unknown,
  metadata: MessageMetadata,
): RetryDirective {
  const errorCode = analysisErrorCode(error);

  const invalidMessage =
    error instanceof Error &&
    error.message === "ANALYSIS_QUEUE_MESSAGE_INVALID";
  const terminalFailure =
    error instanceof CaptureAnalysisRunError && error.terminal;

  if (
    terminalFailure ||
    (invalidMessage &&
      metadata.deliveryCount >= ANALYSIS_QUEUE_REGISTRY.maxDeliveries)
  ) {
    logAnalysisEvent("error", {
      event: "queue.poison_message_acknowledged",
      stage: "retry",
      queueMessageId: metadata.messageId,
      deliveryCount: metadata.deliveryCount,
      errorCode,
      outcome: "acknowledged",
    });

    return { acknowledge: true };
  }

  const afterSeconds =
    Math.min(
      300,
      JOB_REGISTRY.captureStructuring.retryBaseDelaySeconds *
        Math.max(1, metadata.deliveryCount),
    );

  if (metadata.deliveryCount >= ANALYSIS_QUEUE_REGISTRY.maxDeliveries) {
    logAnalysisEvent("error", {
      event: "queue.delivery_budget_exhausted_nonterminal",
      stage: "retry",
      queueMessageId: metadata.messageId,
      deliveryCount: metadata.deliveryCount,
      errorCode,
      outcome: "operator_recovery_required",
    });
  }

  logAnalysisEvent("warn", {
    event: "queue.retry_scheduled",
    stage: "retry",
    queueMessageId: metadata.messageId,
    deliveryCount: metadata.deliveryCount,
    errorCode,
    outcome: `retry_in_${afterSeconds}s`,
  });

  return { afterSeconds };
}
