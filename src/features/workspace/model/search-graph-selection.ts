import type { GraphNode } from "@/features/knowledge-map/model/graph";
import type { SearchResult } from "@/features/search/model/schemas";
import type { WorkspaceArea } from "@/features/workspace/model/navigation";

type SearchGraphNode = Pick<GraphNode, "captureId" | "id">;
type SearchGraphResult = Pick<
  SearchResult,
  "captureId" | "resultId" | "sourceType"
>;

export function graphNodeIdsForSearchResults(
  nodes: readonly SearchGraphNode[],
  results: readonly SearchGraphResult[],
) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const captureIds = new Set<string>();
  const highlightedNodeIds = new Set<string>();

  for (const result of results) {
    if (result.resultId.startsWith("node:")) {
      const nodeId = result.resultId.slice("node:".length);
      if (nodeIds.has(nodeId)) highlightedNodeIds.add(nodeId);
    }

    const captureId =
      result.captureId ??
      (result.resultId.startsWith("capture:")
        ? result.resultId.slice("capture:".length)
        : null);
    if (result.sourceType === "capture" && captureId) captureIds.add(captureId);
  }

  if (captureIds.size) {
    for (const node of nodes) {
      if (node.captureId && captureIds.has(node.captureId)) {
        highlightedNodeIds.add(node.id);
      }
    }
  }

  return highlightedNodeIds;
}

export function mapViewForSearchSelection(
  activeArea: WorkspaceArea,
  currentView: "galaxy" | "graph" | "list" | "mindmap",
) {
  return activeArea === "knowledge" && currentView === "graph"
    ? "graph"
    : "mindmap";
}
