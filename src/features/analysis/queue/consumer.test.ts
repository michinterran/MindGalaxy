import type { MessageMetadata } from "@vercel/queue";
import { describe, expect, it, vi } from "vitest";
import {
  ANALYSIS_QUEUE_REGISTRY,
  JOB_REGISTRY,
} from "@/config/registry";
import {
  captureAnalysisRetry,
  consumeCaptureAnalysisEvent,
} from "@/features/analysis/queue/consumer";
import { CaptureAnalysisRunError } from "@/features/analysis/worker/run-capture-analysis";

vi.mock("server-only", () => ({}));

const event = {
  schemaVersion: 1 as const,
  eventType: "capture.created" as const,
  processingJobId: "11111111-1111-4111-8111-111111111111",
  captureId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
  createdAt: "2026-07-15T00:00:00.000Z",
};

function metadata(deliveryCount: number): MessageMetadata {
  return {
    messageId: "queue-message-1",
    deliveryCount,
    createdAt: new Date("2026-07-15T00:00:00.000Z"),
    expiresAt: new Date("2026-07-16T00:00:00.000Z"),
    topicName: ANALYSIS_QUEUE_REGISTRY.topic,
    consumerGroup: "analyze-capture",
    region: "iad1",
  };
}

describe("consumeCaptureAnalysisEvent", () => {
  it("runs only the correlated job with the manual retry safety ceiling", async () => {
    const runner = vi.fn().mockResolvedValue({
      claimed: 1,
      completed: 1,
      needsReview: 0,
      failed: 0,
      jobIds: [event.processingJobId],
      errorCodes: [],
      disposition: "processed",
      status: "completed",
    });

    await consumeCaptureAnalysisEvent(event, metadata(1), runner);

    expect(runner).toHaveBeenCalledWith(event.processingJobId, {
      expectedCaptureId: event.captureId,
      expectedWorkspaceId: event.workspaceId,
      maxAttempts: JOB_REGISTRY.captureStructuring.maxManualAttempts,
      rethrowFailures: true,
    });
  });

  it("rejects malformed deliveries before any worker is claimed", async () => {
    const runner = vi.fn();

    await expect(
      consumeCaptureAnalysisEvent(
        { ...event, processingJobId: "not-a-uuid" },
        metadata(1),
        runner,
      ),
    ).rejects.toThrow("ANALYSIS_QUEUE_MESSAGE_INVALID");
    expect(runner).not.toHaveBeenCalled();
  });

  it("accepts the UTC offset timestamp returned by Supabase timestamptz", async () => {
    const runner = vi.fn().mockResolvedValue({
      claimed: 1,
      completed: 1,
      needsReview: 0,
      failed: 0,
      jobIds: [event.processingJobId],
      errorCodes: [],
      disposition: "processed",
      status: "completed",
    });

    await consumeCaptureAnalysisEvent(
      { ...event, createdAt: "2026-07-15T14:20:00+00:00" },
      metadata(1),
      runner,
    );

    expect(runner).toHaveBeenCalledOnce();
  });

  it("retries when the exact job is queued, delayed, or already running", async () => {
    const runner = vi.fn().mockResolvedValue({
      claimed: 0,
      completed: 0,
      needsReview: 0,
      failed: 0,
      jobIds: [],
      errorCodes: [],
      disposition: "pending",
      status: "queued",
    });

    await expect(
      consumeCaptureAnalysisEvent(event, metadata(1), runner),
    ).rejects.toThrow("ANALYSIS_JOB_NOT_READY");
  });

  it("acknowledges an idempotent redelivery only after the exact job is terminal", async () => {
    const runner = vi.fn().mockResolvedValue({
      claimed: 0,
      completed: 0,
      needsReview: 0,
      failed: 0,
      jobIds: [],
      errorCodes: [],
      disposition: "terminal",
      status: "completed",
    });

    await expect(
      consumeCaptureAnalysisEvent(event, metadata(2), runner),
    ).resolves.toBeUndefined();
  });

  it("keeps concurrent deliveries correlated to their own processing jobs", async () => {
    const secondEvent = {
      ...event,
      processingJobId: "44444444-4444-4444-8444-444444444444",
      captureId: "55555555-5555-4555-8555-555555555555",
    };
    const runner = vi.fn().mockResolvedValue({
      claimed: 1,
      completed: 1,
      needsReview: 0,
      failed: 0,
      jobIds: [],
      errorCodes: [],
      disposition: "processed",
      status: "completed",
    });

    await Promise.all([
      consumeCaptureAnalysisEvent(event, metadata(1), runner),
      consumeCaptureAnalysisEvent(secondEvent, metadata(1), runner),
    ]);

    expect(runner.mock.calls.map(([jobId]) => jobId)).toEqual([
      event.processingJobId,
      secondEvent.processingJobId,
    ]);
  });

  it("correlates a redelivery to the same job and accepts its terminal result", async () => {
    const runner = vi
      .fn()
      .mockResolvedValueOnce({
        claimed: 1,
        completed: 1,
        needsReview: 0,
        failed: 0,
        jobIds: [event.processingJobId],
        errorCodes: [],
        disposition: "processed",
        status: "completed",
      })
      .mockResolvedValueOnce({
        claimed: 0,
        completed: 0,
        needsReview: 0,
        failed: 0,
        jobIds: [],
        errorCodes: [],
        disposition: "terminal",
        status: "completed",
      });

    await consumeCaptureAnalysisEvent(event, metadata(1), runner);
    await consumeCaptureAnalysisEvent(event, metadata(2), runner);

    expect(runner.mock.calls.map(([jobId]) => jobId)).toEqual([
      event.processingJobId,
      event.processingJobId,
    ]);
  });
});

describe("captureAnalysisRetry", () => {
  it("uses bounded retry delays before the poison-message limit", () => {
    expect(
      captureAnalysisRetry(new Error("ANALYSIS_RUN_FAILED"), metadata(1)),
    ).toEqual({ afterSeconds: 60 });
    expect(
      captureAnalysisRetry(new Error("ANALYSIS_RUN_FAILED"), metadata(2)),
    ).toEqual({ afterSeconds: 120 });
  });

  it("acknowledges a correlated terminal failure", () => {
    expect(
      captureAnalysisRetry(
        new CaptureAnalysisRunError(
          "ANALYSIS_RUN_FAILED",
          event.processingJobId,
          true,
        ),
        metadata(1),
      ),
    ).toEqual({ acknowledge: true });
  });

  it("does not acknowledge a non-terminal correlated failure", () => {
    expect(
      captureAnalysisRetry(
        new CaptureAnalysisRunError(
          "ANALYSIS_RUN_FAILED",
          event.processingJobId,
          false,
        ),
        metadata(ANALYSIS_QUEUE_REGISTRY.poisonDeliveryThreshold),
      ),
    ).toEqual({ afterSeconds: 300 });
  });

  it("eventually acknowledges an invalid message that has no correlated job", () => {
    expect(
      captureAnalysisRetry(
        new Error("ANALYSIS_QUEUE_MESSAGE_INVALID"),
        metadata(ANALYSIS_QUEUE_REGISTRY.poisonDeliveryThreshold - 1),
      ),
    ).toEqual({ afterSeconds: 300 });

    expect(
      captureAnalysisRetry(
        new Error("ANALYSIS_QUEUE_MESSAGE_INVALID"),
        metadata(ANALYSIS_QUEUE_REGISTRY.poisonDeliveryThreshold),
      ),
    ).toEqual({ acknowledge: true });
  });
});
