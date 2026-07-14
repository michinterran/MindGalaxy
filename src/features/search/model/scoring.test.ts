import { describe, expect, it } from "vitest";
import { mapSearchRow } from "@/features/search/model/scoring";

describe("mapSearchRow", () => {
  it("clamps scores and maps snake_case db row", () => {
    const mapped = mapSearchRow({
      result_id: "capture:1",
      source_type: "capture",
      title: "Capture",
      snippet: "Snippet",
      evidence: null,
      node_kind: null,
      capture_id: "00000000-0000-4000-8000-000000000001",
      lexical_score: 1.2,
      semantic_score: -0.2,
      graph_score: 0.4,
      final_score: 0.9,
    });

    expect(mapped.sourceType).toBe("capture");
    expect(mapped.lexicalScore).toBe(1);
    expect(mapped.semanticScore).toBe(0);
    expect(mapped.finalScore).toBe(0.9);
  });

  it("localizes blank capture titles outside SQL", () => {
    const mapped = mapSearchRow(
      {
        result_id: "capture:1",
        source_type: "capture",
        title: "",
        snippet: "Snippet",
        evidence: null,
        node_kind: null,
        capture_id: "00000000-0000-4000-8000-000000000001",
        lexical_score: 0,
        semantic_score: 0,
        graph_score: 0,
        final_score: 0,
      },
      "en",
    );

    expect(mapped.title).toBe("Untitled capture");
  });
});
