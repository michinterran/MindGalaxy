import { describe, expect, it } from "vitest";
import {
  canMutateGraphNode,
  isProjectionOnlyGraphNodeId,
} from "@/features/knowledge-map/model/graph";

describe("projection-only graph node capabilities", () => {
  it.each([
    "projection:folder:folder-id",
    "projection:capture:capture-id",
    "projection:topic:topic-id",
  ])("recognizes %s as a read-model-only node", (nodeId) => {
    expect(isProjectionOnlyGraphNodeId(nodeId)).toBe(true);
    expect(canMutateGraphNode(nodeId)).toBe(false);
  });

  it.each([
    "persisted-node-id",
    "projection:folder-parent:folder-id",
    "projection:folder-capture:folder-id:capture-id",
    "projection:topic-capture:topic-id:capture-id",
  ])("keeps %s outside the projection-only node namespace", (nodeId) => {
    expect(isProjectionOnlyGraphNodeId(nodeId)).toBe(false);
    expect(canMutateGraphNode(nodeId)).toBe(true);
  });
});
