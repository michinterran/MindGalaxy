export type LibraryCaptureDetail = {
  id: string;
  title: string | null;
  rawText: string;
  sourceKind: string;
  createdAt: string;
  processingStatus: string | null;
  processingError: string | null;
  processingJobId: string | null;
  processingNextRunAt: string | null;
  processingUpdatedAt: string | null;
  derivedNodeCount: number;
  canEdit: boolean;
  canDelete: boolean;
};

export { canReconnectQueuedJob } from "@/features/analysis/queue/reconnect-policy";

export function canRetryCapture(status: string | null | undefined) {
  return status === "failed" || status === "needs_review";
}

export function getRetryableProcessingJobId(
  detail: LibraryCaptureDetail,
): string | null {
  if (!detail.canEdit || !canRetryCapture(detail.processingStatus)) return null;
  return detail.processingJobId;
}
