import { JOB_REGISTRY } from "@/config/registry";
import type { ScoredAnalysis } from "@/features/analysis/model/scoring";
import type { ClaimedAnalysisJob } from "@/features/analysis/worker/claim";
import type { PersistedCaptureAnalysis } from "@/features/analysis/worker/embeddings";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";

const PERSISTENCE_RPC_ERROR_CODES = new Set([
  "JOB_NOT_FOUND",
  "ATTEMPT_STALE",
  "RESULT_OBJECT_REQUIRED",
  "RESULT_ARRAYS_REQUIRED",
  "CAPTURE_EMBEDDING_INVALID",
  "REVIEW_REASONS_ARRAY_REQUIRED",
  "RESULT_TOO_LARGE",
  "CONTEXT_INVALID",
  "CONTEXT_JSON_OBJECT_INVALID",
  "CONTEXT_CLIENT_ID_DUPLICATE",
  "NODE_INVALID",
  "NODE_JSON_SHAPE_INVALID",
  "NODE_EMBEDDING_INVALID",
  "NODE_CLIENT_ID_DUPLICATE",
  "NODE_CONTEXT_REFERENCE_INVALID",
  "EDGE_INVALID",
  "EDGE_JSON_OBJECT_INVALID",
  "EDGE_NODE_REFERENCE_INVALID",
]);

export function normalizeAnalysisResultForPersistence(
  analysis: PersistedCaptureAnalysis,
): Json {
  return {
    ...analysis,
    contexts: analysis.contexts.map((context) => ({
      ...context,
      evidence: context.evidence ?? {},
    })),
    nodes: analysis.nodes.map((node) => ({
      ...node,
      evidence: node.evidence ?? {},
    })),
    edges: analysis.edges.map((edge) => ({
      ...edge,
      evidence: edge.evidence ?? {},
    })),
  } as unknown as Json;
}

function persistenceErrorCode(message: string | undefined) {
  return message && PERSISTENCE_RPC_ERROR_CODES.has(message)
    ? message
    : "ANALYSIS_RESULT_PERSIST_FAILED";
}

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
      p_result: normalizeAnalysisResultForPersistence(analysis),
      p_model: job.model,
      p_prompt_version: job.promptVersion,
      p_confidence: score.confidence,
      p_review_required: score.reviewRequired,
      p_review_reasons: score.reviewReasons as unknown as Json,
    })
    .single();

  if (error || !data) {
    throw new Error(persistenceErrorCode(error?.message));
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

  const { data, error } = await supabase
    .rpc("fail_capture_analysis_job", {
      p_job_id: job.jobId,
      p_attempt_id: job.attemptId,
      p_worker_id: workerId,
      p_error_code: errorCode,
      p_error_message: null,
      p_retry_delay_seconds: delay,
      p_max_attempts: registry.maxAttempts,
    })
    .single();

  return {
    recorded: !error && Boolean(data),
    status: data?.status ?? null,
  };
}
