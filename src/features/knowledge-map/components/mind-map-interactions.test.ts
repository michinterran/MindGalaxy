import { describe, expect, it } from "vitest";
import {
  canPersistMindMapNodePosition,
  isMindMapActivationKey,
  mindMapKeyboardNudge,
  mindMapBranchControls,
  toggleMindMapBranch,
} from "@/features/knowledge-map/components/mind-map-interactions";

describe("mind map interaction helpers", () => {
  it("persists only durable workspace node positions", () => {
    expect(
      canPersistMindMapNodePosition({
        hasPersistenceHandler: true,
        isDemo: false,
        nodeId: "persisted-node",
      }),
    ).toBe(true);
    expect(
      canPersistMindMapNodePosition({
        hasPersistenceHandler: true,
        isDemo: false,
        nodeId: "projection:folder:folder-id",
      }),
    ).toBe(false);
    expect(
      canPersistMindMapNodePosition({
        hasPersistenceHandler: true,
        isDemo: false,
        nodeId: "projection:capture:capture-id",
      }),
    ).toBe(false);
    expect(
      canPersistMindMapNodePosition({
        hasPersistenceHandler: true,
        isDemo: true,
        nodeId: "persisted-node",
      }),
    ).toBe(false);
  });

  it("supports Enter and Space as node activation keys", () => {
    expect(isMindMapActivationKey("Enter")).toBe(true);
    expect(isMindMapActivationKey(" ")).toBe(true);
    expect(isMindMapActivationKey("Escape")).toBe(false);
  });

  it("provides an Alt plus arrow keyboard alternative for node positioning", () => {
    expect(mindMapKeyboardNudge("ArrowLeft", true)).toEqual({ x: -24, y: 0 });
    expect(mindMapKeyboardNudge("ArrowRight", true)).toEqual({ x: 24, y: 0 });
    expect(mindMapKeyboardNudge("ArrowUp", true)).toEqual({ x: 0, y: -24 });
    expect(mindMapKeyboardNudge("ArrowDown", true)).toEqual({ x: 0, y: 24 });
    expect(mindMapKeyboardNudge("ArrowRight", false)).toBeNull();
    expect(mindMapKeyboardNudge("Enter", true)).toBeNull();
  });

  it("separates branch expansion from node selection state", () => {
    const expanded = toggleMindMapBranch("topic-1", false, {
      collapsedNodeIds: new Set(["topic-1"]),
      expandedNodeIds: new Set(),
    });

    expect([...expanded.expandedNodeIds]).toEqual(["topic-1"]);
    expect([...expanded.collapsedNodeIds]).toEqual([]);

    const collapsed = toggleMindMapBranch("topic-1", true, expanded);

    expect([...collapsed.expandedNodeIds]).toEqual([]);
    expect([...collapsed.collapsedNodeIds]).toEqual(["topic-1"]);
  });

  it("exposes aria-expanded only on the active collapse disclosure", () => {
    const partiallyVisible = mindMapBranchControls({
      canExpand: true,
      expanded: true,
      explicitlyExpanded: false,
    });

    expect(partiallyVisible.showCollapse).toBe(true);
    expect(partiallyVisible.showExpand).toBe(true);
    expect(partiallyVisible.collapseAriaExpanded).toBe(true);
    expect("expandAriaExpanded" in partiallyVisible).toBe(false);
  });
});
