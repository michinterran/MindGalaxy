import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));

function query(data: unknown, error: { code?: string } | null = null) {
  const result = { data, error };
  const builder = {
    eq: vi.fn(),
    in: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
    neq: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
  };
  for (const method of ["eq", "in", "neq", "order", "select"] as const) {
    builder[method].mockReturnValue(builder);
  }
  return builder;
}

const workspaceId = "11111111-1111-4111-8111-111111111111";
const folderId = "22222222-2222-4222-8222-222222222222";
const childFolderId = "33333333-3333-4333-8333-333333333333";
const captureId = "44444444-4444-4444-8444-444444444444";
const sourceNodeId = "55555555-5555-4555-8555-555555555555";
const topicId = "66666666-6666-4666-8666-666666666666";
const claimNodeId = "77777777-7777-4777-8777-777777777777";

describe("loadWorkspaceGraph organization projection", () => {
  let loadWorkspaceGraph: typeof import("@/features/knowledge-map/server/load-workspace-graph")["loadWorkspaceGraph"];

  beforeAll(async () => {
    ({ loadWorkspaceGraph } = await import(
      "@/features/knowledge-map/server/load-workspace-graph"
    ));
  });

  it("projects folders and folder-to-material relations without persisting ontology rows", async () => {
    const from = vi.fn((table: string) => {
      if (table === "nodes") {
        return query([
          {
            id: sourceNodeId,
            capture_id: captureId,
            kind: "source_summary",
            title: "Source",
            summary: "Summary",
            evidence_snippet: null,
            confidence: 0.9,
            metadata: {},
            created_at: "2026-07-16T00:00:00.000Z",
          },
        ]);
      }
      if (table === "folders") {
        return query([
          {
            id: folderId,
            parent_id: null,
            name: "Research",
            sort_order: 0,
            created_at: "2026-07-16T00:00:00.000Z",
          },
          {
            id: childFolderId,
            parent_id: folderId,
            name: "AI",
            sort_order: 0,
            created_at: "2026-07-16T00:00:00.000Z",
          },
        ]);
      }
      if (table === "captures") {
        return query([
          {
            id: captureId,
            folder_id: childFolderId,
            title: "Captured answer",
            raw_text: "Original answer",
            source_kind: "paste",
            created_at: "2026-07-16T00:00:00.000Z",
          },
        ]);
      }
      return query([]);
    });

    const graph = await loadWorkspaceGraph(
      { from } as unknown as SupabaseClient<Database>,
      workspaceId,
      "ko",
    );

    expect(graph?.nodes.filter((node) => node.nodeKind === "folder")).toHaveLength(2);
    expect(graph?.nodes.filter((node) => node.nodeKind === "source")).toHaveLength(0);
    expect(graph?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: sourceNodeId,
          nodeKind: "source_summary",
          captureId,
          captureCreatedAt: "2026-07-16T00:00:00.000Z",
        }),
      ]),
    );
    expect(graph?.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceNodeId: `projection:folder:${folderId}`,
          targetNodeId: `projection:folder:${childFolderId}`,
          kind: "contains",
          origin: "system",
        }),
        expect.objectContaining({
          sourceNodeId: `projection:folder:${childFolderId}`,
          targetNodeId: sourceNodeId,
          captureId,
          kind: "contains",
          origin: "system",
        }),
      ]),
    );
  });

  it("shows a saved capture as a material before AI nodes exist", async () => {
    const captureQuery = query([
      {
        id: captureId,
        folder_id: folderId,
        title: null,
        source_kind: "paste",
        created_at: "2026-07-16T00:00:00.000Z",
      },
    ]);
    const from = vi.fn((table: string) => {
      if (table === "nodes" || table === "edges") return query([]);
      if (table === "folders") {
        return query([
          {
            id: folderId,
            parent_id: null,
            name: "Inbox",
            sort_order: 0,
            created_at: "2026-07-16T00:00:00.000Z",
          },
        ]);
      }
      if (table === "captures") return captureQuery;
      return query([]);
    });

    const graph = await loadWorkspaceGraph(
      { from } as unknown as SupabaseClient<Database>,
      workspaceId,
      "en",
    );

    expect(graph?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeKind: "folder" }),
        expect.objectContaining({
          nodeKind: "source",
          title: "Untitled material",
          captureId,
          captureCreatedAt: "2026-07-16T00:00:00.000Z",
        }),
      ]),
    );
    expect(graph?.edges).toHaveLength(1);
    expect(captureQuery.select).toHaveBeenCalledWith(
      "id, folder_id, title, source_kind, created_at",
    );
  });

  it("projects manual topics onto their recent material without loading source text", async () => {
    const from = vi.fn((table: string) => {
      if (table === "captures") {
        return query([
          {
            id: captureId,
            folder_id: null,
            title: "Captured answer",
            source_kind: "paste",
            created_at: "2026-07-16T00:00:00.000Z",
          },
        ]);
      }
      if (table === "nodes") {
        return query([
          {
            id: sourceNodeId,
            capture_id: captureId,
            kind: "source_summary",
            title: "Source",
            summary: "Summary",
            evidence_snippet: null,
            confidence: 0.9,
            metadata: {},
            created_at: "2026-07-16T00:00:01.000Z",
          },
        ]);
      }
      if (table === "contexts") {
        return query([
          {
            id: topicId,
            label: "Generative AI",
            normalized_value: "generative ai",
            created_at: "2026-07-16T00:00:00.000Z",
          },
        ]);
      }
      if (table === "capture_topics") {
        return query([{ capture_id: captureId, topic_context_id: topicId }]);
      }
      return query([]);
    });

    const graph = await loadWorkspaceGraph(
      { from } as unknown as SupabaseClient<Database>,
      workspaceId,
      "en",
    );

    expect(graph?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `projection:topic:${topicId}`,
          nodeKind: "topic",
          title: "Generative AI",
        }),
      ]),
    );
    expect(graph?.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceNodeId: `projection:topic:${topicId}`,
          targetNodeId: sourceNodeId,
          captureId,
          kind: "relates_to",
          origin: "system",
        }),
      ]),
    );
  });

  it("retains exact relationship semantics, evidence, confidence, and AI trace metadata", async () => {
    const edgeQuery = query([
      {
        id: "88888888-8888-4888-8888-888888888888",
        source_node_id: sourceNodeId,
        target_node_id: claimNodeId,
        kind: "supports",
        label: "Grounds",
        confidence: 0.87,
        evidence_snippet: "The source explicitly supports this claim.",
        metadata: {
          captureId,
          model: "gpt-test",
          processingJobId: "99999999-9999-4999-8999-999999999999",
          promptVersion: "v3",
        },
      },
    ]);
    const from = vi.fn((table: string) => {
      if (table === "captures") {
        return query([
          {
            id: captureId,
            folder_id: null,
            title: "Captured answer",
            source_kind: "paste",
            created_at: "2026-07-16T00:00:00.000Z",
          },
        ]);
      }
      if (table === "nodes") {
        return query([
          {
            id: sourceNodeId,
            capture_id: captureId,
            kind: "source_summary",
            title: "Source",
            summary: "Summary",
            evidence_snippet: null,
            confidence: 0.9,
            metadata: {},
            created_at: "2026-07-16T00:00:01.000Z",
          },
          {
            id: claimNodeId,
            capture_id: captureId,
            kind: "claim",
            title: "Claim",
            summary: "Claim summary",
            evidence_snippet: null,
            confidence: 0.87,
            metadata: {},
            created_at: "2026-07-16T00:00:02.000Z",
          },
        ]);
      }
      if (table === "edges") return edgeQuery;
      return query([]);
    });

    const graph = await loadWorkspaceGraph(
      { from } as unknown as SupabaseClient<Database>,
      workspaceId,
      "en",
    );

    expect(edgeQuery.select).toHaveBeenCalledWith(
      "id, source_node_id, target_node_id, kind, label, confidence, evidence_snippet, metadata",
    );
    expect(graph?.edges).toEqual([
      expect.objectContaining({
        kind: "supports",
        confidence: 0.87,
        evidenceSnippet: "The source explicitly supports this claim.",
        origin: "ai",
        captureId,
        model: "gpt-test",
        promptVersion: "v3",
        processingJobId: "99999999-9999-4999-8999-999999999999",
      }),
    ]);
  });
});
