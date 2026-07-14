import { describe, expect, it } from "vitest";
import { splitHighlightSegments } from "@/features/search/model/highlight";

describe("splitHighlightSegments", () => {
  it("splits text into safe markable segments without HTML parsing", () => {
    expect(splitHighlightSegments("Graph search evidence", ["search"])).toEqual([
      { highlighted: false, text: "Graph " },
      { highlighted: true, text: "search" },
      { highlighted: false, text: " evidence" },
    ]);
  });

  it("treats tokens as text even when they contain HTML-looking input", () => {
    const segments = splitHighlightSegments("<script>safe</script>", ["<script>"]);

    expect(segments[0]).toEqual({ highlighted: true, text: "<script>" });
    expect(segments.map((segment) => segment.text).join("")).toBe(
      "<script>safe</script>",
    );
  });
});
