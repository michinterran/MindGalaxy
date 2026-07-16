import { describe, expect, it } from "vitest";
import { edgeOriginStrokeDasharray } from "@/features/knowledge-map/components/knowledge-graph-edge-presentation";

describe("edgeOriginStrokeDasharray", () => {
  it("uses solid, dashed, and dotted rhythms for user, AI, and system origins", () => {
    expect(edgeOriginStrokeDasharray("user")).toBeUndefined();
    expect(edgeOriginStrokeDasharray("ai")).toBe("9 6");
    expect(edgeOriginStrokeDasharray("system")).toBe("2 6");
  });

  it("treats legacy unmarked projection edges as system structure", () => {
    expect(edgeOriginStrokeDasharray(undefined)).toBe("2 6");
  });
});
