import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeNodePosition, readNodePosition } from "@/features/graph-mutations/model/position";
import type {
  CreateGraphEdgeCommand,
  GraphPosition,
  UpdateGraphNodeCommand,
} from "@/features/graph-mutations/model/schemas";
import type { Database, Json } from "@/types/database";
import type { EdgeKind } from "@/types/domain";

export type GraphMutationErrorCode =
  | "AUTH_REQUIRED"
  | "GRAPH_CONFLICT"
  | "GRAPH_MUTATION_FAILED"
  | "GRAPH_RESOURCE_NOT_FOUND"
  | "GRAPH_WRITE_FORBIDDEN"
  | "SUPABASE_NOT_CONFIGURED";

export class GraphMutationError extends Error {
  constructor(
    public readonly code: GraphMutationErrorCode,
    public readonly status: number,
  ) {
    super(code);
    this.name = "GraphMutationError";
  }
}

export type GraphMutationClients = {
  actor: SupabaseClient<Database>;
  service: SupabaseClient<Database>;
  userId: string;
};

export type UpdatedGraphNode = {
  id: string;
  workspaceId: string;
  title: string;
  summary: string | null;
  position?: GraphPosition;
  updatedAt: string;
};

export type CreatedGraphEdge = {
  id: string;
  workspaceId: string;
  sourceNodeId: string;
  targetNodeId: string;
  kind: EdgeKind;
  label: string | null;
  origin: "user";
  createdAt: string;
};

async function assertWorkspaceEditor(
  actor: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
) {
  const { data: member, error } = await actor
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new GraphMutationError("GRAPH_MUTATION_FAILED", 500);
  }

  if (!member) {
    // Do not disclose whether a resource exists in another workspace.
    throw new GraphMutationError("GRAPH_RESOURCE_NOT_FOUND", 404);
  }

  if (member.role !== "owner" && member.role !== "editor") {
    throw new GraphMutationError("GRAPH_WRITE_FORBIDDEN", 403);
  }
}

async function loadNodeForMutation(
  clients: GraphMutationClients,
  nodeId: string,
) {
  const { data: node, error } = await clients.service
    .from("nodes")
    .select("id, workspace_id, title, summary, metadata, updated_at")
    .eq("id", nodeId)
    .maybeSingle();

  if (error) {
    throw new GraphMutationError("GRAPH_MUTATION_FAILED", 500);
  }

  if (!node) {
    throw new GraphMutationError("GRAPH_RESOURCE_NOT_FOUND", 404);
  }

  await assertWorkspaceEditor(clients.actor, clients.userId, node.workspace_id);
  return node;
}

async function loadEdgeForMutation(
  clients: GraphMutationClients,
  edgeId: string,
) {
  const { data: edge, error } = await clients.service
    .from("edges")
    .select("id, workspace_id")
    .eq("id", edgeId)
    .maybeSingle();

  if (error) {
    throw new GraphMutationError("GRAPH_MUTATION_FAILED", 500);
  }

  if (!edge) {
    throw new GraphMutationError("GRAPH_RESOURCE_NOT_FOUND", 404);
  }

  await assertWorkspaceEditor(clients.actor, clients.userId, edge.workspace_id);
  return edge;
}

export async function updateGraphNodeRecord(
  clients: GraphMutationClients,
  nodeId: string,
  input: UpdateGraphNodeCommand,
): Promise<UpdatedGraphNode> {
  const existing = await loadNodeForMutation(clients, nodeId);
  const update: Database["public"]["Tables"]["nodes"]["Update"] = {
    updated_at: new Date().toISOString(),
  };

  if (input.title !== undefined) update.title = input.title;
  if (input.summary !== undefined) update.summary = input.summary;
  if (input.position !== undefined) {
    update.metadata = mergeNodePosition(existing.metadata, input.position) as Json;
  }

  const { data: node, error } = await clients.service
    .from("nodes")
    .update(update)
    .eq("id", nodeId)
    .eq("workspace_id", existing.workspace_id)
    .select("id, workspace_id, title, summary, metadata, updated_at")
    .maybeSingle();

  if (error) {
    throw new GraphMutationError("GRAPH_MUTATION_FAILED", 500);
  }

  if (!node) {
    throw new GraphMutationError("GRAPH_RESOURCE_NOT_FOUND", 404);
  }

  return {
    id: node.id,
    workspaceId: node.workspace_id,
    title: node.title,
    summary: node.summary,
    position: readNodePosition(node.metadata),
    updatedAt: node.updated_at,
  };
}

export async function deleteGraphNodeRecord(
  clients: GraphMutationClients,
  nodeId: string,
): Promise<void> {
  const existing = await loadNodeForMutation(clients, nodeId);
  const { data, error } = await clients.service
    .from("nodes")
    .delete()
    .eq("id", nodeId)
    .eq("workspace_id", existing.workspace_id)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new GraphMutationError("GRAPH_MUTATION_FAILED", 500);
  }

  if (!data) {
    throw new GraphMutationError("GRAPH_RESOURCE_NOT_FOUND", 404);
  }
}

export async function createGraphEdgeRecord(
  clients: GraphMutationClients,
  input: CreateGraphEdgeCommand,
): Promise<CreatedGraphEdge> {
  await assertWorkspaceEditor(clients.actor, clients.userId, input.workspaceId);

  const nodeIds = [input.sourceNodeId, input.targetNodeId];
  const { data: nodes, error: nodesError } = await clients.service
    .from("nodes")
    .select("id, workspace_id")
    .in("id", nodeIds);

  if (nodesError) {
    throw new GraphMutationError("GRAPH_MUTATION_FAILED", 500);
  }

  const nodesById = new Map((nodes ?? []).map((node) => [node.id, node]));
  const sourceNode = nodesById.get(input.sourceNodeId);
  const targetNode = nodesById.get(input.targetNodeId);

  if (
    !sourceNode ||
    !targetNode ||
    sourceNode.workspace_id !== input.workspaceId ||
    targetNode.workspace_id !== input.workspaceId
  ) {
    throw new GraphMutationError("GRAPH_RESOURCE_NOT_FOUND", 404);
  }

  const { data: edge, error } = await clients.service
    .from("edges")
    .insert({
      workspace_id: input.workspaceId,
      source_node_id: input.sourceNodeId,
      target_node_id: input.targetNodeId,
      kind: input.kind,
      label: input.label ?? null,
      metadata: {
        origin: "user",
        createdBy: clients.userId,
      } as Json,
    })
    .select("id, workspace_id, source_node_id, target_node_id, kind, label, created_at")
    .single();

  if (error || !edge) {
    const status = error?.code === "23503" || error?.code === "23514" ? 409 : 500;
    throw new GraphMutationError(
      status === 409 ? "GRAPH_CONFLICT" : "GRAPH_MUTATION_FAILED",
      status,
    );
  }

  return {
    id: edge.id,
    workspaceId: edge.workspace_id,
    sourceNodeId: edge.source_node_id,
    targetNodeId: edge.target_node_id,
    kind: edge.kind,
    label: edge.label,
    origin: "user",
    createdAt: edge.created_at,
  };
}

export async function deleteGraphEdgeRecord(
  clients: GraphMutationClients,
  edgeId: string,
): Promise<void> {
  const existing = await loadEdgeForMutation(clients, edgeId);
  const { data, error } = await clients.service
    .from("edges")
    .delete()
    .eq("id", edgeId)
    .eq("workspace_id", existing.workspace_id)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new GraphMutationError("GRAPH_MUTATION_FAILED", 500);
  }

  if (!data) {
    throw new GraphMutationError("GRAPH_RESOURCE_NOT_FOUND", 404);
  }
}
