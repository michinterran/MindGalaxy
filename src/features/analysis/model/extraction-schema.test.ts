import { describe, expect, it } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
import { JOB_REGISTRY } from "@/config/registry";
import { captureAnalysisSchema } from "@/features/analysis/model/extraction-schema";

describe("captureAnalysisSchema", () => {
  it("accepts a minimal grounded graph", () => {
    const parsed = captureAnalysisSchema.parse({
      captureSummary: null,
      language: "ko",
      contexts: [
        {
          clientContextId: "c1",
          kind: "topic",
          label: "MVP",
          normalizedValue: null,
          evidence: null,
        },
      ],
      nodes: [
        {
          clientNodeId: "n1",
          kind: "idea",
          title: "붙여넣기 중심",
          summary: null,
          evidence: { quote: "붙여넣기 중심" },
          contextClientIds: ["c1"],
          confidence: 0.8,
        },
      ],
      edges: [],
    });

    expect(parsed.nodes[0]?.clientNodeId).toBe("n1");
  });

  it("is compatible with the Responses API strict structured-output format", () => {
    expect(() =>
      zodTextFormat(captureAnalysisSchema, "capture_analysis"),
    ).not.toThrow();
  });

  it("rejects too many nodes", () => {
    const nodes = Array.from(
      { length: JOB_REGISTRY.captureStructuring.limits.maxNodes + 1 },
      (_, index) => ({
      clientNodeId: `n${index}`,
      kind: "idea",
      title: `node ${index}`,
      confidence: 0.5,
      }),
    );

    expect(() =>
      captureAnalysisSchema.parse({
        captureSummary: null,
        language: "unknown",
        nodes,
        edges: [],
        contexts: [],
      }),
    ).toThrow();
  });
});
