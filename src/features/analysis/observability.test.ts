import { describe, expect, it } from "vitest";
import { analysisErrorCode } from "@/features/analysis/observability";

describe("analysisErrorCode", () => {
  it("classifies unsupported structured-output schemas without logging details", () => {
    expect(
      analysisErrorCode(
        new Error(
          "Zod field at `properties/example` uses `.optional()` without `.nullable()` which is not supported by the API.",
        ),
      ),
    ).toBe("ANALYSIS_OUTPUT_SCHEMA_INVALID");
  });
});
