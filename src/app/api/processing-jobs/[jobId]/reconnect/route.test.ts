import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  dispatchCaptureAnalysis: vi.fn(),
  getReconnectableProcessingJobRecord: vi.fn(),
  requireLibraryClients: vi.fn(),
}));

vi.mock("@/features/analysis/queue/dispatch", () => ({
  dispatchCaptureAnalysis: mocks.dispatchCaptureAnalysis,
}));
vi.mock("@/features/library/server/dal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/library/server/dal")>()),
  getReconnectableProcessingJobRecord:
    mocks.getReconnectableProcessingJobRecord,
}));
vi.mock("@/features/library/server/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/library/server/http")>()),
  requireLibraryClients: mocks.requireLibraryClients,
}));

const jobId = "11111111-1111-4111-8111-111111111111";
const captureId = "22222222-2222-4222-8222-222222222222";
const workspaceId = "33333333-3333-4333-8333-333333333333";
const updatedAt = "2026-07-15T00:00:00.000Z";

describe("processing job reconnect route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireLibraryClients.mockResolvedValue({});
    mocks.getReconnectableProcessingJobRecord.mockResolvedValue({
      processingJob: {
        id: jobId,
        captureId,
        workspaceId,
        status: "queued",
        retryCount: 0,
        maxAttempts: 3,
        nextRunAt: updatedAt,
        updatedAt,
      },
    });
    mocks.dispatchCaptureAnalysis.mockResolvedValue({
      transport: "queue",
      messageId: "reconnect-message",
    });
  });

  it("re-publishes the authorized stale job without changing its lifecycle fields", async () => {
    const { POST } = await import(
      "@/app/api/processing-jobs/[jobId]/reconnect/route"
    );
    const response = await POST(new Request("http://localhost/reconnect"), {
      params: Promise.resolve({ jobId }),
    });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.processingJob).toMatchObject({
      id: jobId,
      status: "queued",
      retryCount: 0,
      maxAttempts: 3,
    });
    expect(mocks.dispatchCaptureAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ processingJobId: jobId, captureId, workspaceId }),
      undefined,
      {
        idempotencyKey: `capture-analysis:${jobId}:reconnect:v1:${Date.parse(updatedAt)}`,
      },
    );
  });

  it("preserves stale-policy errors as HTTP 409 responses", async () => {
    const { LibraryError } = await import("@/features/library/server/dal");
    mocks.getReconnectableProcessingJobRecord.mockRejectedValue(
      new LibraryError("PROCESSING_JOB_NOT_STALE", 409),
    );
    const { POST } = await import(
      "@/app/api/processing-jobs/[jobId]/reconnect/route"
    );
    const response = await POST(new Request("http://localhost/reconnect"), {
      params: Promise.resolve({ jobId }),
    });

    await expect(response.json()).resolves.toEqual({
      error: "PROCESSING_JOB_NOT_STALE",
    });
    expect(response.status).toBe(409);
    expect(mocks.dispatchCaptureAnalysis).not.toHaveBeenCalled();
  });
});
