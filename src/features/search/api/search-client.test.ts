import { describe, expect, it } from "vitest";
import {
  isAbortError,
  isLatestSearchRequest,
} from "@/features/search/api/search-client";

describe("isAbortError", () => {
  it("recognizes DOM abort exceptions", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
  });

  it("recognizes Error instances named AbortError", () => {
    const error = new Error("aborted");
    error.name = "AbortError";

    expect(isAbortError(error)).toBe(true);
  });

  it("recognizes abort-shaped objects from fetch adapters", () => {
    expect(isAbortError({ name: "AbortError" })).toBe(true);
  });

  it("rejects non-abort errors", () => {
    expect(isAbortError(new Error("network failed"))).toBe(false);
    expect(isAbortError({ name: "TypeError" })).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});

describe("isLatestSearchRequest", () => {
  it("allows only the newest request sequence to update state", () => {
    expect(isLatestSearchRequest(2, 2)).toBe(true);
    expect(isLatestSearchRequest(1, 2)).toBe(false);
  });

  it("treats a panel close invalidation as making fulfilled responses stale", () => {
    let requestSequence = 3;
    const fulfilledRequestId = requestSequence;

    requestSequence += 1;

    expect(isLatestSearchRequest(fulfilledRequestId, requestSequence)).toBe(false);
  });
});
