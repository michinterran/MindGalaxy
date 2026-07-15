import { describe, expect, it } from "vitest";
import { reconnectErrorMessageKey } from "@/features/analysis/queue/reconnect-feedback";
import { LibraryClientError } from "@/features/library/api/library-client";

describe("analysis reconnect error feedback", () => {
  it("maps stable API error codes to localized message keys", () => {
    expect(
      reconnectErrorMessageKey(
        new LibraryClientError("PROCESSING_JOB_NOT_STALE", 409),
      ),
    ).toBe("workspace.analysisReconnect.error.notStale");
    expect(
      reconnectErrorMessageKey(
        new LibraryClientError("LIBRARY_WRITE_FORBIDDEN", 403),
      ),
    ).toBe("workspace.analysisReconnect.error.forbidden");
  });

  it("keeps unknown failures on a safe generic message", () => {
    expect(reconnectErrorMessageKey(new Error("network"))).toBe(
      "workspace.analysisReconnect.error.default",
    );
  });
});
