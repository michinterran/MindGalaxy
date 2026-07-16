import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assignCaptureTopicInputSchema,
  captureTopicAssignmentsInputSchema,
  captureCalendarFilterSchema,
  createFolderInputSchema,
  createTopicInputSchema,
  deleteFolderInputSchema,
  moveCaptureToFolderInputSchema,
  renameFolderInputSchema,
  type CalendarCapturePage,
  type CaptureTopicAssignmentsInput,
  type CaptureCalendarFilter,
  type CreateFolderInput,
  type CreateTopicInput,
  type DeleteFolderInput,
  type FolderRecord,
  type MoveCaptureToFolderInput,
  type RenameFolderInput,
  type TopicRecord,
} from "@/features/library/model/organization";
import { libraryIdSchema } from "@/features/library/model/schemas";
import type { Database } from "@/types/database";

export type OrganizationErrorCode =
  | "ORGANIZATION_CONFLICT"
  | "ORGANIZATION_READ_FAILED"
  | "ORGANIZATION_RESOURCE_NOT_FOUND"
  | "ORGANIZATION_WRITE_FAILED"
  | "ORGANIZATION_WRITE_FORBIDDEN";

export class OrganizationError extends Error {
  constructor(
    public readonly code: OrganizationErrorCode,
    public readonly status: number,
  ) {
    super(code);
    this.name = "OrganizationError";
  }
}

export type OrganizationClients = {
  actor: SupabaseClient<Database>;
  service: SupabaseClient<Database>;
  userId: string;
};

function folderRecord(row: Database["public"]["Tables"]["folders"]["Row"]): FolderRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    parentId: row.parent_id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function topicRecord(row: Database["public"]["Tables"]["contexts"]["Row"]): TopicRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    label: row.label,
    normalizedValue: row.normalized_value,
    createdAt: row.created_at,
  };
}

async function assertWorkspaceEditor(
  clients: OrganizationClients,
  workspaceId: string,
) {
  const { data: membership, error } = await clients.actor
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", clients.userId)
    .maybeSingle();

  if (error) throw new OrganizationError("ORGANIZATION_READ_FAILED", 500);
  if (!membership) {
    throw new OrganizationError("ORGANIZATION_RESOURCE_NOT_FOUND", 404);
  }
  if (membership.role !== "owner" && membership.role !== "editor") {
    throw new OrganizationError("ORGANIZATION_WRITE_FORBIDDEN", 403);
  }
}

async function loadCaptureScope(
  clients: OrganizationClients,
  captureId: string,
) {
  const { data, error } = await clients.service
    .from("captures")
    .select("id, workspace_id, folder_id")
    .eq("id", captureId)
    .maybeSingle();

  if (error) throw new OrganizationError("ORGANIZATION_READ_FAILED", 500);
  if (!data) throw new OrganizationError("ORGANIZATION_RESOURCE_NOT_FOUND", 404);
  return data;
}

async function assertFolderInWorkspace(
  clients: OrganizationClients,
  folderId: string,
  workspaceId: string,
) {
  const { data, error } = await clients.service
    .from("folders")
    .select("id")
    .eq("id", folderId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw new OrganizationError("ORGANIZATION_READ_FAILED", 500);
  if (!data) throw new OrganizationError("ORGANIZATION_RESOURCE_NOT_FOUND", 404);
}

async function loadFolderScope(
  clients: OrganizationClients,
  folderId: string,
) {
  const { data, error } = await clients.service
    .from("folders")
    .select("id, workspace_id, parent_id, name, sort_order, created_at, updated_at")
    .eq("id", folderId)
    .maybeSingle();

  if (error) throw new OrganizationError("ORGANIZATION_READ_FAILED", 500);
  if (!data) throw new OrganizationError("ORGANIZATION_RESOURCE_NOT_FOUND", 404);
  return data;
}

export async function listFolderRecords(
  clients: OrganizationClients,
  workspaceIdInput: string,
): Promise<FolderRecord[]> {
  const workspaceId = libraryIdSchema.parse(workspaceIdInput);
  const { data, error } = await clients.actor
    .from("folders")
    .select("id, workspace_id, parent_id, name, sort_order, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new OrganizationError("ORGANIZATION_READ_FAILED", 500);
  return (data ?? []).map(folderRecord);
}

export async function createFolderRecord(
  clients: OrganizationClients,
  inputValue: CreateFolderInput,
): Promise<FolderRecord> {
  const input = createFolderInputSchema.parse(inputValue);
  await assertWorkspaceEditor(clients, input.workspaceId);
  if (input.parentId) {
    await assertFolderInWorkspace(clients, input.parentId, input.workspaceId);
  }

  const { data, error } = await clients.service
    .from("folders")
    .insert({
      workspace_id: input.workspaceId,
      parent_id: input.parentId ?? null,
      name: input.name,
      sort_order: input.sortOrder,
    })
    .select("id, workspace_id, parent_id, name, sort_order, created_at, updated_at")
    .single();

  if (error || !data) {
    const isConflict = error?.code === "23503" || error?.code === "23514";
    throw new OrganizationError(
      isConflict ? "ORGANIZATION_CONFLICT" : "ORGANIZATION_WRITE_FAILED",
      isConflict ? 409 : 500,
    );
  }
  return folderRecord(data);
}

export async function listTopicRecords(
  clients: OrganizationClients,
  workspaceIdInput: string,
): Promise<TopicRecord[]> {
  const workspaceId = libraryIdSchema.parse(workspaceIdInput);
  const { data, error } = await clients.actor
    .from("contexts")
    .select("id, workspace_id, kind, label, normalized_value, metadata, created_at")
    .eq("workspace_id", workspaceId)
    .eq("kind", "topic")
    .order("label", { ascending: true });

  if (error) throw new OrganizationError("ORGANIZATION_READ_FAILED", 500);
  return (data ?? []).map(topicRecord);
}

export async function createTopicRecord(
  clients: OrganizationClients,
  inputValue: CreateTopicInput,
): Promise<TopicRecord> {
  const input = createTopicInputSchema.parse(inputValue);

  // Keep this write inside the caller's RLS boundary. The migration grants
  // only the required context columns and permits only kind=topic to editors.
  const { data, error } = await clients.actor
    .from("contexts")
    .insert({
      workspace_id: input.workspaceId,
      kind: "topic",
      label: input.label,
      normalized_value: input.label.toLowerCase(),
      metadata: { source: "manual" },
    })
    .select("id, workspace_id, kind, label, normalized_value, metadata, created_at")
    .single();

  if (error || !data) {
    const isForbidden = error?.code === "42501";
    throw new OrganizationError(
      isForbidden ? "ORGANIZATION_WRITE_FORBIDDEN" : "ORGANIZATION_WRITE_FAILED",
      isForbidden ? 403 : 500,
    );
  }

  return topicRecord(data);
}

export async function renameFolderRecord(
  clients: OrganizationClients,
  inputValue: RenameFolderInput,
): Promise<FolderRecord> {
  const input = renameFolderInputSchema.parse(inputValue);
  const folder = await loadFolderScope(clients, input.folderId);
  await assertWorkspaceEditor(clients, folder.workspace_id);

  const { data, error } = await clients.service
    .from("folders")
    .update({ name: input.name, updated_at: new Date().toISOString() })
    .eq("id", folder.id)
    .eq("workspace_id", folder.workspace_id)
    .select("id, workspace_id, parent_id, name, sort_order, created_at, updated_at")
    .maybeSingle();

  if (error) throw new OrganizationError("ORGANIZATION_WRITE_FAILED", 500);
  if (!data) throw new OrganizationError("ORGANIZATION_RESOURCE_NOT_FOUND", 404);
  return folderRecord(data);
}

export async function deleteFolderRecord(
  clients: OrganizationClients,
  inputValue: DeleteFolderInput,
) {
  const input = deleteFolderInputSchema.parse(inputValue);
  const folder = await loadFolderScope(clients, input.folderId);
  await assertWorkspaceEditor(clients, folder.workspace_id);

  const { error } = await clients.service
    .from("folders")
    .delete()
    .eq("id", folder.id)
    .eq("workspace_id", folder.workspace_id);

  if (error) throw new OrganizationError("ORGANIZATION_WRITE_FAILED", 500);
  return { folderId: folder.id, workspaceId: folder.workspace_id };
}

export async function listCaptureTopicAssignments(
  clients: OrganizationClients,
  inputValue: CaptureTopicAssignmentsInput,
): Promise<Record<string, string[]>> {
  const input = captureTopicAssignmentsInputSchema.parse(inputValue);
  const { data, error } = await clients.actor
    .from("capture_topics")
    .select("capture_id, topic_context_id")
    .eq("workspace_id", input.workspaceId)
    .in("capture_id", input.captureIds)
    .limit(1000);

  if (error) throw new OrganizationError("ORGANIZATION_READ_FAILED", 500);
  const assignments = Object.fromEntries(
    input.captureIds.map((captureId) => [captureId, [] as string[]]),
  );
  for (const row of data ?? []) {
    assignments[row.capture_id]?.push(row.topic_context_id);
  }
  return assignments;
}

export async function moveCaptureToFolderRecord(
  clients: OrganizationClients,
  inputValue: MoveCaptureToFolderInput,
) {
  const input = moveCaptureToFolderInputSchema.parse(inputValue);
  const capture = await loadCaptureScope(clients, input.captureId);
  await assertWorkspaceEditor(clients, capture.workspace_id);
  if (input.folderId) {
    await assertFolderInWorkspace(clients, input.folderId, capture.workspace_id);
  }

  const { data, error } = await clients.service
    .from("captures")
    .update({ folder_id: input.folderId, updated_at: new Date().toISOString() })
    .eq("id", capture.id)
    .eq("workspace_id", capture.workspace_id)
    .select("id, workspace_id, folder_id")
    .maybeSingle();

  if (error) {
    const isConflict = error.code === "23503";
    throw new OrganizationError(
      isConflict ? "ORGANIZATION_CONFLICT" : "ORGANIZATION_WRITE_FAILED",
      isConflict ? 409 : 500,
    );
  }
  if (!data) throw new OrganizationError("ORGANIZATION_RESOURCE_NOT_FOUND", 404);
  return { captureId: data.id, workspaceId: data.workspace_id, folderId: data.folder_id };
}

export async function assignCaptureTopicRecord(
  clients: OrganizationClients,
  inputValue: { captureId: string; topicContextId: string },
) {
  const input = assignCaptureTopicInputSchema.parse(inputValue);
  const capture = await loadCaptureScope(clients, input.captureId);
  await assertWorkspaceEditor(clients, capture.workspace_id);

  const { data: topic, error: topicError } = await clients.service
    .from("contexts")
    .select("id, workspace_id, kind")
    .eq("id", input.topicContextId)
    .eq("workspace_id", capture.workspace_id)
    .eq("kind", "topic")
    .maybeSingle();

  if (topicError) throw new OrganizationError("ORGANIZATION_READ_FAILED", 500);
  if (!topic) throw new OrganizationError("ORGANIZATION_RESOURCE_NOT_FOUND", 404);

  const { error } = await clients.service.from("capture_topics").upsert(
    {
      capture_id: capture.id,
      topic_context_id: topic.id,
      workspace_id: capture.workspace_id,
      topic_kind: "topic",
      assigned_by: clients.userId,
    },
    { onConflict: "capture_id,topic_context_id", ignoreDuplicates: true },
  );

  if (error) {
    const isConflict = error.code === "23503" || error.code === "23514";
    throw new OrganizationError(
      isConflict ? "ORGANIZATION_CONFLICT" : "ORGANIZATION_WRITE_FAILED",
      isConflict ? 409 : 500,
    );
  }

  return {
    captureId: capture.id,
    topicContextId: topic.id,
    workspaceId: capture.workspace_id,
  };
}

export async function removeCaptureTopicRecord(
  clients: OrganizationClients,
  inputValue: { captureId: string; topicContextId: string },
) {
  const input = assignCaptureTopicInputSchema.parse(inputValue);
  const capture = await loadCaptureScope(clients, input.captureId);
  await assertWorkspaceEditor(clients, capture.workspace_id);

  const { error } = await clients.service
    .from("capture_topics")
    .delete()
    .eq("capture_id", capture.id)
    .eq("topic_context_id", input.topicContextId)
    .eq("workspace_id", capture.workspace_id);

  if (error) throw new OrganizationError("ORGANIZATION_WRITE_FAILED", 500);
}

export async function listCalendarCaptureRecords(
  clients: OrganizationClients,
  inputValue: CaptureCalendarFilter,
): Promise<CalendarCapturePage> {
  const input = captureCalendarFilterSchema.parse(inputValue);
  let topicCaptureIds: string[] | null = null;

  if (input.topicContextId) {
    const { data, error } = await clients.actor
      .from("capture_topics")
      .select("capture_id")
      .eq("workspace_id", input.workspaceId)
      .eq("topic_context_id", input.topicContextId);
    if (error) throw new OrganizationError("ORGANIZATION_READ_FAILED", 500);
    topicCaptureIds = (data ?? []).map((row) => row.capture_id);
    if (!topicCaptureIds.length) return { records: [], totalCount: 0, hasMore: false };
  }

  let query = clients.actor
    .from("captures")
    .select("id, workspace_id, folder_id, title, source_kind, created_at", { count: "exact" })
    .eq("workspace_id", input.workspaceId)
    .gte("created_at", input.from)
    .lt("created_at", input.toExclusive);

  if (input.folderId === null) query = query.is("folder_id", null);
  else if (input.folderId) query = query.eq("folder_id", input.folderId);
  if (topicCaptureIds) query = query.in("id", topicCaptureIds);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .limit(input.limit);
  if (error) throw new OrganizationError("ORGANIZATION_READ_FAILED", 500);

  const records = (data ?? []).map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    folderId: row.folder_id,
    title: row.title,
    sourceKind: row.source_kind,
    createdAt: row.created_at,
  }));
  const totalCount = count ?? records.length;
  return { records, totalCount, hasMore: totalCount > records.length };
}

export async function updateCaptureOrganizationRecord(
  clients: OrganizationClients,
  input: {
    captureId: string;
    folderId?: string | null;
    topicIds?: string[];
  },
) {
  const captureId = libraryIdSchema.parse(input.captureId);
  const folderId = input.folderId === undefined ? undefined : input.folderId === null
    ? null
    : libraryIdSchema.parse(input.folderId);
  const topicIds = input.topicIds?.map((topicId) => libraryIdSchema.parse(topicId));
  const { data, error } = await clients.service.rpc("update_capture_organization", {
    p_capture_id: captureId,
    p_actor_user_id: clients.userId,
    p_folder_id_provided: input.folderId !== undefined,
    p_folder_id: folderId ?? null,
    p_topic_ids: topicIds ?? null,
  });

  if (error || data !== true) {
    const isForbidden = error?.code === "42501";
    const isMissing = error?.code === "23503" || error?.code === "P0002";
    throw new OrganizationError(
      isForbidden
        ? "ORGANIZATION_WRITE_FORBIDDEN"
        : isMissing
          ? "ORGANIZATION_RESOURCE_NOT_FOUND"
          : "ORGANIZATION_WRITE_FAILED",
      isForbidden ? 403 : isMissing ? 404 : 500,
    );
  }
  return { captureId, folderId: input.folderId, topicIds: input.topicIds };
}
