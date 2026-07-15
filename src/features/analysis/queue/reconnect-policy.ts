import { ANALYSIS_QUEUE_REGISTRY } from "@/config/registry";

type ReconnectableJobState = {
  status: string | null | undefined;
  updatedAt: string | null | undefined;
  nextRunAt?: string | null;
};

function timestamp(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function queuedJobReconnectAvailableAt(
  job: ReconnectableJobState,
): number | null {
  if (job.status !== "queued") return null;

  const updatedAt = timestamp(job.updatedAt);
  if (updatedAt === null) return null;
  const nextRunAt = timestamp(job.nextRunAt);
  const activityAnchor = Math.max(updatedAt, nextRunAt ?? updatedAt);

  return activityAnchor + ANALYSIS_QUEUE_REGISTRY.reconnectAfterSeconds * 1_000;
}

export function canReconnectQueuedJob(
  job: ReconnectableJobState,
  nowMs: number = Date.now(),
) {
  const availableAt = queuedJobReconnectAvailableAt(job);
  return availableAt !== null && nowMs >= availableAt;
}

export function buildAnalysisReconnectIdempotencyKey(
  jobId: string,
  jobUpdatedAt: string,
) {
  const generation = timestamp(jobUpdatedAt);
  if (generation === null) {
    throw new Error("ANALYSIS_RECONNECT_TIMESTAMP_INVALID");
  }
  return `capture-analysis:${jobId}:reconnect:v1:${generation}`;
}
