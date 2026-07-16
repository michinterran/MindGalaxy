import type {
  GraphEdge,
  GraphProjection,
  PositionedGraphNode,
} from "@/features/knowledge-map/model/graph";

export const KNOWLEDGE_GRAPH_VISIBLE_LIMIT = 50;
export const KNOWLEDGE_GRAPH_TOTAL_LIMIT = 200;

export type KnowledgeGraphCategory = "folder" | "material" | "concept";
export type KnowledgeGraphHopDepth = "all" | 1 | 2 | 3;
export type KnowledgeGraphOrphanMode = "include" | "only";
export type KnowledgeGraphScope = {
  dateKey?: string | null;
  folderNodeId?: string | null;
  topicNodeId?: string | null;
};

export type KnowledgeGraphNetworkNode = PositionedGraphNode & {
  category: KnowledgeGraphCategory;
  networkPosition: { x: number; y: number };
  orphan: boolean;
  searchHighlighted: boolean;
  showLabel: boolean;
};

export type KnowledgeGraphNetwork = {
  edges: GraphEdge[];
  focusNodeId: string | null;
  nodes: KnowledgeGraphNetworkNode[];
  orphanCount: number;
  totalEligibleNodeCount: number;
  totalGraphNodeCount: number;
  truncated: boolean;
};

export function knowledgeGraphSearchResetKey(
  highlightedNodeIds: ReadonlySet<string> | undefined,
) {
  if (!highlightedNodeIds?.size) return "search:none";
  return `search:${[...highlightedNodeIds].sort().join("|")}`;
}

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
  hopDepth: KnowledgeGraphHopDepth,
  highlightedNodeIds: ReadonlySet<string>,
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = buildAdjacency(nodes, edges);
  const visited = new Set([focusNodeId]);
  const queue = [{ depth: 0, id: focusNodeId }];
  const ordered = [focusNodeId];

  for (let index = 0; index < queue.length; index += 1) {
    const { depth, id: nodeId } = queue[index];
    if (hopDepth !== "all" && depth >= hopDepth) continue;
    const neighbors = [...(adjacency.get(nodeId) ?? [])]
      .filter((id) => !visited.has(id))
      .sort((left, right) => {
        const highlightOrder =
          Number(highlightedNodeIds.has(right)) - Number(highlightedNodeIds.has(left));
        if (highlightOrder) return highlightOrder;
        const leftNode = nodeById.get(left);
        const rightNode = nodeById.get(right);
        if (!leftNode || !rightNode) return left.localeCompare(right);
        return stableNodeOrder(leftNode, rightNode);
      });

    for (const neighbor of neighbors) {
      visited.add(neighbor);
      ordered.push(neighbor);
      queue.push({ depth: depth + 1, id: neighbor });
    }
  }

  return ordered
    .map((id) => nodeById.get(id))
    .filter((node): node is PositionedGraphNode => Boolean(node));
}

function captureDateKey(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function intersectSets(sets: ReadonlySet<string>[]) {
  if (!sets.length) return null;
  const [first, ...rest] = sets;
  return new Set([...first].filter((value) => rest.every((set) => set.has(value))));
}

function captureIdsForFolder(
  nodes: PositionedGraphNode[],
  edges: GraphEdge[],
  folderNodeId: string,
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const folderIds = new Set([folderNodeId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const edge of edges) {
      if (!edge.id.startsWith("projection:folder-parent:")) continue;
      if (!folderIds.has(edge.sourceNodeId) || folderIds.has(edge.targetNodeId)) continue;
      folderIds.add(edge.targetNodeId);
      changed = true;
    }
  }

  const captureIds = new Set<string>();
  for (const edge of edges) {
    if (!edge.id.startsWith("projection:folder-capture:")) continue;
    if (!folderIds.has(edge.sourceNodeId)) continue;
    const captureId = nodeById.get(edge.targetNodeId)?.captureId;
    if (captureId) captureIds.add(captureId);
  }

  return { captureIds, folderIds };
}

function captureIdsForTopic(
  nodes: PositionedGraphNode[],
  edges: GraphEdge[],
  topicNodeId: string,
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const captureIds = new Set<string>();

  for (const edge of edges) {
    if (!edge.id.startsWith("projection:topic-capture:")) continue;
    if (edge.sourceNodeId !== topicNodeId) continue;
    const captureId = nodeById.get(edge.targetNodeId)?.captureId;
    if (captureId) captureIds.add(captureId);
  }

  return captureIds;
}

function scopeGraphNodes(graph: GraphProjection, scope: KnowledgeGraphScope) {
  const dateKey = scope.dateKey?.trim() || null;
  const folderNodeId = scope.folderNodeId || null;
  const topicNodeId = scope.topicNodeId || null;
  if (!dateKey && !folderNodeId && !topicNodeId) return graph.nodes;

  const captureSets: ReadonlySet<string>[] = [];
  let folderIds = new Set<string>();

  if (dateKey) {
    captureSets.push(
      new Set(
        graph.nodes
          .filter((node) => captureDateKey(node.captureCreatedAt) === dateKey)
          .flatMap((node) => (node.captureId ? [node.captureId] : [])),
      ),
    );
  }
  if (folderNodeId) {
    const folderScope = captureIdsForFolder(graph.nodes, graph.edges, folderNodeId);
    folderIds = folderScope.folderIds;
    captureSets.push(folderScope.captureIds);
  }
  if (topicNodeId) {
    captureSets.push(captureIdsForTopic(graph.nodes, graph.edges, topicNodeId));
  }

  const captureIds = intersectSets(captureSets) ?? new Set<string>();
  const allowedNodeIds = new Set(
    graph.nodes
      .filter((node) => node.captureId && captureIds.has(node.captureId))
      .map((node) => node.id),
  );
  for (const folderId of folderIds) allowedNodeIds.add(folderId);
  if (folderNodeId) allowedNodeIds.add(folderNodeId);
  if (topicNodeId) allowedNodeIds.add(topicNodeId);

  for (const edge of graph.edges) {
    if (
      (edge.id.startsWith("projection:folder-capture:") ||
        edge.id.startsWith("projection:topic-capture:")) &&
      allowedNodeIds.has(edge.targetNodeId)
    ) {
      allowedNodeIds.add(edge.sourceNodeId);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of graph.edges) {
      if (!edge.id.startsWith("projection:folder-parent:")) continue;
      if (!allowedNodeIds.has(edge.targetNodeId) || allowedNodeIds.has(edge.sourceNodeId)) {
        continue;
      }
      allowedNodeIds.add(edge.sourceNodeId);
      changed = true;
    }
  }

  return graph.nodes.filter((node) => allowedNodeIds.has(node.id));
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
    highlightedNodeIds = new Set<string>(),
    hopDepth = "all",
    maxTotal = KNOWLEDGE_GRAPH_TOTAL_LIMIT,
    maxVisible = KNOWLEDGE_GRAPH_VISIBLE_LIMIT,
    orphanMode = "include",
    scope = {},
  }: {
    categories?: readonly KnowledgeGraphCategory[];
    focusNodeId?: string | null;
    highlightedNodeIds?: ReadonlySet<string>;
    hopDepth?: KnowledgeGraphHopDepth;
    maxTotal?: number;
    maxVisible?: number;
    orphanMode?: KnowledgeGraphOrphanMode;
    scope?: KnowledgeGraphScope;
  } = {},
): KnowledgeGraphNetwork {
  const categorySet = new Set(categories);
  const graphDegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.edges) {
    graphDegree.set(edge.sourceNodeId, (graphDegree.get(edge.sourceNodeId) ?? 0) + 1);
    graphDegree.set(edge.targetNodeId, (graphDegree.get(edge.targetNodeId) ?? 0) + 1);
  }
  const scopedCategoryNodes = scopeGraphNodes(graph, scope).filter((node) =>
    categorySet.has(knowledgeGraphCategory(node)),
  );
  const orphanCount = scopedCategoryNodes.filter(
    (node) => (graphDegree.get(node.id) ?? 0) === 0,
  ).length;
  const allEligibleNodes = scopedCategoryNodes
    .filter(
      (node) => orphanMode === "include" || (graphDegree.get(node.id) ?? 0) === 0,
    )
    .sort((left, right) => {
      const highlightOrder =
        Number(highlightedNodeIds.has(right.id)) -
        Number(highlightedNodeIds.has(left.id));
      return highlightOrder || stableNodeOrder(left, right);
    });
  const eligibleNodes = allEligibleNodes.slice(0, Math.max(1, maxTotal));
  const eligibleNodeIds = new Set(eligibleNodes.map((node) => node.id));
  const eligibleEdges = graph.edges.filter(
    (edge) =>
      eligibleNodeIds.has(edge.sourceNodeId) && eligibleNodeIds.has(edge.targetNodeId),
  );
  const validFocusId =
    focusNodeId && eligibleNodeIds.has(focusNodeId) ? focusNodeId : null;
  const orderedNodes = validFocusId
    ? focusedNodeOrder(
        eligibleNodes,
        eligibleEdges,
        validFocusId,
        hopDepth,
        highlightedNodeIds,
      )
    : eligibleNodes;
  const visibleNodes = orderedNodes.slice(0, Math.max(1, maxVisible));
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = eligibleEdges.filter(
    (edge) =>
      visibleNodeIds.has(edge.sourceNodeId) && visibleNodeIds.has(edge.targetNodeId),
  );
  const positions = forceNetworkPositions(visibleNodes, visibleEdges);
  const labelNodeIds = new Set(
    [...visibleNodes]
      .sort((left, right) => {
        const highlightOrder =
          Number(highlightedNodeIds.has(right.id)) -
          Number(highlightedNodeIds.has(left.id));
        return highlightOrder || stableNodeOrder(left, right);
      })
      .slice(0, 12)
      .map((node) => node.id),
  );

  return {
    edges: visibleEdges,
    focusNodeId: validFocusId,
    nodes: visibleNodes.map((node) => ({
      ...node,
      category: knowledgeGraphCategory(node),
      networkPosition: positions.get(node.id) ?? { x: 0, y: 0 },
      orphan: (graphDegree.get(node.id) ?? 0) === 0,
      searchHighlighted: highlightedNodeIds.has(node.id),
      showLabel:
        labelNodeIds.has(node.id) ||
        node.id === validFocusId ||
        highlightedNodeIds.has(node.id),
    })),
    orphanCount,
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
