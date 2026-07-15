import { describe, expect, it, vi } from "vitest";
import { ANALYSIS_QUEUE_REGISTRY } from "@/config/registry";
import { dispatchCaptureAnalysis } from "@/features/analysis/queue/dispatch";

const event = {
  schemaVersion: 1 as const,
  eventType: "capture.created" as const,
  processingJobId: "11111111-1111-4111-8111-111111111111",
  captureId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
  createdAt: "2026-07-15T00:00:00.000Z",
};

describe("dispatchCaptureAnalysis", () => {
  it("publishes an idempotent durable queue message", async () => {
    const sender = vi.fn().mockResolvedValue({ messageId: "queue-message-1" });

    await expect(dispatchCaptureAnalysis(event, sender)).resolves.toEqual({
      transport: "queue",
      messageId: "queue-message-1",
    });
    expect(sender).toHaveBeenCalledWith(
      ANALYSIS_QUEUE_REGISTRY.topic,
      event,
      expect.objectContaining({
        idempotencyKey: `capture-analysis:${event.processingJobId}`,
        retentionSeconds: ANALYSIS_QUEUE_REGISTRY.retentionSeconds,
      }),
    );
  });

  it("selects the request-lifetime fallback when queue publishing fails", async () => {
    const sender = vi.fn().mockRejectedValue(new Error("queue unavailable"));

    await expect(dispatchCaptureAnalysis(event, sender)).resolves.toEqual({
      transport: "fallback",
      errorCode: "ANALYSIS_UNEXPECTED_ERROR",
    });
  });

  it("supports a retry-specific idempotency key for the same processing job", async () => {
    const sender = vi.fn().mockResolvedValue({ messageId: "retry-message-1" });
    const idempotencyKey = `capture-analysis:${event.processingJobId}:retry:2`;

    await dispatchCaptureAnalysis(event, sender, { idempotencyKey });

    expect(sender).toHaveBeenCalledWith(
      ANALYSIS_QUEUE_REGISTRY.topic,
      event,
      expect.objectContaining({ idempotencyKey }),
    );
  });

  it("canonicalizes Supabase timestamptz offsets before publishing", async () => {
    const sender = vi.fn().mockResolvedValue({ messageId: "queue-message-2" });

    await dispatchCaptureAnalysis(
      { ...event, createdAt: "2026-07-15T14:20:00+00:00" },
      sender,
    );

    expect(sender).toHaveBeenCalledWith(
      ANALYSIS_QUEUE_REGISTRY.topic,
      expect.objectContaining({ createdAt: "2026-07-15T14:20:00.000Z" }),
      expect.any(Object),
    );
  });
});
