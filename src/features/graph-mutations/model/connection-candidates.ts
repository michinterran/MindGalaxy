import {
  canMutateGraphNode,
  type GraphEdge,
  type GraphNode,
} from "@/features/knowledge-map/model/graph";

/**
 * Graph read-model projections (folder/topic/unprocessed capture) do not exist
 * in `public.nodes`; mutation APIs must only receive durable node IDs.
 */
export function connectionCandidatesForNode(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  selectedId: string,
) {
  const linkedNodeIds = new Set<string>();

  for (const edge of edges) {
    if (edge.sourceNodeId === selectedId) linkedNodeIds.add(edge.targetNodeId);
    if (edge.targetNodeId === selectedId) linkedNodeIds.add(edge.sourceNodeId);
  }

  return nodes.filter(
    (candidate) =>
      candidate.id !== selectedId &&
      canMutateGraphNode(candidate.id) &&
      !linkedNodeIds.has(candidate.id),
  );
}
