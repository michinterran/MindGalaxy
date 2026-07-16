import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { JOB_REGISTRY } from "@/config/registry";
import {
  drainAnalysisOutbox,
  drainAnalysisOutboxForJob,
  runCorrelatedAnalysisFallback,
} from "@/features/analysis/queue/outbox";
import { runCaptureAnalysisJob } from "@/features/analysis/worker/run-capture-analysis";
import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));
vi.mock("@/features/analysis/worker/run-capture-analysis", () => ({
  runCaptureAnalysisJob: vi.fn(),
}));

const row = {
  event_id: "11111111-1111-4111-8111-111111111111",
  workspace_id: "22222222-2222-4222-8222-222222222222",
  aggregate_id: "33333333-3333-4333-8333-333333333333",
  event_type: "capture.created",
  dedupe_key: "capture.created:request-1",
  payload: {
    processingJobId: "44444444-4444-4444-8444-444444444444",
    captureId: "33333333-3333-4333-8333-333333333333",
    workspaceId: "22222222-2222-4222-8222-222222222222",
  },
  attempts: 1,
  created_at: "2026-07-16T00:00:00.000Z",
};

function client(
  responses: Record<string, { data: unknown; error: unknown }>,
) {
  const rpc = vi.fn((name: string) =>
    Promise.resolve(responses[name] ?? { data: null, error: null }),
  );
  const supabase = {
    rpc,
  } as unknown as SupabaseClient<Database>;

  return { supabase, rpc };
}

describe("drainAnalysisOutbox", () => {
  it("claims, publishes, and confirms an outbox event", async () => {
    const { supabase, rpc } = client({
      claim_analysis_outbox_events: { data: [row], error: null },
      mark_analysis_outbox_published: { data: true, error: null },
    });
    const dispatcher = vi.fn().mockResolvedValue({
      transport: "queue",
      messageId: "message-1",
    });

    const result = await drainAnalysisOutbox(1, {
      supabase,
      dispatcher,
      workerId: "outbox-test",
    });

    expect(result).toMatchObject({ claimed: 1, published: 1, retried: 0 });
    expect(dispatcher).toHaveBeenCalledWith(
      expect.objectContaining({ processingJobId: row.payload.processingJobId }),
      undefined,
      { idempotencyKey: row.dedupe_key },
    );
    expect(rpc).toHaveBeenCalledWith(
      "mark_analysis_outbox_published",
      expect.objectContaining({ p_event_id: row.event_id }),
    );
  });

  it("returns a failed publication to pending with backoff", async () => {
    const { supabase, rpc } = client({
      claim_analysis_outbox_events: { data: [row], error: null },
      fail_analysis_outbox_event: {
        data: [{ status: "pending", attempts: 1, available_at: row.created_at }],
        error: null,
      },
    });

    const result = await drainAnalysisOutbox(1, {
      supabase,
      dispatcher: vi.fn().mockResolvedValue({
        transport: "fallback",
        errorCode: "QUEUE_UNAVAILABLE",
      }),
      workerId: "outbox-test",
    });

    expect(result).toMatchObject({ claimed: 1, published: 0, retried: 1 });
    expect(rpc).toHaveBeenCalledWith(
      "fail_analysis_outbox_event",
      expect.objectContaining({ p_error_code: "QUEUE_UNAVAILABLE" }),
    );
  });

  it("claims the newly-created job directly instead of an older generic row", async () => {
    const { supabase, rpc } = client({
      claim_analysis_outbox_event_by_job_id: { data: [row], error: null },
      mark_analysis_outbox_published: { data: true, error: null },
    });

    const result = await drainAnalysisOutboxForJob(
      row.payload.processingJobId,
      {
        supabase,
        dispatcher: vi.fn().mockResolvedValue({
          transport: "queue",
          messageId: "message-1",
        }),
        workerId: "outbox-test",
      },
    );

    expect(result.published).toBe(1);
    expect(rpc).toHaveBeenCalledWith(
      "claim_analysis_outbox_event_by_job_id",
      expect.objectContaining({
        p_processing_job_id: row.payload.processingJobId,
      }),
    );
    expect(rpc).not.toHaveBeenCalledWith(
      "claim_analysis_outbox_events",
      expect.anything(),
    );
  });

  it("activates the exact job directly when queue publication is unavailable", async () => {
    const { supabase, rpc } = client({
      claim_analysis_outbox_event_by_job_id: { data: [row], error: null },
      mark_analysis_outbox_published: { data: true, error: null },
    });
    vi.mocked(runCaptureAnalysisJob).mockResolvedValue({
      claimed: 1,
      completed: 1,
      needsReview: 0,
      failed: 0,
      jobIds: [row.payload.processingJobId],
      errorCodes: [],
      disposition: "processed",
      status: "completed",
    });

    const result = await drainAnalysisOutboxForJob(
      row.payload.processingJobId,
      {
        supabase,
        dispatcher: vi.fn().mockResolvedValue({
          transport: "fallback",
          errorCode: "QUEUE_UNAVAILABLE",
        }),
        workerId: "outbox-test",
      },
    );

    expect(result).toMatchObject({ published: 1, retried: 0, failed: 0 });
    expect(runCaptureAnalysisJob).toHaveBeenCalledWith(
      row.payload.processingJobId,
      expect.objectContaining({
        expectedCaptureId: row.payload.captureId,
        expectedWorkspaceId: row.payload.workspaceId,
        rethrowFailures: true,
      }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "mark_analysis_outbox_published",
      expect.objectContaining({ p_message_id: null }),
    );
    expect(rpc).not.toHaveBeenCalledWith(
      "fail_analysis_outbox_event",
      expect.anything(),
    );
  });
});

describe("runCorrelatedAnalysisFallback", () => {
  it("runs only the correlated job with bounded attempts and rethrown failures", async () => {
    const runner = vi.fn().mockResolvedValue({
      disposition: "processed",
      status: "completed",
    });

    await expect(
      runCorrelatedAnalysisFallback(
        {
          schemaVersion: 1,
          eventType: "capture.created",
          processingJobId: row.payload.processingJobId,
          captureId: row.payload.captureId,
          workspaceId: row.payload.workspaceId,
          createdAt: row.created_at,
        },
        runner,
      ),
    ).resolves.toBe(true);
    expect(runner).toHaveBeenCalledWith(row.payload.processingJobId, {
      expectedCaptureId: row.payload.captureId,
      expectedWorkspaceId: row.payload.workspaceId,
      maxAttempts: JOB_REGISTRY.captureStructuring.maxManualAttempts,
      rethrowFailures: true,
    });
  });

  it("does not complete the outbox event while the exact job is pending", async () => {
    const runner = vi.fn().mockResolvedValue({
      disposition: "pending",
      status: "queued",
    });

    await expect(
      runCorrelatedAnalysisFallback(
        {
          schemaVersion: 1,
          eventType: "capture.created",
          processingJobId: row.payload.processingJobId,
          captureId: row.payload.captureId,
          workspaceId: row.payload.workspaceId,
          createdAt: row.created_at,
        },
        runner,
      ),
    ).resolves.toBe(false);
  });

  it("propagates a fallback analysis failure so the outbox remains retryable", async () => {
    const runner = vi.fn().mockRejectedValue(new Error("ANALYSIS_FAILED"));

    await expect(
      runCorrelatedAnalysisFallback(
        {
          schemaVersion: 1,
          eventType: "capture.created",
          processingJobId: row.payload.processingJobId,
          captureId: row.payload.captureId,
          workspaceId: row.payload.workspaceId,
          createdAt: row.created_at,
        },
        runner,
      ),
    ).rejects.toThrow("ANALYSIS_FAILED");
  });
});
