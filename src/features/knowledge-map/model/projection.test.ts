import { describe, expect, it } from "vitest";
import type { GraphSnapshot } from "@/features/knowledge-map/model/graph";
import {
  chooseGraphRoot,
  projectGraphSnapshot,
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
