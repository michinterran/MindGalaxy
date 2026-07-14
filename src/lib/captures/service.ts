import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateCaptureCommand } from "@/lib/captures/schema";
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
  input: CreateCaptureCommand,
): Promise<CreateCaptureResult> {
  const { data, error } = await supabase
    .rpc("create_capture_command", {
      p_workspace_id: input.workspaceId,
      p_request_id: input.requestId,
      p_raw_text: input.rawText,
      p_project_id: input.projectId ?? null,
      p_title: input.title ?? null,
      p_source_kind: input.sourceKind,
      p_source: (input.source ?? null) as Json | null,
      p_metadata: input.metadata as Json,
    })
    .single();

  if (error || !data) {
    throw new Error("CAPTURE_CREATE_FAILED");
  }

  return {
    capture: {
      id: data.capture_id,
      workspace_id: data.workspace_id,
      project_id: data.project_id,
      title: data.title,
      source_kind: data.source_kind,
      created_at: data.capture_created_at,
    },
    processingJob: {
      id: data.processing_job_id,
      status: data.processing_job_status,
      job_type: data.processing_job_type,
      created_at: data.processing_job_created_at,
    },
  };
}
