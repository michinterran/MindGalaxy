import { describe, expect, it } from "vitest";
import { verifyEvidenceQuote } from "@/features/analysis/model/evidence";

describe("verifyEvidenceQuote", () => {
  it("finds exact offsets", () => {
    expect(verifyEvidenceQuote("abc def ghi", "def")).toEqual({
      quote: "def",
      startOffset: 4,
      endOffset: 7,
      verified: true,
    });
  });

  it("finds normalized whitespace offsets", () => {
    const result = verifyEvidenceQuote("abc   def", "abc def");

    expect(result?.verified).toBe(true);
    expect(result?.startOffset).toBe(0);
  });

  it("keeps offsets aligned when normalized text has leading and trailing whitespace", () => {
    const result = verifyEvidenceQuote("   alpha   beta   ", "alpha beta");

    expect(result).toEqual({
      quote: "alpha beta",
      startOffset: 3,
      endOffset: 15,
      verified: true,
    });
  });

  it("returns unverified evidence when quote is absent", () => {
    expect(verifyEvidenceQuote("abc", "missing")).toEqual({
      quote: "missing",
      startOffset: null,
      endOffset: null,
      verified: false,
    });
  });
});
