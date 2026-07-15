import { describe, expect, it } from "vitest";
import {
  getSearchLayerReadiness,
  SEARCH_PROGRESS_STEPS,
} from "@/features/search/model/presentation";

describe("search presentation", () => {
  it("keeps the grounded answer pipeline in an explicit order", () => {
    expect(SEARCH_PROGRESS_STEPS.map((step) => step.id)).toEqual([
      "retrieve",
      "evidence",
      "answer",
    ]);
  });

  it("keeps raw source search available while derived layers are preparing", () => {
    expect(getSearchLayerReadiness(true)).toEqual([
      expect.objectContaining({ id: "lexical", status: "ready" }),
      expect.objectContaining({ id: "semantic", status: "preparing" }),
      expect.objectContaining({ id: "graph", status: "preparing" }),
    ]);
  });

  it("marks every search layer available when analysis is settled", () => {
    expect(getSearchLayerReadiness(false).every((layer) => layer.status === "ready")).toBe(true);
  });
});
