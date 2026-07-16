import { describe, expect, it } from "vitest";
import {
  buildFolderTree,
  collectFolderDescendantIds,
} from "@/features/library-organizer/model/folder-tree";

const folders = [
  { id: "research", parentId: null, name: "Research", sortOrder: 1, captureCount: 2 },
  { id: "ai", parentId: "research", name: "AI", sortOrder: 0, captureCount: 3 },
  { id: "archive", parentId: null, name: "Archive", sortOrder: 0, captureCount: 1 },
];

describe("library organizer folder tree", () => {
  it("sorts folders and aggregates descendant material counts", () => {
    const tree = buildFolderTree(folders);
    expect(tree.map((node) => node.id)).toEqual(["archive", "research"]);
    expect(tree[1]?.descendantCaptureCount).toBe(5);
    expect(tree[1]?.children[0]?.id).toBe("ai");
  });

  it("collects a selected folder and all descendants", () => {
    expect([...collectFolderDescendantIds(folders, "research")].sort()).toEqual([
      "ai",
      "research",
    ]);
  });
});
