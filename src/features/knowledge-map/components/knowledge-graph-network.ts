import type {
  GraphEdge,
  GraphProjection,
  PositionedGraphNode,
} from "@/features/knowledge-map/model/graph";

export const KNOWLEDGE_GRAPH_VISIBLE_LIMIT = 50;
export const KNOWLEDGE_GRAPH_TOTAL_LIMIT = 200;

export type KnowledgeGraphCategory = "folder" | "material" | "concept";

export type KnowledgeGraphNetworkNode = PositionedGraphNode & {
  category: KnowledgeGraphCategory;
  networkPosition: { x: number; y: number };
  showLabel: boolean;
};

export type KnowledgeGraphNetwork = {
  edges: GraphEdge[];
  focusNodeId: string | null;
  nodes: KnowledgeGraphNetworkNode[];
  totalEligibleNodeCount: number;
  totalGraphNodeCount: number;
  truncated: boolean;
};

function stableNodeScore(node: PositionedGraphNode) {
  return node.importance * 100 + node.degree * 4;
}

function stableNodeOrder(left: PositionedGraphNode, right: PositionedGraphNode) {
  return (
    stableNodeScore(right) - stableNodeScore(left) ||
    left.title.localeCompare(right.title) ||
    left.id.localeCompare(right.id)
  );
}

export function knowledgeGraphCategory(
  node: Pick<PositionedGraphNode, "nodeKind" | "tone">,
): KnowledgeGraphCategory {
  const kind = node.nodeKind?.toLowerCase() ?? "";

  if (["folder", "collection", "project", "workspace"].includes(kind)) {
    return "folder";
  }

  if (node.tone === "source" || kind === "source_summary" || kind === "source") {
    return "material";
  }

  return "concept";
}

function buildAdjacency(nodes: PositionedGraphNode[], edges: GraphEdge[]) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) continue;
    adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
    adjacency.get(edge.targetNodeId)?.push(edge.sourceNodeId);
  }

  return adjacency;
}

function focusedNodeOrder(
  nodes: PositionedGraphNode[],
  edges: GraphEdge[],
  focusNodeId: string,
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = buildAdjacency(nodes, edges);
  const visited = new Set([focusNodeId]);
  const ordered = [focusNodeId];

  for (let index = 0; index < ordered.length; index += 1) {
    const nodeId = ordered[index];
    const neighbors = [...(adjacency.get(nodeId) ?? [])]
      .filter((id) => !visited.has(id))
      .sort((left, right) => {
        const leftNode = nodeById.get(left);
        const rightNode = nodeById.get(right);
        if (!leftNode || !rightNode) return left.localeCompare(right);
        return stableNodeOrder(leftNode, rightNode);
      });

    for (const neighbor of neighbors) {
      visited.add(neighbor);
      ordered.push(neighbor);
    }
  }

  return ordered
    .map((id) => nodeById.get(id))
    .filter((node): node is PositionedGraphNode => Boolean(node));
}

function forceNetworkPositions(nodes: PositionedGraphNode[], edges: GraphEdge[]) {
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  const positions = nodes.map((_, index) => {
    if (index === 0) return { x: 0, y: 0 };
    const angle = index * 2.399963229728653;
    const radius = 78 * Math.sqrt(index);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  const edgePairs = edges
    .map((edge) => [indexById.get(edge.sourceNodeId), indexById.get(edge.targetNodeId)] as const)
    .filter(
      (pair): pair is readonly [number, number] =>
        pair[0] !== undefined && pair[1] !== undefined,
    );

  for (let iteration = 0; iteration < 56; iteration += 1) {
    const forces = positions.map(() => ({ x: 0, y: 0 }));

    for (let left = 0; left < positions.length; left += 1) {
      for (let right = left + 1; right < positions.length; right += 1) {
        let dx = positions[left].x - positions[right].x;
        let dy = positions[left].y - positions[right].y;
        const distanceSquared = Math.max(900, dx * dx + dy * dy);
        const force = 4600 / distanceSquared;
        const distance = Math.sqrt(distanceSquared);
        dx /= distance;
        dy /= distance;
        forces[left].x += dx * force;
        forces[left].y += dy * force;
        forces[right].x -= dx * force;
        forces[right].y -= dy * force;
      }
    }

    for (const [sourceIndex, targetIndex] of edgePairs) {
      const dx = positions[targetIndex].x - positions[sourceIndex].x;
      const dy = positions[targetIndex].y - positions[sourceIndex].y;
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const spring = (distance - 142) * 0.006;
      const forceX = (dx / distance) * spring;
      const forceY = (dy / distance) * spring;
      forces[sourceIndex].x += forceX;
      forces[sourceIndex].y += forceY;
      forces[targetIndex].x -= forceX;
      forces[targetIndex].y -= forceY;
    }

    positions.forEach((position, index) => {
      if (index === 0) return;
      position.x += forces[index].x * 0.72 - position.x * 0.0025;
      position.y += forces[index].y * 0.72 - position.y * 0.0025;
      position.x = Math.max(-940, Math.min(940, position.x));
      position.y = Math.max(-680, Math.min(680, position.y));
    });
  }

  return new Map(nodes.map((node, index) => [node.id, positions[index]] as const));
}

export function buildKnowledgeGraphNetwork(
  graph: GraphProjection,
  {
    categories = ["folder", "material", "concept"],
    focusNodeId = null,
    maxTotal = KNOWLEDGE_GRAPH_TOTAL_LIMIT,
    maxVisible = KNOWLEDGE_GRAPH_VISIBLE_LIMIT,
  }: {
    categories?: readonly KnowledgeGraphCategory[];
    focusNodeId?: string | null;
    maxTotal?: number;
    maxVisible?: number;
  } = {},
): KnowledgeGraphNetwork {
  const categorySet = new Set(categories);
  const allEligibleNodes = graph.nodes
    .filter((node) => categorySet.has(knowledgeGraphCategory(node)))
    .sort(stableNodeOrder);
  const eligibleNodes = allEligibleNodes.slice(0, Math.max(1, maxTotal));
  const eligibleNodeIds = new Set(eligibleNodes.map((node) => node.id));
  const eligibleEdges = graph.edges.filter(
    (edge) =>
      eligibleNodeIds.has(edge.sourceNodeId) && eligibleNodeIds.has(edge.targetNodeId),
  );
  const validFocusId =
    focusNodeId && eligibleNodeIds.has(focusNodeId) ? focusNodeId : null;
  const orderedNodes = validFocusId
    ? focusedNodeOrder(eligibleNodes, eligibleEdges, validFocusId)
    : eligibleNodes;
  const visibleNodes = orderedNodes.slice(0, Math.max(1, maxVisible));
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = eligibleEdges.filter(
    (edge) =>
      visibleNodeIds.has(edge.sourceNodeId) && visibleNodeIds.has(edge.targetNodeId),
  );
  const positions = forceNetworkPositions(visibleNodes, visibleEdges);
  const labelNodeIds = new Set(
    [...visibleNodes].sort(stableNodeOrder).slice(0, 12).map((node) => node.id),
  );

  return {
    edges: visibleEdges,
    focusNodeId: validFocusId,
    nodes: visibleNodes.map((node) => ({
      ...node,
      category: knowledgeGraphCategory(node),
      networkPosition: positions.get(node.id) ?? { x: 0, y: 0 },
      showLabel: labelNodeIds.has(node.id) || node.id === validFocusId,
    })),
    totalEligibleNodeCount: allEligibleNodes.length,
    totalGraphNodeCount: graph.nodes.length,
    truncated: visibleNodes.length < allEligibleNodes.length,
  };
}

export function directlyRelatedNodeIds(
  edges: GraphEdge[],
  selectedId: string | null,
) {
  const related = new Set<string>();
  if (!selectedId) return related;

  for (const edge of edges) {
    if (edge.sourceNodeId === selectedId) related.add(edge.targetNodeId);
    if (edge.targetNodeId === selectedId) related.add(edge.sourceNodeId);
  }

  return related;
}
