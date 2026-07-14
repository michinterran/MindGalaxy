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

export async function claimAnalysisJob(
  supabase: SupabaseClient<Database>,
  workerId: string,
): Promise<ClaimedAnalysisJob | null> {
  const registry = JOB_REGISTRY.captureStructuring;
  const { data, error } = await supabase
    .rpc("claim_capture_analysis_job", {
      p_worker_id: workerId,
      p_lease_seconds: registry.leaseSeconds,
      p_model: registry.model.model,
      p_prompt_version: registry.prompt.version,
      p_max_attempts: registry.maxAttempts,
    })
    .maybeSingle();

  if (error) {
    throw new Error("ANALYSIS_JOB_CLAIM_FAILED");
  }

  if (!data) return null;

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
