import { JOB_REGISTRY } from "@/config/registry";
import type { ScoredAnalysis } from "@/features/analysis/model/scoring";
import type { ClaimedAnalysisJob } from "@/features/analysis/worker/claim";
import type { PersistedCaptureAnalysis } from "@/features/analysis/worker/embeddings";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";

export async function persistAnalysisResult(
  supabase: SupabaseClient<Database>,
  job: ClaimedAnalysisJob,
  workerId: string,
  analysis: PersistedCaptureAnalysis,
  score: ScoredAnalysis,
) {
  const { data, error } = await supabase
    .rpc("persist_capture_analysis_result", {
      p_job_id: job.jobId,
      p_attempt_id: job.attemptId,
      p_worker_id: workerId,
      p_result: analysis as unknown as Json,
      p_model: job.model,
      p_prompt_version: job.promptVersion,
      p_confidence: score.confidence,
      p_review_required: score.reviewRequired,
      p_review_reasons: score.reviewReasons as unknown as Json,
    })
    .single();

  if (error || !data) {
    throw new Error("ANALYSIS_RESULT_PERSIST_FAILED");
  }

  return data;
}

export async function failAnalysisJob(
  supabase: SupabaseClient<Database>,
  job: ClaimedAnalysisJob,
  workerId: string,
  errorCode: string,
) {
  const registry = JOB_REGISTRY.captureStructuring;
  const delay =
    registry.retryBaseDelaySeconds *
    Math.max(1, Math.min(job.attemptNumber, registry.maxAttempts));

  const { error } = await supabase.rpc("fail_capture_analysis_job", {
    p_job_id: job.jobId,
    p_attempt_id: job.attemptId,
    p_worker_id: workerId,
    p_error_code: errorCode,
    p_error_message: null,
    p_retry_delay_seconds: delay,
    p_max_attempts: registry.maxAttempts,
  });

  return { recorded: !error };
}
