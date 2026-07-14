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

  beforeAll(async () => {
    ({ updateCaptureTitleRecord, deleteCaptureRecord } = await import(
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
});
