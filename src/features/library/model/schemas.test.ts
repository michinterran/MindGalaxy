import { describe, expect, it } from "vitest";
import { updateCaptureTitleInputSchema } from "@/features/library/model/schemas";

describe("updateCaptureTitleInputSchema", () => {
  it("allows a trimmed title or null", () => {
    expect(updateCaptureTitleInputSchema.parse({ title: "  Topic  " })).toEqual({
      title: "Topic",
    });
    expect(updateCaptureTitleInputSchema.parse({ title: null })).toEqual({ title: null });
  });

  it("rejects unrelated fields and oversized titles", () => {
    expect(() => updateCaptureTitleInputSchema.parse({ title: "ok", rawText: "no" })).toThrow();
    expect(() => updateCaptureTitleInputSchema.parse({ title: "x".repeat(201) })).toThrow();
  });
});
