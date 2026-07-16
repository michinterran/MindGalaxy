import { describe, expect, it } from "vitest";
import type { GraphSnapshot } from "@/features/knowledge-map/model/graph";
import {
  chooseGraphRoot,
  projectGraphSnapshot,
  projectMindMapProjection,
  shortestGraphPath,
} from "@/features/knowledge-map/model/projection";

const snapshot: GraphSnapshot = {
  id: "test",
  source: "workspace",
  nodes: [
    {
      id: "idea",
      title: "Idea",
      eyebrow: "idea",
      summary: "",
      tone: "topic",
      nodeKind: "idea",
    },
    {
      id: "source",
      title: "Source",
      eyebrow: "source_summary",
      summary: "",
      tone: "source",
      nodeKind: "source_summary",
    },
    {
      id: "task",
      title: "Task",
      eyebrow: "task",
      summary: "",
      tone: "action",
      nodeKind: "task",
    },
    {
      id: "orphan",
      title: "Orphan",
      eyebrow: "idea",
      summary: "",
      tone: "topic",
      nodeKind: "idea",
    },
    {
      id: "orphan-child",
      title: "Orphan child",
      eyebrow: "idea",
      summary: "",
      tone: "topic",
      nodeKind: "idea",
    },
  ],
  edges: [
    {
      id: "e1",
      sourceNodeId: "source",
      targetNodeId: "idea",
    },
    {
      id: "e2",
      sourceNodeId: "idea",
      targetNodeId: "task",
    },
    {
      id: "e3",
      sourceNodeId: "orphan",
      targetNodeId: "orphan-child",
    },
  ],
};

function denseSnapshot(): GraphSnapshot {
  const branches = Array.from({ length: 9 }, (_, index) => {
    const suffix = String(index + 1).padStart(2, "0");
    return {
      branch: {
        id: `branch-${suffix}`,
        title: `Branch ${suffix}`,
        eyebrow: "topic",
        summary: "",
        tone: "topic" as const,
        nodeKind: "topic",
      },
      child: {
        id: `child-${suffix}`,
        title: `Child ${suffix}`,
        eyebrow: "idea",
        summary: "",
        tone: "ai" as const,
        nodeKind: "idea",
      },
      grandchild: {
        id: `grandchild-${suffix}`,
        title: `Grandchild ${suffix}`,
        eyebrow: "evidence",
        summary: "",
        tone: "evidence" as const,
        nodeKind: "evidence",
      },
    };
  });

  return {
    id: "dense",
    source: "workspace",
    nodes: [
      {
        id: "root",
        title: "Root",
        eyebrow: "source_summary",
        summary: "",
        tone: "source",
        nodeKind: "source_summary",
      },
      ...branches.flatMap(({ branch, child, grandchild }) => [branch, child, grandchild]),
    ],
    edges: branches.flatMap(({ branch, child, grandchild }, index) => {
      const suffix = String(index + 1).padStart(2, "0");
      return [
        {
          id: `root-branch-${suffix}`,
          sourceNodeId: "root",
          targetNodeId: branch.id,
        },
        {
          id: `branch-child-${suffix}`,
          sourceNodeId: branch.id,
          targetNodeId: child.id,
        },
        {
          id: `child-grandchild-${suffix}`,
          sourceNodeId: child.id,
          targetNodeId: grandchild.id,
        },
      ];
    }),
  };
}

function chainSnapshot(size: number): GraphSnapshot {
  const nodes = Array.from({ length: size }, (_, index) => ({
    id: `node-${String(index).padStart(3, "0")}`,
    title: `Node ${String(index).padStart(3, "0")}`,
    eyebrow: index === 0 ? "source_summary" : "topic",
    summary: "",
    tone: (index === 0 ? "source" : "topic") as "source" | "topic",
    nodeKind: index === 0 ? "source_summary" : "topic",
  }));

  return {
    id: `chain-${size}`,
    source: "workspace",
    nodes,
    edges: nodes.slice(1).map((node, index) => ({
      id: `edge-${index}`,
      sourceNodeId: nodes[index].id,
      targetNodeId: node.id,
    })),
  };
}

describe("projectGraphSnapshot", () => {
  it("chooses source_summary as root", () => {
    expect(chooseGraphRoot(snapshot)?.id).toBe("source");
  });

  it("places BFS levels left to right and disconnected nodes separately", () => {
    const projection = projectGraphSnapshot(snapshot);
    const source = projection.nodes.find((node) => node.id === "source");
    const idea = projection.nodes.find((node) => node.id === "idea");
    const task = projection.nodes.find((node) => node.id === "task");
    const orphan = projection.nodes.find((node) => node.id === "orphan");
    const orphanChild = projection.nodes.find((node) => node.id === "orphan-child");

    expect(source?.level).toBe(0);
    expect(idea?.level).toBe(1);
    expect(task?.level).toBe(2);
    expect(idea!.position.x).toBeGreaterThan(source!.position.x);
    expect(task!.position.x).toBeGreaterThan(idea!.position.x);
    expect(orphan!.position.y).not.toBe(source!.position.y);
    expect(orphanChild!.position.x).toBeGreaterThan(orphan!.position.x);
  });

  it("is deterministic and finite for galaxy positions", () => {
    const first = projectGraphSnapshot(snapshot);
    const second = projectGraphSnapshot(snapshot);

    expect(first.nodes.map((node) => node.galaxyPosition)).toEqual(
      second.nodes.map((node) => node.galaxyPosition),
    );
    expect(
      first.nodes.every((node) =>
        node.galaxyPosition.every((value) => Number.isFinite(value)),
      ),
    ).toBe(true);
  });

  it("does not duplicate ordered nodes or positions for disconnected components", () => {
    const projection = projectGraphSnapshot(snapshot);
    const ids = projection.nodes.map((node) => node.id);
    const positions = projection.nodes.map((node) => `${node.position.x}:${node.position.y}`);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it("prefers a persisted workspace position over the generated layout", () => {
    const savedPosition = { x: 912, y: 384 };
    const projection = projectGraphSnapshot({
      ...snapshot,
      nodes: snapshot.nodes.map((node) =>
        node.id === "idea" ? { ...node, savedPosition } : node,
      ),
    });

    expect(projection.nodes.find((node) => node.id === "idea")?.position).toEqual(
      savedPosition,
    );
  });

  it("finds shortest selected path and returns empty for disconnected targets", () => {
    const projection = projectGraphSnapshot(snapshot);

    expect(shortestGraphPath(projection, "source", "task")).toEqual([
      "source",
      "idea",
      "task",
    ]);
    expect(shortestGraphPath(projection, "source", "orphan-child")).toEqual([]);
  });
});

describe("projectMindMapProjection", () => {
  it("keeps a persisted workspace position in the focused mind map", () => {
    const savedPosition = { x: 864, y: 312 };
    const graph = projectGraphSnapshot({
      ...snapshot,
      nodes: snapshot.nodes.map((node) =>
        node.id === "idea" ? { ...node, savedPosition } : node,
      ),
    });

    expect(
      projectMindMapProjection(graph).nodes.find((node) => node.id === "idea")
        ?.position,
    ).toEqual(savedPosition);
  });

  it("keeps the shared graph intact while returning a readable two-hop focus projection", () => {
    const graph = projectGraphSnapshot(denseSnapshot());
    const mindMap = projectMindMapProjection(graph);

    expect(graph.nodes).toHaveLength(28);
    expect(mindMap.rootId).toBe("root");
    expect(mindMap.nodes).toHaveLength(15);
    expect(mindMap.nodes.every((node) => node.level <= 2)).toBe(true);
    expect(mindMap.treeEdges).toHaveLength(14);
    expect(mindMap.visibleNodeCount).toBe(15);
    expect(mindMap.totalNodeCount).toBe(28);
    expect(mindMap.hiddenNodeCount).toBe(13);
  });

  it("limits primary branches, balances the second level, and reports hidden descendants", () => {
    const mindMap = projectMindMapProjection(projectGraphSnapshot(denseSnapshot()));
    const root = mindMap.nodes.find((node) => node.id === "root");
    const branch01 = mindMap.nodes.find((node) => node.id === "branch-01");
    const child01 = mindMap.nodes.find((node) => node.id === "child-01");
    const visibleBranches = mindMap.nodes.filter((node) => node.level === 1);
    const visibleChildren = mindMap.nodes.filter((node) => node.level === 2);

    expect(visibleBranches).toHaveLength(7);
    expect(visibleChildren).toHaveLength(7);
    expect(root).toMatchObject({
      hasChildren: true,
      expanded: true,
      explicitlyExpanded: false,
      collapsed: false,
      canExpand: true,
      hiddenChildCount: 6,
    });
    expect(branch01).toMatchObject({ hasChildren: true, expanded: true, hiddenChildCount: 0 });
    expect(child01).toMatchObject({ hasChildren: true, expanded: false, hiddenChildCount: 1 });
  });

  it("opens an explicitly expanded boundary branch and uses the larger node budget", () => {
    const mindMap = projectMindMapProjection(projectGraphSnapshot(denseSnapshot()), {
      expandedNodeIds: ["child-01"],
    });

    expect(mindMap.nodes.some((node) => node.id === "grandchild-01")).toBe(true);
    expect(mindMap.nodes.find((node) => node.id === "child-01")).toMatchObject({
      expanded: true,
      hiddenChildCount: 0,
    });
    expect(mindMap.visibleNodeCount).toBe(16);
  });

  it("reveals direct children beyond the default branch limit when explicitly expanded", () => {
    const graph = projectGraphSnapshot(denseSnapshot());
    const initial = projectMindMapProjection(graph);
    const expanded = projectMindMapProjection(graph, { expandedNodeIds: ["root"] });

    expect(initial.nodes.filter((node) => node.level === 1)).toHaveLength(7);
    expect(expanded.nodes.filter((node) => node.level === 1)).toHaveLength(9);
    expect(expanded.visibleNodeCount).toBe(19);
    expect(expanded.nodes.find((node) => node.id === "root")).toMatchObject({
      explicitlyExpanded: true,
      canExpand: false,
      hiddenChildCount: 0,
    });
  });

  it("lets an explicit collapse override the default two-hop expansion", () => {
    const mindMap = projectMindMapProjection(projectGraphSnapshot(denseSnapshot()), {
      collapsedNodeIds: ["branch-01"],
      expandedNodeIds: ["branch-01"],
    });

    expect(mindMap.nodes.some((node) => node.id === "child-01")).toBe(false);
    expect(mindMap.nodes.find((node) => node.id === "branch-01")).toMatchObject({
      expanded: false,
      explicitlyExpanded: false,
      collapsed: true,
      canExpand: true,
      hiddenChildCount: 2,
    });
  });

  it("uses a valid requested focus and falls back safely for an unknown focus", () => {
    const graph = projectGraphSnapshot(denseSnapshot());
    const focused = projectMindMapProjection(graph, { focusNodeId: "branch-01" });
    const fallback = projectMindMapProjection(graph, { focusNodeId: "missing" });

    expect(focused.rootId).toBe("branch-01");
    expect(focused.nodes.find((node) => node.id === "branch-01")?.level).toBe(0);
    expect(fallback.rootId).toBe("root");
  });

  it("keeps disconnected knowledge in one collapsed unorganized group", () => {
    const mindMap = projectMindMapProjection(projectGraphSnapshot(snapshot));

    expect(mindMap.nodes.map((node) => node.id)).toEqual(["source", "idea", "task"]);
    expect(mindMap.unorganizedGroup).toEqual({
      id: "__mindmap_unorganized__",
      count: 2,
      nodeIds: ["orphan", "orphan-child"],
      expanded: false,
    });
    expect(mindMap.hiddenNodeCount).toBe(0);
  });

  it("separates one primary tree edge from additional visible semantic relations", () => {
    const source = denseSnapshot();
    source.edges.push({
      id: "cross-branch-01-02",
      sourceNodeId: "branch-01",
      targetNodeId: "branch-02",
      label: "related",
    });
    const mindMap = projectMindMapProjection(projectGraphSnapshot(source));
    const treeEdgeIds = new Set(mindMap.treeEdges.map((edge) => edge.id));

    expect(mindMap.treeEdges).toHaveLength(mindMap.nodes.length - 1);
    expect(mindMap.crossEdges.map((edge) => edge.id)).toContain("cross-branch-01-02");
    expect(mindMap.crossEdges.every((edge) => !treeEdgeIds.has(edge.id))).toBe(true);
  });

  it.each([1, 15, 50, 80, 200])(
    "keeps the focused projection within its readable budget for %i graph nodes",
    (size) => {
      const graph = projectGraphSnapshot(chainSnapshot(size));
      const before = structuredClone(graph);
      const mindMap = projectMindMapProjection(graph);

      expect(mindMap.visibleNodeCount).toBe(Math.min(size, 3));
      expect(mindMap.visibleNodeCount).toBeLessThanOrEqual(15);
      expect(mindMap.totalNodeCount).toBe(size);
      expect(mindMap.hiddenNodeCount).toBe(Math.max(0, size - 3));
      expect(graph).toEqual(before);
    },
  );

  it("expands a long chain one explicitly opened boundary at a time", () => {
    const graph = projectGraphSnapshot(chainSnapshot(50));
    const mindMap = projectMindMapProjection(graph, {
      expandedNodeIds: ["node-002", "node-003"],
    });

    expect(mindMap.nodes.map((node) => node.id)).toEqual([
      "node-000",
      "node-001",
      "node-002",
      "node-003",
      "node-004",
    ]);
    expect(mindMap.nodes.at(-1)).toMatchObject({
      id: "node-004",
      hiddenChildCount: 45,
    });
  });

  it("returns an empty contract for an empty shared graph", () => {
    const graph = projectGraphSnapshot({ id: "empty", source: "empty", nodes: [], edges: [] });

    expect(projectMindMapProjection(graph)).toEqual({
      rootId: null,
      nodes: [],
      treeEdges: [],
      crossEdges: [],
      visibleNodeCount: 0,
      totalNodeCount: 0,
      hiddenNodeCount: 0,
      unorganizedGroup: null,
    });
  });
});
