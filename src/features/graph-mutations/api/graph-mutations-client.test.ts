import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGraphEdge,
  deleteGraphEdge,
  GraphMutationClientError,
  updateGraphNode,
} from "@/features/graph-mutations/api/graph-mutations-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("graph mutation client", () => {
  it("PATCHes node content and position as JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        node: {
          id: "node-id",
          workspaceId: "workspace-id",
          title: "Updated",
          summary: null,
          position: { x: 10, y: 20 },
          updatedAt: "2026-07-14T00:00:00.000Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await updateGraphNode("node-id", {
      title: "Updated",
      position: { x: 10, y: 20 },
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/graph/nodes/node-id", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Updated",
        position: { x: 10, y: 20 },
      }),
    });
  });

  it("returns cleanly for 204 edge deletes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteGraphEdge("edge-id")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/graph/edges/edge-id", {
      method: "DELETE",
      headers: undefined,
    });
  });

  it("preserves API error code, status, and validation details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { error: "VALIDATION_ERROR", details: [{ path: "kind" }] },
          { status: 400 },
        ),
      ),
    );

    await expect(
      createGraphEdge({
        workspaceId: "workspace-id",
        sourceNodeId: "source-id",
        targetNodeId: "target-id",
        kind: "supports",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
      details: [{ path: "kind" }],
    } satisfies Partial<GraphMutationClientError>);
  });
});
