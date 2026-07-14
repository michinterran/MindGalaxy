import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateCaptureInput } from "@/lib/captures/schema";
import type { Database, Json } from "@/types/database";

type CreateCaptureResult = {
  capture: {
    id: string;
    workspace_id: string;
    project_id: string | null;
    title: string | null;
    source_kind: string;
    created_at: string;
  };
  processingJob: {
    id: string;
    status: string;
    job_type: string;
    created_at: string;
  };
};

export async function createCaptureWithProcessingJob(
  supabase: SupabaseClient<Database>,
  input: CreateCaptureInput,
  userId: string,
): Promise<CreateCaptureResult> {
  const { data: capture, error: captureError } = await supabase
    .from("captures")
    .insert({
      workspace_id: input.workspaceId,
      project_id: input.projectId ?? null,
      title: input.title ?? null,
      raw_text: input.rawText,
      source_kind: input.sourceKind,
      created_by: userId,
      metadata: input.metadata as Json,
    })
    .select("id, workspace_id, project_id, title, source_kind, created_at")
    .single();

  if (captureError || !capture) {
    throw new Error("CAPTURE_CREATE_FAILED");
  }

  if (input.source) {
    const { error: sourceError } = await supabase.from("capture_sources").insert({
      workspace_id: input.workspaceId,
      capture_id: capture.id,
      label: input.source.label,
      url: input.source.url ?? null,
      provider: input.source.provider ?? null,
      author: input.source.author ?? null,
      captured_at: input.source.capturedAt ?? null,
      metadata: input.source.metadata as Json,
    });

    if (sourceError) {
      throw new Error("CAPTURE_SOURCE_CREATE_FAILED");
    }
  }

  const { data: processingJob, error: jobError } = await supabase
    .from("processing_jobs")
    .insert({
      workspace_id: input.workspaceId,
      capture_id: capture.id,
      status: "queued",
      job_type: "capture_structure",
      prompt_version: "mindgalaxy-capture-v0",
      retry_count: 0,
      metadata: {
        sourceKind: input.sourceKind,
      },
    })
    .select("id, status, job_type, created_at")
    .single();

  if (jobError || !processingJob) {
    throw new Error("PROCESSING_JOB_CREATE_FAILED");
  }

  return {
    capture,
    processingJob,
  };
}
