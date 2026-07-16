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
  type CaptureAnalysisEvent,
} from "@/features/analysis/queue/contracts";
import { recordAnalysisOperatorRecovery } from "@/features/analysis/queue/outbox";
import {
  CaptureAnalysisRunError,
  runCaptureAnalysisJob,
} from "@/features/analysis/worker/run-capture-analysis";

type AnalysisRunner = typeof runCaptureAnalysisJob;
type OperatorRecovery = (
  event: CaptureAnalysisEvent,
  deliveryCount: number,
  errorCode: string,
) => Promise<boolean>;

async function recoverExhaustedDelivery(
  event: CaptureAnalysisEvent,
  metadata: MessageMetadata,
  errorCode: string,
  recovery: OperatorRecovery,
) {
  if (
    metadata.deliveryCount <
    ANALYSIS_QUEUE_REGISTRY.poisonDeliveryThreshold
  ) {
    return false;
  }

  const recorded = await recovery(event, metadata.deliveryCount, errorCode);

  if (recorded) {
    logAnalysisEvent("error", {
      event: "queue.delivery_budget_exhausted_recorded",
      stage: "consume",
      jobId: event.processingJobId,
      captureId: event.captureId,
      workspaceId: event.workspaceId,
      queueMessageId: metadata.messageId,
      deliveryCount: metadata.deliveryCount,
      errorCode,
      outcome: "operator_recovery_recorded",
    });
  }

  return recorded;
}

export async function consumeCaptureAnalysisEvent(
  message: unknown,
  metadata: MessageMetadata,
  runner: AnalysisRunner = runCaptureAnalysisJob,
  recovery: OperatorRecovery = recordAnalysisOperatorRecovery,
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

  let result: Awaited<ReturnType<AnalysisRunner>>;
  try {
    result = await runner(parsed.data.processingJobId, {
      expectedCaptureId: parsed.data.captureId,
      expectedWorkspaceId: parsed.data.workspaceId,
      maxAttempts: JOB_REGISTRY.captureStructuring.maxManualAttempts,
      rethrowFailures: true,
    });
  } catch (error) {
    const recorded = await recoverExhaustedDelivery(
      parsed.data,
      metadata,
      analysisErrorCode(error),
      recovery,
    );

    if (recorded) {
      return;
    }

    throw error;
  }

  if (result.disposition === "pending") {
    const recorded = await recoverExhaustedDelivery(
      parsed.data,
      metadata,
      "ANALYSIS_JOB_NOT_READY",
      recovery,
    );

    if (recorded) {
      return;
    }

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
      metadata.deliveryCount >=
        ANALYSIS_QUEUE_REGISTRY.poisonDeliveryThreshold)
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

  if (
    metadata.deliveryCount >=
    ANALYSIS_QUEUE_REGISTRY.poisonDeliveryThreshold
  ) {
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
