import type {
  CreateGraphEdgeInput,
  GraphPosition,
  UpdateGraphNodeInput,
} from "@/features/graph-mutations/model/schemas";
import type { EdgeKind } from "@/types/domain";

export type UpdateGraphNodeResponse = {
  node: {
    id: string;
    workspaceId: string;
    title: string;
    summary: string | null;
    position?: GraphPosition;
    updatedAt: string;
  };
};

export type CreateGraphEdgeResponse = {
  edge: {
    id: string;
    workspaceId: string;
    sourceNodeId: string;
    targetNodeId: string;
    kind: EdgeKind;
    label: string | null;
    createdAt: string;
  };
};

export class GraphMutationClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(code);
    this.name = "GraphMutationClientError";
  }
}

async function graphMutationRequest<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers:
      init.body === undefined
        ? init.headers
        : { "Content-Type": "application/json", ...init.headers },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      details?: unknown;
    } | null;
    throw new GraphMutationClientError(
      body?.error ?? "GRAPH_MUTATION_FAILED",
      response.status,
      body?.details,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function updateGraphNode(
  nodeId: string,
  input: UpdateGraphNodeInput,
): Promise<UpdateGraphNodeResponse> {
  return graphMutationRequest(`/api/graph/nodes/${encodeURIComponent(nodeId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteGraphNode(nodeId: string): Promise<void> {
  return graphMutationRequest(`/api/graph/nodes/${encodeURIComponent(nodeId)}`, {
    method: "DELETE",
  });
}

export function createGraphEdge(
  input: CreateGraphEdgeInput,
): Promise<CreateGraphEdgeResponse> {
  return graphMutationRequest("/api/graph/edges", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteGraphEdge(edgeId: string): Promise<void> {
  return graphMutationRequest(`/api/graph/edges/${encodeURIComponent(edgeId)}`, {
    method: "DELETE",
  });
}

export type { CreateGraphEdgeInput, UpdateGraphNodeInput };
