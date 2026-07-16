import { describe, expect, it } from "vitest";
import {
  buildKnowledgeGraphNetwork,
  directlyRelatedNodeIds,
  knowledgeGraphCategory,
  knowledgeGraphSearchResetKey,
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

function chainGraphFixture(): GraphProjection {
  const nodes = Array.from({ length: 5 }, (_, index) => ({
    id: `chain-${index}`,
    title: `Chain ${index}`,
    eyebrow: "Topic",
    summary: `Summary ${index}`,
    tone: "topic" as const,
    nodeKind: "idea",
    position: { x: 0, y: 0 },
    galaxyPosition: [0, 0, 0] as [number, number, number],
    importance: 0.5,
    degree: index === 4 ? 0 : index === 0 || index === 3 ? 1 : 2,
    level: index,
  }));
  const edges = [0, 1, 2].map((index) => ({
    id: `chain-edge-${index}`,
    sourceNodeId: `chain-${index}`,
    targetNodeId: `chain-${index + 1}`,
    tone: "topic" as const,
  }));
  return {
    snapshot: { id: "chain", source: "workspace", nodes, edges },
    nodes,
    edges,
  };
}

function scopedGraphFixture(): GraphProjection {
  const node = (
    id: string,
    nodeKind: string,
    captureId?: string,
    captureCreatedAt?: string,
  ) => ({
    id,
    title: id,
    eyebrow: nodeKind,
    summary: id,
    tone: nodeKind === "source_summary" ? ("source" as const) : ("topic" as const),
    nodeKind,
    captureId,
    captureCreatedAt,
    position: { x: 0, y: 0 },
    galaxyPosition: [0, 0, 0] as [number, number, number],
    importance: 0.5,
    degree: 1,
    level: 0,
  });
  const nodes = [
    node("projection:folder:root", "folder"),
    node("projection:folder:child", "folder"),
    node("projection:topic:ai", "topic"),
    node("projection:topic:health", "topic"),
    node("source-a", "source_summary", "capture-a", "2026-07-16T12:00:00.000Z"),
    node("concept-a", "idea", "capture-a", "2026-07-16T12:00:00.000Z"),
    node("source-b", "source_summary", "capture-b", "2026-07-15T12:00:00.000Z"),
  ];
  const edges = [
    {
      id: "projection:folder-parent:child",
      sourceNodeId: "projection:folder:root",
      targetNodeId: "projection:folder:child",
      tone: "context" as const,
    },
    {
      id: "projection:folder-capture:child:a",
      sourceNodeId: "projection:folder:child",
      targetNodeId: "source-a",
      tone: "context" as const,
    },
    {
      id: "projection:folder-capture:root:b",
      sourceNodeId: "projection:folder:root",
      targetNodeId: "source-b",
      tone: "context" as const,
    },
    {
      id: "projection:topic-capture:ai:a",
      sourceNodeId: "projection:topic:ai",
      targetNodeId: "source-a",
      tone: "topic" as const,
    },
    {
      id: "projection:topic-capture:health:b",
      sourceNodeId: "projection:topic:health",
      targetNodeId: "source-b",
      tone: "topic" as const,
    },
    {
      id: "semantic-a",
      sourceNodeId: "source-a",
      targetNodeId: "concept-a",
      tone: "topic" as const,
    },
  ];
  return {
    snapshot: { id: "scoped", source: "workspace", nodes, edges },
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

  it("limits a focused graph to the selected one, two, or three hop distance", () => {
    const graph = chainGraphFixture();

    expect(
      buildKnowledgeGraphNetwork(graph, {
        focusNodeId: "chain-0",
        hopDepth: 1,
      }).nodes.map((node) => node.id),
    ).toEqual(["chain-0", "chain-1"]);
    expect(
      buildKnowledgeGraphNetwork(graph, {
        focusNodeId: "chain-0",
        hopDepth: 2,
      }).nodes.map((node) => node.id),
    ).toEqual(["chain-0", "chain-1", "chain-2"]);
    expect(
      buildKnowledgeGraphNetwork(graph, {
        focusNodeId: "chain-0",
        hopDepth: 3,
      }).nodes.map((node) => node.id),
    ).toEqual(["chain-0", "chain-1", "chain-2", "chain-3"]);
  });

  it("counts isolated nodes and supports an isolated-only view", () => {
    const graph = chainGraphFixture();
    const included = buildKnowledgeGraphNetwork(graph);
    const isolated = buildKnowledgeGraphNetwork(graph, { orphanMode: "only" });

    expect(included.orphanCount).toBe(1);
    expect(included.nodes.find((node) => node.id === "chain-4")?.orphan).toBe(true);
    expect(isolated.nodes.map((node) => node.id)).toEqual(["chain-4"]);
  });

  it("prioritizes and labels search result nodes before the visible cap", () => {
    const network = buildKnowledgeGraphNetwork(graphFixture(), {
      highlightedNodeIds: new Set(["node-69"]),
    });

    expect(network.nodes.some((node) => node.id === "node-69")).toBe(true);
    expect(network.nodes.find((node) => node.id === "node-69")?.searchHighlighted).toBe(
      true,
    );
  });

  it("creates a stable reset key that changes with the search result set", () => {
    expect(knowledgeGraphSearchResetKey(undefined)).toBe("search:none");
    expect(knowledgeGraphSearchResetKey(new Set(["node-b", "node-a"]))).toBe(
      "search:node-a|node-b",
    );
    expect(knowledgeGraphSearchResetKey(new Set(["node-a"]))).not.toBe(
      knowledgeGraphSearchResetKey(new Set(["node-a", "node-b"])),
    );
  });

  it("intersects date, descendant-folder, and topic capture scopes", () => {
    const network = buildKnowledgeGraphNetwork(scopedGraphFixture(), {
      scope: {
        dateKey: "2026-07-16",
        folderNodeId: "projection:folder:root",
        topicNodeId: "projection:topic:ai",
      },
    });
    const ids = new Set(network.nodes.map((node) => node.id));

    expect(ids.has("source-a")).toBe(true);
    expect(ids.has("concept-a")).toBe(true);
    expect(ids.has("projection:folder:child")).toBe(true);
    expect(ids.has("projection:topic:ai")).toBe(true);
    expect(ids.has("source-b")).toBe(false);
    expect(ids.has("projection:topic:health")).toBe(false);
  });
});
