import { describe, expect, it } from "vitest";
import { connectionCandidatesForNode } from "@/features/graph-mutations/model/connection-candidates";
import type {
  GraphEdge,
  GraphNode,
} from "@/features/knowledge-map/model/graph";

function node(id: string): GraphNode {
  return {
    id,
    title: id,
    eyebrow: "Node",
    summary: "",
    tone: "topic",
  };
}

describe("connectionCandidatesForNode", () => {
  it("excludes projection-only and already connected nodes", () => {
    const selectedId = "11111111-1111-4111-8111-111111111111";
    const linkedId = "22222222-2222-4222-8222-222222222222";
    const availableId = "33333333-3333-4333-8333-333333333333";
    const nodes = [
      node(selectedId),
      node(linkedId),
      node(availableId),
      node("projection:folder:folder-id"),
      node("projection:topic:topic-id"),
      node("projection:capture:capture-id"),
    ];
    const edges: GraphEdge[] = [
      {
        id: "edge-id",
        sourceNodeId: selectedId,
        targetNodeId: linkedId,
      },
    ];

    expect(connectionCandidatesForNode(nodes, edges, selectedId).map(({ id }) => id))
      .toEqual([availableId]);
  });

  it("returns an empty list when only read-model projections remain", () => {
    const selectedId = "11111111-1111-4111-8111-111111111111";

    expect(
      connectionCandidatesForNode(
        [node(selectedId), node("projection:folder:folder-id")],
        [],
        selectedId,
      ),
    ).toEqual([]);
  });
});
