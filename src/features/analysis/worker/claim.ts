import { JOB_REGISTRY } from "@/config/registry";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type ClaimedAnalysisJob = {
  jobId: string;
  attemptId: string;
  attemptNumber: number;
  workspaceId: string;
  captureId: string;
  rawText: string;
  sourceKind: string;
  title: string | null;
  model: string;
  promptVersion: string;
};

export type AnalysisJobState = {
  jobId: string;
  workspaceId: string;
  captureId: string;
  status: string;
  retryCount: number;
  maxAttempts: number;
  nextRunAt: string;
  leaseExpiresAt: string | null;
};

function mapClaimedJob(data: {
  job_id: string;
  attempt_id: string;
  attempt_number: number;
  workspace_id: string;
  capture_id: string;
  raw_text: string;
  source_kind: string;
  title: string | null;
  model: string;
  prompt_version: string;
}): ClaimedAnalysisJob {
  return {
    jobId: data.job_id,
    attemptId: data.attempt_id,
    attemptNumber: data.attempt_number,
    workspaceId: data.workspace_id,
    captureId: data.capture_id,
    rawText: data.raw_text,
    sourceKind: data.source_kind,
    title: data.title,
    model: data.model,
    promptVersion: data.prompt_version,
  };
}

export async function claimAnalysisJob(
  supabase: SupabaseClient<Database>,
  workerId: string,
  maxAttempts: number = JOB_REGISTRY.captureStructuring.maxManualAttempts,
): Promise<ClaimedAnalysisJob | null> {
  const registry = JOB_REGISTRY.captureStructuring;
  const { data, error } = await supabase
    .rpc("claim_capture_analysis_job", {
      p_worker_id: workerId,
      p_lease_seconds: registry.leaseSeconds,
      p_model: registry.model.model,
      p_prompt_version: registry.prompt.version,
      p_max_attempts: maxAttempts,
    })
    .maybeSingle();

  if (error) {
    throw new Error("ANALYSIS_JOB_CLAIM_FAILED");
  }

  if (!data) return null;

  return mapClaimedJob(data);
}

export async function claimAnalysisJobById(
  supabase: SupabaseClient<Database>,
  jobId: string,
  workerId: string,
  maxAttempts: number = JOB_REGISTRY.captureStructuring.maxManualAttempts,
): Promise<ClaimedAnalysisJob | null> {
  const registry = JOB_REGISTRY.captureStructuring;
  const { data, error } = await supabase
    .rpc("claim_capture_analysis_job_by_id", {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_lease_seconds: registry.leaseSeconds,
      p_model: registry.model.model,
      p_prompt_version: registry.prompt.version,
      p_max_attempts: maxAttempts,
    })
    .maybeSingle();

  if (error) {
    throw new Error("ANALYSIS_JOB_CLAIM_BY_ID_FAILED");
  }

  return data ? mapClaimedJob(data) : null;
}

export async function getAnalysisJobState(
  supabase: SupabaseClient<Database>,
  jobId: string,
): Promise<AnalysisJobState | null> {
  const { data, error } = await supabase
    .from("processing_jobs")
    .select(
      "id, workspace_id, capture_id, status, retry_count, max_attempts, next_run_at, lease_expires_at",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw new Error("ANALYSIS_JOB_STATE_READ_FAILED");
  }

  if (!data) return null;

  return {
    jobId: data.id,
    workspaceId: data.workspace_id,
    captureId: data.capture_id,
    status: data.status,
    retryCount: data.retry_count,
    maxAttempts: data.max_attempts,
    nextRunAt: data.next_run_at,
    leaseExpiresAt: data.lease_expires_at,
  };
}
