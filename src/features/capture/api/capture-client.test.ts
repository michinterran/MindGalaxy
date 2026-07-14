import { describe, expect, it } from "vitest";
import {
  CaptureClientError,
  captureErrorMessage,
} from "@/features/capture/api/capture-client";

describe("captureErrorMessage", () => {
  it("maps internal API codes to user-facing Korean copy", () => {
    expect(captureErrorMessage("ko", "AUTH_REQUIRED")).toBe("로그인 후 저장할 수 있습니다.");
    expect(captureErrorMessage("ko", "VALIDATION_ERROR")).not.toContain(
      "VALIDATION_ERROR",
    );
  });

  it("keeps the raw code on the error object for diagnostics", () => {
    const error = new CaptureClientError("INVALID_JSON", 400);

    expect(error.code).toBe("INVALID_JSON");
    expect(captureErrorMessage("en", error.code)).toBe(
      "Check the request format and try again.",
    );
  });
});
