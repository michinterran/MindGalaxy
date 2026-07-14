import { describe, expect, it } from "vitest";
import {
  mergeNodePosition,
  readNodePosition,
} from "@/features/graph-mutations/model/position";

describe("node position metadata", () => {
  it("merges position without removing analysis or existing UI metadata", () => {
    const metadata = mergeNodePosition(
      {
        evidence: { quote: "source" },
        ui: { collapsed: true },
      },
      { x: 320, y: 180 },
    );

    expect(metadata).toEqual({
      evidence: { quote: "source" },
      ui: {
        collapsed: true,
        position: { x: 320, y: 180 },
      },
    });
    expect(readNodePosition(metadata)).toEqual({ x: 320, y: 180 });
  });

  it("ignores malformed saved positions", () => {
    expect(readNodePosition({ ui: { position: { x: "10", y: 20 } } })).toBeUndefined();
    expect(readNodePosition(null)).toBeUndefined();
  });
});
