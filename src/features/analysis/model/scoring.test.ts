import { describe, expect, it } from "vitest";
import { scoreAnalysis } from "@/features/analysis/model/scoring";

describe("scoreAnalysis", () => {
  const baseAnalysis = {
    language: "ko" as const,
    contexts: [],
    nodes: [
      {
        clientNodeId: "n1",
        kind: "idea" as const,
        title: "아이디어",
        confidence: 0.9,
        contextClientIds: [],
      },
    ],
    edges: [],
  };

  it("allows high-confidence verified evidence", () => {
    const score = scoreAnalysis(baseAnalysis, [
      {
        confidence: 0.9,
        evidence: {
          quote: "아이디어",
          startOffset: 0,
          endOffset: 4,
          verified: true,
        },
      },
    ]);

    expect(score.reviewRequired).toBe(false);
  });

  it("requires review for invalid edge references", () => {
    const score = scoreAnalysis(
      {
        ...baseAnalysis,
        edges: [
          {
            sourceClientNodeId: "n1",
            targetClientNodeId: "missing",
            kind: "relates_to" as const,
            confidence: 0.8,
          },
        ],
      },
      [],
    );

    expect(score.reviewRequired).toBe(true);
    expect(score.reviewReasons).toContain("INVALID_EDGE_REFERENCE");
  });
});
