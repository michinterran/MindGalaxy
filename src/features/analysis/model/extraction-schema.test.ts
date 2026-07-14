import { describe, expect, it } from "vitest";
import { captureAnalysisSchema } from "@/features/analysis/model/extraction-schema";

describe("captureAnalysisSchema", () => {
  it("accepts a minimal grounded graph", () => {
    const parsed = captureAnalysisSchema.parse({
      language: "ko",
      contexts: [{ clientContextId: "c1", kind: "topic", label: "MVP" }],
      nodes: [
        {
          clientNodeId: "n1",
          kind: "idea",
          title: "붙여넣기 중심",
          evidence: { quote: "붙여넣기 중심" },
          contextClientIds: ["c1"],
          confidence: 0.8,
        },
      ],
      edges: [],
    });

    expect(parsed.nodes[0]?.clientNodeId).toBe("n1");
  });

  it("rejects too many nodes", () => {
    const nodes = Array.from({ length: 25 }, (_, index) => ({
      clientNodeId: `n${index}`,
      kind: "idea",
      title: `node ${index}`,
      confidence: 0.5,
    }));

    expect(() =>
      captureAnalysisSchema.parse({
        nodes,
        edges: [],
        contexts: [],
      }),
    ).toThrow();
  });
});
