import { describe, expect, it } from "vitest";
import {
  buildKnowledgeGraphNetwork,
  directlyRelatedNodeIds,
  knowledgeGraphCategory,
} from "@/features/knowledge-map/components/knowledge-graph-network";
import type { GraphProjection } from "@/features/knowledge-map/model/graph";

function graphFixture(): GraphProjection {
  const nodes = Array.from({ length: 70 }, (_, index) => ({
    id: `node-${index}`,
    title: `Node ${index}`,
    eyebrow: index === 0 ? "Source" : "Topic",
    summary: `Summary ${index}`,
    tone: index === 0 ? ("source" as const) : ("topic" as const),
    nodeKind: index === 0 ? "source_summary" : "idea",
    position: { x: 0, y: 0 },
    galaxyPosition: [0, 0, 0] as [number, number, number],
    importance: index === 0 ? 1 : 0.5,
    degree: index === 0 ? 69 : 1,
    level: index === 0 ? 0 : 1,
  }));
  const edges = nodes.slice(1).map((node, index) => ({
    id: `edge-${index}`,
    sourceNodeId: "node-0",
    targetNodeId: node.id,
    tone: "topic" as const,
  }));

  return {
    snapshot: {
      id: "snapshot",
      source: "workspace",
      nodes,
      edges,
    },
    nodes,
    edges,
  };
}

describe("knowledge graph network", () => {
  it("maps current source and concept kinds into future-ready categories", () => {
    expect(knowledgeGraphCategory({ nodeKind: "source_summary", tone: "source" })).toBe(
      "material",
    );
    expect(knowledgeGraphCategory({ nodeKind: "folder", tone: "context" })).toBe(
      "folder",
    );
    expect(knowledgeGraphCategory({ nodeKind: "idea", tone: "topic" })).toBe(
      "concept",
    );
    expect(knowledgeGraphCategory({ nodeKind: "topic", tone: "topic" })).toBe(
      "concept",
    );
  });

  it("caps the default rendered network at fifty nodes", () => {
    const network = buildKnowledgeGraphNetwork(graphFixture());

    expect(network.nodes).toHaveLength(50);
    expect(network.totalEligibleNodeCount).toBe(70);
    expect(network.truncated).toBe(true);
  });

  it("prioritizes a focused node and preserves its direct relations", () => {
    const network = buildKnowledgeGraphNetwork(graphFixture(), {
      focusNodeId: "node-12",
    });

    expect(network.nodes[0]?.id).toBe("node-12");
    expect(network.focusNodeId).toBe("node-12");
    expect(directlyRelatedNodeIds(network.edges, "node-12")).toContain("node-0");
  });
});
