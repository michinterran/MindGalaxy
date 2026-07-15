import { describe, expect, it } from "vitest";
import {
  canRetryCapture,
  getRetryableProcessingJobId,
  type LibraryCaptureDetail,
} from "@/features/library/model/capture-detail";

describe("canRetryCapture", () => {
  it.each(["failed", "needs_review"])("allows retry for %s", (status) => {
    expect(canRetryCapture(status)).toBe(true);
  });

  it.each([null, "queued", "running", "completed"])(
    "does not allow retry for %s",
    (status) => {
      expect(canRetryCapture(status)).toBe(false);
    },
  );
});

describe("getRetryableProcessingJobId", () => {
  const detail: LibraryCaptureDetail = {
    id: "capture-id",
    title: null,
    rawText: "source",
    sourceKind: "paste",
    createdAt: "2026-07-14T00:00:00.000Z",
    processingStatus: "failed",
    processingError: "failed",
    processingJobId: "job-id",
    processingNextRunAt: "2026-07-14T00:00:00.000Z",
    processingUpdatedAt: "2026-07-14T00:00:00.000Z",
    derivedNodeCount: 0,
    canEdit: true,
    canDelete: false,
  };

  it("returns the processing job ID, never the capture ID", () => {
    expect(getRetryableProcessingJobId(detail)).toBe("job-id");
  });

  it("blocks viewers, non-retryable statuses, and missing jobs", () => {
    expect(getRetryableProcessingJobId({ ...detail, canEdit: false })).toBeNull();
    expect(
      getRetryableProcessingJobId({ ...detail, processingStatus: "running" }),
    ).toBeNull();
    expect(
      getRetryableProcessingJobId({ ...detail, processingJobId: null }),
    ).toBeNull();
  });
});
