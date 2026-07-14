import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));

type QueryResult = { data: unknown; error: { code?: string } | null };

function query(result: QueryResult) {
  const builder = {
    delete: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    insert: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
    update: vi.fn(),
  };

  for (const key of ["delete", "eq", "in", "insert", "select", "update"] as const) {
    builder[key].mockReturnValue(builder);
  }

  return builder;
}

const workspaceId = "11111111-1111-4111-8111-111111111111";
const userId = "44444444-4444-4444-8444-444444444444";

describe("graph mutation DAL authorization", () => {
  let updateGraphNodeRecord: typeof import("@/features/graph-mutations/server/dal")["updateGraphNodeRecord"];
  let createGraphEdgeRecord: typeof import("@/features/graph-mutations/server/dal")["createGraphEdgeRecord"];

  beforeAll(async () => {
    ({ updateGraphNodeRecord, createGraphEdgeRecord } = await import(
      "@/features/graph-mutations/server/dal"
    ));
  });

  it("rejects viewer node mutation before issuing an update", async () => {
    const existingNode = query({
      data: {
        id: "22222222-2222-4222-8222-222222222222",
        workspace_id: workspaceId,
        title: "Node",
        summary: null,
        metadata: {},
        updated_at: "2026-07-14T00:00:00.000Z",
      },
      error: null,
    });
    const membership = query({ data: { role: "viewer" }, error: null });
    const serviceFrom = vi.fn().mockReturnValue(existingNode);
    const actorFrom = vi.fn().mockReturnValue(membership);

    await expect(
      updateGraphNodeRecord(
        {
          actor: { from: actorFrom } as unknown as SupabaseClient<Database>,
          service: { from: serviceFrom } as unknown as SupabaseClient<Database>,
          userId,
        },
        "22222222-2222-4222-8222-222222222222",
        { title: "Blocked" },
      ),
    ).rejects.toMatchObject({
      code: "GRAPH_WRITE_FORBIDDEN",
      status: 403,
    });

    expect(serviceFrom).toHaveBeenCalledTimes(1);
  });

  it("rejects an edge whose nodes do not both belong to the requested workspace", async () => {
    const membership = query({ data: { role: "editor" }, error: null });
    const nodes = query({
      data: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          workspace_id: workspaceId,
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          workspace_id: "55555555-5555-4555-8555-555555555555",
        },
      ],
      error: null,
    });
    const serviceFrom = vi.fn().mockReturnValue(nodes);

    await expect(
      createGraphEdgeRecord(
        {
          actor: { from: vi.fn().mockReturnValue(membership) } as unknown as SupabaseClient<Database>,
          service: { from: serviceFrom } as unknown as SupabaseClient<Database>,
          userId,
        },
        {
          workspaceId,
          sourceNodeId: "22222222-2222-4222-8222-222222222222",
          targetNodeId: "33333333-3333-4333-8333-333333333333",
          kind: "supports",
        },
      ),
    ).rejects.toMatchObject({
      code: "GRAPH_RESOURCE_NOT_FOUND",
      status: 404,
    });

    expect(serviceFrom).toHaveBeenCalledTimes(1);
  });
});
