import { describe, expect, it } from "vitest";
import {
  deriveKnowledgeMapReadiness,
  knowledgeMapReadinessStateKey,
  selectKnowledgeMapActivityCapture,
  type RecentCapture,
} from "@/features/knowledge-map/model/readiness";

function recentCapture(
  id: string,
  processingStatus: string | null,
): RecentCapture {
  return {
    id,
    title: id,
    rawTextLength: 100,
    sourceKind: "paste",
    createdAt: "2026-07-15T00:00:00.000Z",
    processingStatus,
  };
}

describe("deriveKnowledgeMapReadiness", () => {
  it("distinguishes a truly empty workspace from a queued capture", () => {
    expect(
      deriveKnowledgeMapReadiness({ hasCapture: false, nodeCount: 0 }),
    ).toMatchObject({ kind: "no_capture", completedSteps: 0 });
    expect(
      deriveKnowledgeMapReadiness({
        hasCapture: true,
        nodeCount: 0,
        processingStatus: "queued",
      }),
    ).toMatchObject({ kind: "queued", activeStep: 1 });
  });

  it("keeps running, review, failure, and empty completion states explicit", () => {
    expect(
      deriveKnowledgeMapReadiness({
        hasCapture: true,
        nodeCount: 0,
        processingStatus: "running",
      }).kind,
    ).toBe("running");
    expect(
      deriveKnowledgeMapReadiness({
        hasCapture: true,
        nodeCount: 0,
        processingStatus: "needs_review",
      }).kind,
    ).toBe("needs_review");
    expect(
      deriveKnowledgeMapReadiness({
        hasCapture: true,
        nodeCount: 0,
        processingStatus: "failed",
      }).kind,
    ).toBe("failed");
    expect(
      deriveKnowledgeMapReadiness({
        hasCapture: true,
        nodeCount: 0,
        processingStatus: "completed",
      }).kind,
    ).toBe("completed_empty");
  });

  it("treats persisted nodes as ready regardless of the latest job label", () => {
    expect(
      deriveKnowledgeMapReadiness({
        hasCapture: true,
        nodeCount: 3,
        processingStatus: "running",
      }),
    ).toMatchObject({ kind: "ready", completedSteps: 5 });
  });
});

describe("selectKnowledgeMapActivityCapture", () => {
  it("keeps the newest actionable capture visible after a graph already exists", () => {
    const captures = [
      recentCapture("completed-latest", "completed"),
      recentCapture("running-next", "running"),
      recentCapture("failed-older", "failed"),
    ];

    expect(selectKnowledgeMapActivityCapture(captures)?.id).toBe("running-next");
  });

  it("includes review and failure states but ignores completed captures", () => {
    expect(
      selectKnowledgeMapActivityCapture([
        recentCapture("completed", "completed"),
        recentCapture("review", "needs_review"),
      ])?.id,
    ).toBe("review");
    expect(
      selectKnowledgeMapActivityCapture([
        recentCapture("completed", "completed"),
      ]),
    ).toBeNull();
  });
});

describe("knowledgeMapReadinessStateKey", () => {
  it("changes when the active processing job changes", () => {
    const capture = recentCapture("capture-1", "queued");

    expect(
      knowledgeMapReadinessStateKey([
        { ...capture, processingJobId: "job-1" },
      ]),
    ).toBe("job:job-1");
    expect(
      knowledgeMapReadinessStateKey([
        { ...capture, processingJobId: "job-2" },
      ]),
    ).toBe("job:job-2");
  });

  it("falls back to the capture identity before a job exists", () => {
    expect(knowledgeMapReadinessStateKey([])).toBe("no-capture");
    expect(
      knowledgeMapReadinessStateKey([recentCapture("capture-1", null)]),
    ).toBe("capture:capture-1");
  });
});
