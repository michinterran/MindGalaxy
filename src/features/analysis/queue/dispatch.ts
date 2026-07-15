import {
  DuplicateMessageError,
  send,
  type SendResult,
} from "@vercel/queue";
import { ANALYSIS_QUEUE_REGISTRY } from "@/config/registry";
import {
  analysisErrorCode,
  logAnalysisEvent,
} from "@/features/analysis/observability";
import type { CaptureAnalysisEvent } from "@/features/analysis/queue/contracts";

type QueueSender = (
  topic: string,
  payload: CaptureAnalysisEvent,
  options: {
    idempotencyKey: string;
    retentionSeconds: number;
    headers: Record<string, string>;
  },
) => Promise<SendResult>;

export type CaptureAnalysisDispatchResult =
  | { transport: "queue"; messageId: string | null }
  | { transport: "fallback"; errorCode: string };

export async function dispatchCaptureAnalysis(
  event: CaptureAnalysisEvent,
  queueSender: QueueSender = send,
  options: { idempotencyKey?: string } = {},
): Promise<CaptureAnalysisDispatchResult> {
  const startedAt = performance.now();

  try {
    const normalizedEvent = {
      ...event,
      createdAt: new Date(event.createdAt).toISOString(),
    };
    const { messageId } = await queueSender(
      ANALYSIS_QUEUE_REGISTRY.topic,
      normalizedEvent,
      {
        idempotencyKey:
          options.idempotencyKey ??
          `capture-analysis:${event.processingJobId}`,
        retentionSeconds: ANALYSIS_QUEUE_REGISTRY.retentionSeconds,
        headers: {
          "x-mindgalaxy-event": event.eventType,
          "x-mindgalaxy-job-id": event.processingJobId,
        },
      },
    );

    logAnalysisEvent("info", {
      event: "queue.published",
      stage: "dispatch",
      jobId: event.processingJobId,
      captureId: event.captureId,
      workspaceId: event.workspaceId,
      queueMessageId: messageId,
      durationMs: Math.round(performance.now() - startedAt),
      outcome: "queued",
    });

    return { transport: "queue", messageId };
  } catch (error) {
    if (error instanceof DuplicateMessageError) {
      logAnalysisEvent("info", {
        event: "queue.deduplicated",
        stage: "dispatch",
        jobId: event.processingJobId,
        captureId: event.captureId,
        workspaceId: event.workspaceId,
        durationMs: Math.round(performance.now() - startedAt),
        outcome: "already_queued",
      });

      return { transport: "queue", messageId: null };
    }

    const errorCode = analysisErrorCode(error);

    logAnalysisEvent("warn", {
      event: "queue.publish_failed",
      stage: "dispatch",
      jobId: event.processingJobId,
      captureId: event.captureId,
      workspaceId: event.workspaceId,
      durationMs: Math.round(performance.now() - startedAt),
      errorCode,
      outcome: "after_fallback",
    });

    return { transport: "fallback", errorCode };
  }
}
