import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaptureDetail } from "@/features/library/api/library-client";
import type { UpdateCaptureTitleInput } from "@/features/library/model/schemas";
import type { Database } from "@/types/database";

export type LibraryErrorCode =
  | "AUTH_REQUIRED"
  | "CAPTURE_DELETE_FAILED"
  | "CAPTURE_NOT_FOUND"
  | "CAPTURE_READ_FAILED"
  | "CAPTURE_UPDATE_FAILED"
  | "LIBRARY_WRITE_FORBIDDEN"
  | "PROCESSING_JOB_NOT_FOUND"
  | "PROCESSING_JOB_RETRY_FAILED"
  | "PROCESSING_JOB_RETRY_NOT_ALLOWED"
  | "RETRY_LIMIT_REACHED"
  | "SUPABASE_NOT_CONFIGURED";

export class LibraryError extends Error {
  constructor(
    public readonly code: LibraryErrorCode,
    public readonly status: number,
  ) {
    super(code);
    this.name = "LibraryError";
  }
}

export type LibraryClients = {
  actor: SupabaseClient<Database>;
  service: SupabaseClient<Database>;
  userId: string;
};

async function loadMembership(
  clients: LibraryClients,
  workspaceId: string,
) {
  const { data, error } = await clients.actor
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", clients.userId)
    .maybeSingle();

  if (error) throw new LibraryError("CAPTURE_READ_FAILED", 500);
  if (!data) throw new LibraryError("CAPTURE_NOT_FOUND", 404);
  return data.role;
}

async function loadCapture(clients: LibraryClients, captureId: string) {
  const { data, error } = await clients.service
    .from("captures")
    .select(
      "id, workspace_id, project_id, title, raw_text, source_kind, created_at, updated_at",
    )
    .eq("id", captureId)
    .maybeSingle();

  if (error) throw new LibraryError("CAPTURE_READ_FAILED", 500);
  if (!data) throw new LibraryError("CAPTURE_NOT_FOUND", 404);
  return data;
}

async function requireCaptureRole(
  clients: LibraryClients,
  captureId: string,
  allowedRoles: Array<"owner" | "editor" | "viewer">,
) {
  const capture = await loadCapture(clients, captureId);
  const role = await loadMembership(clients, capture.workspace_id);
  if (!allowedRoles.includes(role)) {
    throw new LibraryError("LIBRARY_WRITE_FORBIDDEN", 403);
  }
  return { capture, role };
}

export async function getCaptureDetailRecord(
  clients: LibraryClients,
  captureId: string,
): Promise<CaptureDetail> {
  const { capture, role } = await requireCaptureRole(clients, captureId, [
    "owner",
    "editor",
    "viewer",
  ]);

  const [sourceResult, jobResult, nodesResult] = await Promise.all([
    clients.service
      .from("capture_sources")
      .select("label, url, provider, author, captured_at")
      .eq("capture_id", capture.id)
      .eq("workspace_id", capture.workspace_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    clients.service
      .from("processing_jobs")
      .select(
        "id, status, error_message, updated_at, retry_count, max_attempts",
      )
      .eq("capture_id", capture.id)
      .eq("workspace_id", capture.workspace_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    clients.service
      .from("nodes")
      .select("id", { count: "exact", head: true })
      .eq("capture_id", capture.id)
      .eq("workspace_id", capture.workspace_id),
  ]);

  if (sourceResult.error || jobResult.error || nodesResult.error) {
    throw new LibraryError("CAPTURE_READ_FAILED", 500);
  }

  const source = sourceResult.data;
  const job = jobResult.data;
  return {
    id: capture.id,
    workspaceId: capture.workspace_id,
    projectId: capture.project_id,
    title: capture.title,
    rawText: capture.raw_text,
    sourceKind: capture.source_kind,
    createdAt: capture.created_at,
    updatedAt: capture.updated_at,
    source: source
      ? {
          label: source.label,
          url: source.url,
          provider: source.provider,
          author: source.author,
          capturedAt: source.captured_at,
        }
      : null,
    processingJobId: job?.id ?? null,
    processingStatus: job?.status ?? null,
    processingError: job?.error_message ?? null,
    processingUpdatedAt: job?.updated_at ?? null,
    retryCount: job?.retry_count ?? 0,
    maxAttempts: job?.max_attempts ?? 0,
    derivedNodeCount: nodesResult.count ?? 0,
    canEdit: role === "owner" || role === "editor",
    canDelete: role === "owner",
  };
}

export async function updateCaptureTitleRecord(
  clients: LibraryClients,
  captureId: string,
  input: UpdateCaptureTitleInput,
): Promise<CaptureDetail> {
  const { capture } = await requireCaptureRole(clients, captureId, [
    "owner",
    "editor",
  ]);
  const { data, error } = await clients.service
    .from("captures")
    .update({ title: input.title, updated_at: new Date().toISOString() })
    .eq("id", capture.id)
    .eq("workspace_id", capture.workspace_id)
    .select("id")
    .maybeSingle();

  if (error) throw new LibraryError("CAPTURE_UPDATE_FAILED", 500);
  if (!data) throw new LibraryError("CAPTURE_NOT_FOUND", 404);
  return getCaptureDetailRecord(clients, capture.id);
}

export async function deleteCaptureRecord(
  clients: LibraryClients,
  captureId: string,
) {
  const { capture } = await requireCaptureRole(clients, captureId, ["owner"]);
  const { data, error } = await clients.service
    .rpc("delete_capture_lifecycle", {
      p_capture_id: capture.id,
      p_workspace_id: capture.workspace_id,
      p_actor_user_id: clients.userId,
    })
    .single();

  if (error || !data) throw new LibraryError("CAPTURE_DELETE_FAILED", 500);
  return { deletedCaptureId: data.deleted_capture_id };
}

export async function retryProcessingJobRecord(
  clients: LibraryClients,
  jobId: string,
) {
  const { data: job, error } = await clients.service
    .from("processing_jobs")
    .select("id, capture_id, workspace_id, status")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new LibraryError("PROCESSING_JOB_RETRY_FAILED", 500);
  if (!job) throw new LibraryError("PROCESSING_JOB_NOT_FOUND", 404);

  await requireCaptureRole(clients, job.capture_id, ["owner", "editor"]);
  const { data, error: retryError } = await clients.service
    .rpc("retry_processing_job_lifecycle", {
      p_job_id: job.id,
      p_workspace_id: job.workspace_id,
      p_actor_user_id: clients.userId,
    })
    .single();

  if (retryError || !data) {
    const message = retryError?.message ?? "";
    if (message.includes("PROCESSING_JOB_RETRY_NOT_ALLOWED")) {
      throw new LibraryError("PROCESSING_JOB_RETRY_NOT_ALLOWED", 409);
    }
    if (message.includes("RETRY_LIMIT_REACHED")) {
      throw new LibraryError("RETRY_LIMIT_REACHED", 409);
    }
    throw new LibraryError("PROCESSING_JOB_RETRY_FAILED", 500);
  }

  return {
    processingJob: {
      id: data.job_id,
      status: data.status,
      retryCount: data.retry_count,
      maxAttempts: data.max_attempts,
      nextRunAt: data.next_run_at,
    },
  };
}
