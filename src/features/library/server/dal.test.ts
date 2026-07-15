import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));

function query(data: unknown, error: unknown = null) {
  const builder = {
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    select: vi.fn(),
    update: vi.fn(),
  };
  for (const method of ["eq", "select", "update"] as const) {
    builder[method].mockReturnValue(builder);
  }
  return builder;
}

const captureId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const capture = {
  id: captureId,
  workspace_id: workspaceId,
  project_id: null,
  title: "Capture",
  raw_text: "Source",
  source_kind: "paste",
  created_at: "2026-07-14T00:00:00.000Z",
  updated_at: "2026-07-14T00:00:00.000Z",
};

describe("library DAL authorization", () => {
  let updateCaptureTitleRecord: typeof import("@/features/library/server/dal")["updateCaptureTitleRecord"];
  let deleteCaptureRecord: typeof import("@/features/library/server/dal")["deleteCaptureRecord"];
  let getReconnectableProcessingJobRecord: typeof import("@/features/library/server/dal")["getReconnectableProcessingJobRecord"];

  beforeAll(async () => {
    ({
      updateCaptureTitleRecord,
      deleteCaptureRecord,
      getReconnectableProcessingJobRecord,
    } = await import(
      "@/features/library/server/dal"
    ));
  });

  it("does not let a viewer update a capture", async () => {
    const serviceFrom = vi.fn().mockReturnValue(query(capture));
    const actorFrom = vi.fn().mockReturnValue(query({ role: "viewer" }));

    await expect(
      updateCaptureTitleRecord(
        {
          actor: { from: actorFrom } as unknown as SupabaseClient<Database>,
          service: { from: serviceFrom } as unknown as SupabaseClient<Database>,
          userId,
        },
        captureId,
        { title: "Blocked" },
      ),
    ).rejects.toMatchObject({ code: "LIBRARY_WRITE_FORBIDDEN", status: 403 });

    expect(serviceFrom).toHaveBeenCalledTimes(1);
  });

  it("keeps capture deletion owner-only before calling the lifecycle RPC", async () => {
    const rpc = vi.fn();
    const serviceFrom = vi.fn().mockReturnValue(query(capture));
    const actorFrom = vi.fn().mockReturnValue(query({ role: "editor" }));

    await expect(
      deleteCaptureRecord(
        {
          actor: { from: actorFrom } as unknown as SupabaseClient<Database>,
          service: {
            from: serviceFrom,
            rpc,
          } as unknown as SupabaseClient<Database>,
          userId,
        },
        captureId,
      ),
    ).rejects.toMatchObject({ code: "LIBRARY_WRITE_FORBIDDEN", status: 403 });

    expect(rpc).not.toHaveBeenCalled();
  });

  it("authorizes an editor and returns a stale queued job without mutating lifecycle state", async () => {
    const rpc = vi.fn();
    const job = {
      id: "44444444-4444-4444-8444-444444444444",
      capture_id: captureId,
      workspace_id: workspaceId,
      status: "queued",
      retry_count: 0,
      max_attempts: 3,
      next_run_at: "2026-07-14T00:00:00.000Z",
      updated_at: "2026-07-14T00:00:00.000Z",
    };
    const serviceFrom = vi
      .fn()
      .mockReturnValueOnce(query(job))
      .mockReturnValueOnce(query(capture));
    const actorFrom = vi.fn().mockReturnValue(query({ role: "editor" }));

    await expect(
      getReconnectableProcessingJobRecord(
        {
          actor: { from: actorFrom } as unknown as SupabaseClient<Database>,
          service: {
            from: serviceFrom,
            rpc,
          } as unknown as SupabaseClient<Database>,
          userId,
        },
        job.id,
        Date.parse("2026-07-14T01:00:00.000Z"),
      ),
    ).resolves.toMatchObject({
      processingJob: {
        id: job.id,
        status: "queued",
        retryCount: 0,
        maxAttempts: 3,
      },
    });

    expect(rpc).not.toHaveBeenCalled();
    expect(serviceFrom).toHaveBeenCalledTimes(2);
  });

  it("rejects viewers and fresh queued jobs", async () => {
    const job = {
      id: "44444444-4444-4444-8444-444444444444",
      capture_id: captureId,
      workspace_id: workspaceId,
      status: "queued",
      retry_count: 0,
      max_attempts: 3,
      next_run_at: "2026-07-14T00:00:00.000Z",
      updated_at: "2026-07-14T00:00:00.000Z",
    };
    const viewerServiceFrom = vi
      .fn()
      .mockReturnValueOnce(query(job))
      .mockReturnValueOnce(query(capture));

    await expect(
      getReconnectableProcessingJobRecord(
        {
          actor: {
            from: vi.fn().mockReturnValue(query({ role: "viewer" })),
          } as unknown as SupabaseClient<Database>,
          service: {
            from: viewerServiceFrom,
          } as unknown as SupabaseClient<Database>,
          userId,
        },
        job.id,
        Date.parse("2026-07-14T01:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: "LIBRARY_WRITE_FORBIDDEN", status: 403 });

    const freshServiceFrom = vi
      .fn()
      .mockReturnValueOnce(query(job))
      .mockReturnValueOnce(query(capture));
    await expect(
      getReconnectableProcessingJobRecord(
        {
          actor: {
            from: vi.fn().mockReturnValue(query({ role: "owner" })),
          } as unknown as SupabaseClient<Database>,
          service: {
            from: freshServiceFrom,
          } as unknown as SupabaseClient<Database>,
          userId,
        },
        job.id,
        Date.parse("2026-07-14T00:05:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: "PROCESSING_JOB_NOT_STALE", status: 409 });
  });
});
