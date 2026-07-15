import { describe, expect, it } from "vitest";
import { ANALYSIS_QUEUE_REGISTRY } from "@/config/registry";
import {
  buildAnalysisReconnectIdempotencyKey,
  canReconnectQueuedJob,
  queuedJobReconnectAvailableAt,
} from "@/features/analysis/queue/reconnect-policy";

const updatedAt = "2026-07-15T00:00:00.000Z";
const staleAfterMs = ANALYSIS_QUEUE_REGISTRY.reconnectAfterSeconds * 1_000;

describe("queued analysis reconnect policy", () => {
  it("requires queued state and a full stale interval", () => {
    const availableAt = Date.parse(updatedAt) + staleAfterMs;

    expect(
      canReconnectQueuedJob({ status: "queued", updatedAt }, availableAt - 1),
    ).toBe(false);
    expect(
      canReconnectQueuedJob({ status: "queued", updatedAt }, availableAt),
    ).toBe(true);
    expect(
      canReconnectQueuedJob({ status: "running", updatedAt }, availableAt),
    ).toBe(false);
  });

  it("uses next_run_at as the later activity boundary", () => {
    const nextRunAt = "2026-07-15T00:05:00.000Z";
    expect(
      queuedJobReconnectAvailableAt({
        status: "queued",
        updatedAt,
        nextRunAt,
      }),
    ).toBe(Date.parse(nextRunAt) + staleAfterMs);
  });

  it("keeps repeated clicks on one job generation on the same non-initial key", () => {
    const first = buildAnalysisReconnectIdempotencyKey("job-id", updatedAt);
    const muchLater = buildAnalysisReconnectIdempotencyKey("job-id", updatedAt);

    expect(first).toBe(muchLater);
    expect(first).toBe(
      `capture-analysis:job-id:reconnect:v1:${Date.parse(updatedAt)}`,
    );
    expect(first).not.toBe("capture-analysis:job-id");
  });
});
