import { PROCESSING_STATUS } from "@/config/domain";

export type KnowledgeMapReadinessKind =
  | "no_capture"
  | "queued"
  | "running"
  | "needs_review"
  | "failed"
  | "completed_empty"
  | "ready";

export type KnowledgeMapReadiness = {
  kind: KnowledgeMapReadinessKind;
  activeStep: number;
  completedSteps: number;
};

export type RecentCapture = {
  id: string;
  title: string | null;
  rawTextLength: number;
  rawTextPreview?: string | null;
  sourceKind: string;
  createdAt: string;
  processingJobId?: string | null;
  processingStatus?: string | null;
  processingCreatedAt?: string | null;
  processingNextRunAt?: string | null;
  processingStartedAt?: string | null;
  processingUpdatedAt?: string | null;
  processingError?: string | null;
  retryCount?: number;
  maxAttempts?: number;
};

const KNOWLEDGE_MAP_ACTIVITY_STATUSES = new Set<string>([
  PROCESSING_STATUS.queued,
  PROCESSING_STATUS.running,
  PROCESSING_STATUS.needsReview,
  PROCESSING_STATUS.failed,
]);

export function selectKnowledgeMapActivityCapture(
  recentCaptures: RecentCapture[],
): RecentCapture | null {
  return (
    recentCaptures.find((capture) =>
      capture.processingStatus
        ? KNOWLEDGE_MAP_ACTIVITY_STATUSES.has(capture.processingStatus)
        : false,
    ) ?? null
  );
}

export function selectKnowledgeMapReadinessCapture(
  recentCaptures: RecentCapture[],
): RecentCapture | null {
  return selectKnowledgeMapActivityCapture(recentCaptures) ?? recentCaptures[0] ?? null;
}

export function knowledgeMapReadinessStateKey(
  recentCaptures: RecentCapture[],
): string {
  const capture = selectKnowledgeMapReadinessCapture(recentCaptures);

  if (!capture) return "no-capture";

  return capture.processingJobId
    ? `job:${capture.processingJobId}`
    : `capture:${capture.id}`;
}

export function deriveKnowledgeMapReadiness({
  hasCapture,
  nodeCount,
  processingStatus,
}: {
  hasCapture: boolean;
  nodeCount: number;
  processingStatus?: string | null;
}): KnowledgeMapReadiness {
  if (nodeCount > 0) {
    return { kind: "ready", activeStep: 2, completedSteps: 3 };
  }

  if (!hasCapture) {
    return { kind: "no_capture", activeStep: 0, completedSteps: 0 };
  }

  if (processingStatus === PROCESSING_STATUS.failed) {
    return { kind: "failed", activeStep: 1, completedSteps: 1 };
  }

  if (processingStatus === PROCESSING_STATUS.needsReview) {
    return { kind: "needs_review", activeStep: 2, completedSteps: 2 };
  }

  if (processingStatus === PROCESSING_STATUS.completed) {
    return { kind: "completed_empty", activeStep: 2, completedSteps: 2 };
  }

  if (processingStatus === PROCESSING_STATUS.running) {
    return { kind: "running", activeStep: 1, completedSteps: 1 };
  }

  return { kind: "queued", activeStep: 1, completedSteps: 1 };
}
