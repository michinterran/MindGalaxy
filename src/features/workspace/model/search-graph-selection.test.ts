import { describe, expect, it } from "vitest";
import {
  graphNodeIdsForSearchResults,
  mapViewForSearchSelection,
} from "@/features/workspace/model/search-graph-selection";

describe("search graph selection", () => {
  it("maps node results and all graph nodes derived from capture results", () => {
    const highlighted = graphNodeIdsForSearchResults(
      [
        { id: "node-a", captureId: "capture-a" },
        { id: "node-b", captureId: "capture-b" },
        { id: "node-c", captureId: "capture-b" },
      ],
      [
        {
          resultId: "node:node-a",
          sourceType: "node",
          captureId: "capture-a",
        },
        {
          resultId: "capture:capture-b",
          sourceType: "capture",
          captureId: "capture-b",
        },
      ],
    );

    expect([...highlighted].sort()).toEqual(["node-a", "node-b", "node-c"]);
  });

  it("preserves the graph view when a result is selected from it", () => {
    expect(mapViewForSearchSelection("knowledge", "graph")).toBe("graph");
    expect(mapViewForSearchSelection("knowledge", "mindmap")).toBe("mindmap");
    expect(mapViewForSearchSelection("library", "list")).toBe("mindmap");
  });
});
