import type {
  GraphEdge,
  GraphProjection,
  GraphSnapshot,
  MindMapProjectedNode,
  MindMapProjection,
  MindMapProjectionOptions,
  PositionedGraphNode,
} from "@/features/knowledge-map/model/graph";
import { MIND_MAP_UNORGANIZED_GROUP_ID } from "@/features/knowledge-map/model/graph";

type LayoutOverride = Partial<
  Record<
    string,
    {
      mindMap: { x: number; y: number };
      galaxy: readonly [number, number, number];
    }
  >
>;

type GraphMetrics = {
  indegree: Map<string, number>;
  outdegree: Map<string, number>;
  degree: Map<string, number>;
  adjacency: Map<string, string[]>;
  outgoing: Map<string, string[]>;
};

const MAX_GALAXY_NODES = 80;
const LEVEL_X_SPACING = 360;
const NODE_Y_SPACING = 150;
const COMPONENT_Y_SPACING = 220;
const DEFAULT_MIND_MAP_DEPTH = 2;
const DEFAULT_MIND_MAP_INITIAL_CAP = 15;
const DEFAULT_MIND_MAP_MAX_CAP = 30;
const DEFAULT_MIND_MAP_BRANCH_LIMIT = 7;

function byStableNodeOrder(a: { id: string; title: string }, b: { id: string; title: string }) {
  return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function validEdges(snapshot: GraphSnapshot) {
  const nodeIds = new Set(snapshot.nodes.map((node) => node.id));

  return snapshot.edges.filter(
    (edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId),
  );
}

function buildMetrics(nodes: GraphSnapshot["nodes"], edges: GraphEdge[]): GraphMetrics {
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outdegree = new Map(nodes.map((node) => [node.id, 0]));
  const degree = new Map(nodes.map((node) => [node.id, 0]));
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of edges) {
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1);
    outdegree.set(edge.sourceNodeId, (outdegree.get(edge.sourceNodeId) ?? 0) + 1);
    degree.set(edge.sourceNodeId, (degree.get(edge.sourceNodeId) ?? 0) + 1);
    degree.set(edge.targetNodeId, (degree.get(edge.targetNodeId) ?? 0) + 1);
    adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
    adjacency.get(edge.targetNodeId)?.push(edge.sourceNodeId);
    outgoing.get(edge.sourceNodeId)?.push(edge.targetNodeId);
  }

  for (const node of nodes) {
    adjacency.get(node.id)?.sort();
    outgoing.get(node.id)?.sort();
  }

  return { indegree, outdegree, degree, adjacency, outgoing };
}

type RootedMindMapTree = {
  childrenById: Map<string, string[]>;
  componentNodeIds: Set<string>;
  levelById: Map<string, number>;
  parentEdgeById: Map<string, GraphEdge>;
};

function normalizedInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return clamp(Math.floor(value), min, max);
}

function buildRootedMindMapTree(
  nodes: PositionedGraphNode[],
  edges: GraphEdge[],
  rootId: string,
): RootedMindMapTree {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map(
    nodes.map((node) => [
      node.id,
      [] as Array<{ edge: GraphEdge; neighborId: string; followsDirection: boolean }>,
    ]),
  );

  for (const edge of edges) {
    if (!nodeById.has(edge.sourceNodeId) || !nodeById.has(edge.targetNodeId)) continue;
    adjacency.get(edge.sourceNodeId)?.push({
      edge,
      neighborId: edge.targetNodeId,
      followsDirection: true,
    });
    adjacency.get(edge.targetNodeId)?.push({
      edge,
      neighborId: edge.sourceNodeId,
      followsDirection: false,
    });
  }

  for (const neighbors of adjacency.values()) {
    neighbors.sort((left, right) => {
      const leftNode = nodeById.get(left.neighborId);
      const rightNode = nodeById.get(right.neighborId);
      if (!leftNode || !rightNode) return left.neighborId.localeCompare(right.neighborId);

      return (
        Number(right.followsDirection) - Number(left.followsDirection) ||
        rightNode.degree - leftNode.degree ||
        byStableNodeOrder(leftNode, rightNode) ||
        left.edge.id.localeCompare(right.edge.id)
      );
    });
  }

  const childrenById = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const componentNodeIds = new Set<string>([rootId]);
  const levelById = new Map<string, number>([[rootId, 0]]);
  const parentEdgeById = new Map<string, GraphEdge>();
  const queue = [rootId];

  for (let index = 0; index < queue.length; index += 1) {
    const parentId = queue[index];
    const parentLevel = levelById.get(parentId) ?? 0;

    for (const neighbor of adjacency.get(parentId) ?? []) {
      if (componentNodeIds.has(neighbor.neighborId)) continue;
      componentNodeIds.add(neighbor.neighborId);
      levelById.set(neighbor.neighborId, parentLevel + 1);
      parentEdgeById.set(neighbor.neighborId, neighbor.edge);
      childrenById.get(parentId)?.push(neighbor.neighborId);
      queue.push(neighbor.neighborId);
    }
  }

  return { childrenById, componentNodeIds, levelById, parentEdgeById };
}

function visibleMindMapNodeIds({
  branchLimit,
  collapsedNodeIds,
  expandedNodeIds,
  initialVisibleCap,
  maxDepth,
  maxVisibleCap,
  rootId,
  tree,
}: {
  branchLimit: number;
  collapsedNodeIds: Set<string>;
  expandedNodeIds: Set<string>;
  initialVisibleCap: number;
  maxDepth: number;
  maxVisibleCap: number;
  rootId: string;
  tree: RootedMindMapTree;
}) {
  const hasExplicitExpansion = [...expandedNodeIds].some(
    (id) => (tree.childrenById.get(id)?.length ?? 0) > 0,
  );
  const visibleCap = hasExplicitExpansion ? maxVisibleCap : initialVisibleCap;
  const visible = new Set<string>([rootId]);
  const ordered = [rootId];
  let parents = [rootId];

  while (parents.length && visible.size < visibleCap) {
    const eligibleParents = parents.filter((parentId) => {
      if (collapsedNodeIds.has(parentId)) return false;
      const level = tree.levelById.get(parentId) ?? 0;
      return level < maxDepth || expandedNodeIds.has(parentId);
    });
    const nextParents: string[] = [];
    const childSlots = Math.max(
      0,
      ...eligibleParents.map((parentId) =>
        expandedNodeIds.has(parentId)
          ? (tree.childrenById.get(parentId)?.length ?? 0)
          : Math.min(branchLimit, tree.childrenById.get(parentId)?.length ?? 0),
      ),
    );

    // Round-robin across branches prevents one dense branch from consuming the
    // complete readable-node budget before its siblings receive a child.
    for (let childIndex = 0; childIndex < childSlots; childIndex += 1) {
      for (const parentId of eligibleParents) {
        if (visible.size >= visibleCap) break;
        const parentChildLimit = expandedNodeIds.has(parentId)
          ? (tree.childrenById.get(parentId)?.length ?? 0)
          : branchLimit;
        if (childIndex >= parentChildLimit) continue;
        const childId = tree.childrenById.get(parentId)?.[childIndex];
        if (!childId || visible.has(childId)) continue;
        visible.add(childId);
        ordered.push(childId);
        nextParents.push(childId);
      }
    }

    parents = nextParents;
  }

  return { ordered, visible };
}

function countMindMapSubtree(
  nodeId: string,
  childrenById: Map<string, string[]>,
  memo: Map<string, number>,
): number {
  const cached = memo.get(nodeId);
  if (cached !== undefined) return cached;
  const count = 1 + (childrenById.get(nodeId) ?? []).reduce(
    (total, childId) => total + countMindMapSubtree(childId, childrenById, memo),
    0,
  );
  memo.set(nodeId, count);
  return count;
}

function focusedMindMapPositions(
  orderedIds: string[],
  levelById: Map<string, number>,
) {
  const byLevel = new Map<number, string[]>();

  for (const id of orderedIds) {
    const level = levelById.get(id) ?? 0;
    const ids = byLevel.get(level) ?? [];
    ids.push(id);
    byLevel.set(level, ids);
  }

  const positions = new Map<string, { x: number; y: number }>();

  for (const [level, ids] of [...byLevel].sort(([left], [right]) => left - right)) {
    const totalHeight = Math.max(0, ids.length - 1) * NODE_Y_SPACING;
    ids.forEach((id, index) => {
      positions.set(id, {
        x: 80 + level * LEVEL_X_SPACING,
        y: 120 - totalHeight / 2 + index * NODE_Y_SPACING,
      });
    });
  }

  return positions;
}

function rootScore(
  node: GraphSnapshot["nodes"][number],
  metrics: GraphMetrics,
  orderIndex: number,
) {
  const nodeKind = node.nodeKind ?? node.eyebrow;
  const isSourceSummary = nodeKind === "source_summary";
  const isSourceTone = node.tone === "source";
  const indegree = metrics.indegree.get(node.id) ?? 0;
  const outdegree = metrics.outdegree.get(node.id) ?? 0;
  const degree = metrics.degree.get(node.id) ?? 0;

  return (
    (isSourceSummary ? 1000 : 0) +
    (isSourceTone ? 180 : 0) +
    outdegree * 12 +
    degree * 6 -
    indegree * 3 -
    orderIndex * 0.001
  );
}

export function chooseGraphRoot(snapshot: GraphSnapshot) {
  const edges = validEdges(snapshot);
  const nodes = [...snapshot.nodes].sort(byStableNodeOrder);
  const metrics = buildMetrics(nodes, edges);

  return (
    nodes
      .map((node, index) => ({
        node,
        score: rootScore(node, metrics, index),
      }))
      .sort((left, right) => right.score - left.score || byStableNodeOrder(left.node, right.node))[0]
      ?.node ?? null
  );
}

function bfsOrder(nodes: GraphSnapshot["nodes"], metrics: GraphMetrics, rootId: string) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  const levels = new Map<string, number>();
  const ordered: string[] = [];

  function traverse(startId: string, baseLevel = 0) {
    if (visited.has(startId)) return;

    const queue = [startId];
    visited.add(startId);
    levels.set(startId, baseLevel);

    for (let index = 0; index < queue.length; index += 1) {
      const id = queue[index];
      ordered.push(id);
      const currentLevel = levels.get(id) ?? baseLevel;
      const neighbors = [
        ...(metrics.outgoing.get(id) ?? []),
        ...(metrics.adjacency.get(id) ?? []),
      ]
        .filter((value, valueIndex, values) => values.indexOf(value) === valueIndex)
        .filter((value) => !visited.has(value))
        .sort((left, right) => {
          const leftNode = nodeById.get(left);
          const rightNode = nodeById.get(right);
          if (!leftNode || !rightNode) return left.localeCompare(right);
          return (
            (metrics.indegree.get(left) ?? 0) - (metrics.indegree.get(right) ?? 0) ||
            byStableNodeOrder(leftNode, rightNode)
          );
        });

      for (const neighbor of neighbors) {
        visited.add(neighbor);
        levels.set(neighbor, currentLevel + 1);
        queue.push(neighbor);
      }
    }
  }

  traverse(rootId);

  const disconnected = nodes
    .filter((node) => !visited.has(node.id))
    .sort((left, right) => {
      const degreeDelta = (metrics.degree.get(right.id) ?? 0) - (metrics.degree.get(left.id) ?? 0);
      return degreeDelta || byStableNodeOrder(left, right);
    });

  let disconnectedLevel = Math.max(1, ...levels.values()) + 1;

  for (const node of disconnected) {
    if (visited.has(node.id)) continue;

    traverse(node.id, disconnectedLevel);
    disconnectedLevel += 1;
  }

  return { levels, ordered };
}

export function shortestGraphPath(
  graph: Pick<GraphProjection, "edges" | "nodes">,
  sourceId: string | null,
  targetId: string | null,
) {
  if (!sourceId || !targetId) return [];
  if (sourceId === targetId) return [sourceId];

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) return [];

  const adjacency = new Map([...nodeIds].map((id) => [id, [] as string[]]));

  for (const edge of graph.edges) {
    if (nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId)) {
      adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
      adjacency.get(edge.targetNodeId)?.push(edge.sourceNodeId);
    }
  }

  for (const neighbors of adjacency.values()) {
    neighbors.sort();
  }

  const queue = [sourceId];
  const previous = new Map<string, string | null>([[sourceId, null]]);

  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];

    for (const neighbor of adjacency.get(id) ?? []) {
      if (previous.has(neighbor)) continue;
      previous.set(neighbor, id);

      if (neighbor === targetId) {
        const path = [targetId];
        let cursor: string | null = id;

        while (cursor) {
          path.push(cursor);
          cursor = previous.get(cursor) ?? null;
        }

        return path.reverse();
      }

      queue.push(neighbor);
    }
  }

  return [];
}

function computeImportance(nodeId: string, metrics: GraphMetrics, maxDegree: number, isRoot: boolean) {
  const indegree = metrics.indegree.get(nodeId) ?? 0;
  const outdegree = metrics.outdegree.get(nodeId) ?? 0;
  const degree = metrics.degree.get(nodeId) ?? 0;
  const normalizedDegree = maxDegree ? degree / maxDegree : 0;

  return clamp((isRoot ? 0.35 : 0) + normalizedDegree * 0.45 + outdegree * 0.035 + indegree * 0.02, 0.12, 1);
}

function mindMapPositions(
  nodes: GraphSnapshot["nodes"],
  metrics: GraphMetrics,
  rootId: string,
) {
  const { levels, ordered } = bfsOrder(nodes, metrics, rootId);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const byLevel = new Map<number, string[]>();
  const rootReachable = new Set<string>();
  const rootQueue = [rootId];
  rootReachable.add(rootId);

  for (let index = 0; index < rootQueue.length; index += 1) {
    const id = rootQueue[index];

    for (const neighbor of metrics.adjacency.get(id) ?? []) {
      if (rootReachable.has(neighbor)) continue;
      rootReachable.add(neighbor);
      rootQueue.push(neighbor);
    }
  }

  for (const id of ordered) {
    const level = levels.get(id) ?? 0;
    const values = byLevel.get(level) ?? [];
    values.push(id);
    byLevel.set(level, values);
  }

  for (const [level, ids] of byLevel) {
    ids.sort((left, right) => {
      const leftNode = nodeById.get(left);
      const rightNode = nodeById.get(right);
      if (!leftNode || !rightNode) return left.localeCompare(right);
      return (
        (metrics.degree.get(right) ?? 0) - (metrics.degree.get(left) ?? 0) ||
        byStableNodeOrder(leftNode, rightNode)
      );
    });
    byLevel.set(level, ids);
  }

  const positions = new Map<string, { x: number; y: number }>();
  let disconnectedOffset = COMPONENT_Y_SPACING;
  const sortedLevels = [...byLevel.keys()].sort((left, right) => left - right);

  for (const level of sortedLevels) {
    const ids = byLevel.get(level) ?? [];
    const totalHeight = Math.max(0, ids.length - 1) * NODE_Y_SPACING;
    const isDisconnectedBand =
      level > 0 && ids.every((id) => !rootReachable.has(id));
    const bandOffset = isDisconnectedBand ? disconnectedOffset : 0;

    ids.forEach((id, index) => {
      positions.set(id, {
        x: 80 + level * LEVEL_X_SPACING,
        y: 120 - totalHeight / 2 + index * NODE_Y_SPACING + bandOffset,
      });
    });

    if (isDisconnectedBand) {
      disconnectedOffset += COMPONENT_Y_SPACING;
    }
  }

  return { levels, positions };
}

function initialGalaxyPosition(index: number, level: number, importance: number): [number, number, number] {
  const angle = index * 2.399963229728653;
  const radius = level === 0 ? 0.22 : 1.05 + level * 0.58 + (index % 5) * 0.08;

  return [
    finite(Math.cos(angle) * radius * (1 + importance * 0.18)),
    finite(Math.sin(angle) * radius),
    finite(((index % 7) - 3) * 0.24 + level * 0.05),
  ];
}

function galaxyPositions(
  nodes: PositionedGraphNode[],
  edges: GraphEdge[],
  rootId: string,
) {
  const cappedNodes = nodes.slice(0, MAX_GALAXY_NODES);
  const indexById = new Map(cappedNodes.map((node, index) => [node.id, index]));
  const positions = cappedNodes.map((node, index) =>
    node.id === rootId
      ? ([0, 0, 0] as [number, number, number])
      : initialGalaxyPosition(index, node.level, node.importance),
  );
  const velocities = cappedNodes.map(() => [0, 0, 0] as [number, number, number]);
  const validEdgePairs = edges
    .map((edge) => [indexById.get(edge.sourceNodeId), indexById.get(edge.targetNodeId)] as const)
    .filter((pair): pair is readonly [number, number] => pair[0] !== undefined && pair[1] !== undefined);

  for (let iteration = 0; iteration < 90; iteration += 1) {
    for (let i = 0; i < cappedNodes.length; i += 1) {
      const node = cappedNodes[i];
      if (node.id === rootId) continue;
      const position = positions[i];
      velocities[i][0] += -position[0] * 0.004;
      velocities[i][1] += -position[1] * 0.004;
      velocities[i][2] += -position[2] * 0.004;
    }

    for (let i = 0; i < cappedNodes.length; i += 1) {
      for (let j = i + 1; j < cappedNodes.length; j += 1) {
        const dx = positions[i][0] - positions[j][0];
        const dy = positions[i][1] - positions[j][1];
        const dz = positions[i][2] - positions[j][2];
        const distanceSq = Math.max(0.18, dx * dx + dy * dy + dz * dz);
        const force = 0.018 / distanceSq;

        velocities[i][0] += dx * force;
        velocities[i][1] += dy * force;
        velocities[i][2] += dz * force;
        velocities[j][0] -= dx * force;
        velocities[j][1] -= dy * force;
        velocities[j][2] -= dz * force;
      }
    }

    for (const [sourceIndex, targetIndex] of validEdgePairs) {
      const source = positions[sourceIndex];
      const target = positions[targetIndex];
      const dx = target[0] - source[0];
      const dy = target[1] - source[1];
      const dz = target[2] - source[2];
      const force = 0.014;

      velocities[sourceIndex][0] += dx * force;
      velocities[sourceIndex][1] += dy * force;
      velocities[sourceIndex][2] += dz * force;
      velocities[targetIndex][0] -= dx * force;
      velocities[targetIndex][1] -= dy * force;
      velocities[targetIndex][2] -= dz * force;
    }

    for (let i = 0; i < cappedNodes.length; i += 1) {
      if (cappedNodes[i].id === rootId) {
        positions[i] = [0, 0, 0];
        velocities[i] = [0, 0, 0];
        continue;
      }

      positions[i][0] = clamp(finite(positions[i][0] + velocities[i][0]), -4.2, 4.2);
      positions[i][1] = clamp(finite(positions[i][1] + velocities[i][1]), -3.2, 3.2);
      positions[i][2] = clamp(finite(positions[i][2] + velocities[i][2]), -2.4, 2.4);
      velocities[i][0] *= 0.82;
      velocities[i][1] *= 0.82;
      velocities[i][2] *= 0.82;
    }
  }

  return new Map(cappedNodes.map((node, index) => [node.id, positions[index]] as const));
}

export function projectGraphSnapshot(
  snapshot: GraphSnapshot,
  layout: LayoutOverride = {},
): GraphProjection {
  const edges = validEdges(snapshot);
  const sortedNodes = [...snapshot.nodes].sort(byStableNodeOrder);

  if (!sortedNodes.length) {
    return { snapshot, nodes: [], edges: [] };
  }

  const metrics = buildMetrics(sortedNodes, edges);
  const root = chooseGraphRoot({ ...snapshot, nodes: sortedNodes, edges });
  const rootId = root?.id ?? sortedNodes[0]?.id;
  const maxDegree = Math.max(1, ...sortedNodes.map((node) => metrics.degree.get(node.id) ?? 0));
  const { levels, positions } = mindMapPositions(sortedNodes, metrics, rootId);

  const projectedNodes: PositionedGraphNode[] = sortedNodes.map((node) => {
    const isRoot = node.id === rootId;
    const degree = metrics.degree.get(node.id) ?? 0;

    return {
      ...node,
      degree,
      importance: computeImportance(node.id, metrics, maxDegree, isRoot),
      level: levels.get(node.id) ?? 0,
      position:
        node.savedPosition ??
        layout[node.id]?.mindMap ??
        positions.get(node.id) ??
        { x: 80, y: 120 },
      galaxyPosition: [0, 0, 0],
    };
  });

  const galaxy = galaxyPositions(projectedNodes, edges, rootId);
  const nodes = projectedNodes.map((node) => ({
    ...node,
    galaxyPosition: layout[node.id]?.galaxy
      ? ([...layout[node.id]!.galaxy] as [number, number, number])
      : galaxy.get(node.id) ?? [0, 0, 0],
  }));
  const visibleNodeIds = new Set(nodes.map((node) => node.id));

  return {
    snapshot,
    nodes,
    edges: edges.filter(
      (edge) => visibleNodeIds.has(edge.sourceNodeId) && visibleNodeIds.has(edge.targetNodeId),
    ),
  };
}

/**
 * Builds a readable, focus-based working view without truncating the shared
 * GraphProjection used by Galaxy, search, inspector, and export flows.
 */
export function projectMindMapProjection(
  graph: GraphProjection,
  options: MindMapProjectionOptions = {},
): MindMapProjection {
  const totalNodeCount = graph.nodes.length;

  if (!totalNodeCount) {
    return {
      rootId: null,
      nodes: [],
      treeEdges: [],
      crossEdges: [],
      visibleNodeCount: 0,
      totalNodeCount: 0,
      hiddenNodeCount: 0,
      unorganizedGroup: null,
    };
  }

  const graphNodeIds = new Set(graph.nodes.map((node) => node.id));
  const requestedFocusId = options.focusNodeId;
  const scoredRoot = chooseGraphRoot(graph.snapshot);
  const fallbackRoot =
    scoredRoot && graphNodeIds.has(scoredRoot.id) ? scoredRoot : graph.nodes[0];
  const rootId =
    requestedFocusId && graphNodeIds.has(requestedFocusId)
      ? requestedFocusId
      : fallbackRoot.id;
  const maxDepth = normalizedInteger(options.maxDepth, DEFAULT_MIND_MAP_DEPTH, 0, 12);
  const initialVisibleCap = normalizedInteger(
    options.initialVisibleCap,
    DEFAULT_MIND_MAP_INITIAL_CAP,
    1,
    200,
  );
  const maxVisibleCap = normalizedInteger(
    options.maxVisibleCap,
    DEFAULT_MIND_MAP_MAX_CAP,
    initialVisibleCap,
    300,
  );
  const branchLimit = normalizedInteger(
    options.branchLimit,
    DEFAULT_MIND_MAP_BRANCH_LIMIT,
    1,
    50,
  );
  const expandedNodeIds = new Set(
    (options.expandedNodeIds ?? []).filter((id) => graphNodeIds.has(id)),
  );
  const collapsedNodeIds = new Set(
    (options.collapsedNodeIds ?? []).filter((id) => graphNodeIds.has(id)),
  );
  const tree = buildRootedMindMapTree(graph.nodes, graph.edges, rootId);
  const { ordered, visible } = visibleMindMapNodeIds({
    branchLimit,
    collapsedNodeIds,
    expandedNodeIds,
    initialVisibleCap,
    maxDepth,
    maxVisibleCap,
    rootId,
    tree,
  });
  const positions = focusedMindMapPositions(ordered, tree.levelById);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const subtreeSizeMemo = new Map<string, number>();
  const nodes = ordered
    .map((id): MindMapProjectedNode | null => {
      const node = nodeById.get(id);
      if (!node) return null;
      const children = tree.childrenById.get(id) ?? [];
      const visibleChildren = children.filter((childId) => visible.has(childId));
      const hiddenChildCount = children
        .filter((childId) => !visible.has(childId))
        .reduce(
          (total, childId) =>
            total + countMindMapSubtree(childId, tree.childrenById, subtreeSizeMemo),
          0,
        );

      return {
        ...node,
        level: tree.levelById.get(id) ?? 0,
        // A persisted workspace position is an explicit user decision. The
        // focused projection may generate positions for every other node, but
        // must not overwrite that durable layout on refresh.
        position: node.savedPosition ?? positions.get(id) ?? { x: 80, y: 120 },
        hasChildren: children.length > 0,
        expanded: visibleChildren.length > 0,
        explicitlyExpanded: expandedNodeIds.has(id) && !collapsedNodeIds.has(id),
        collapsed: collapsedNodeIds.has(id),
        canExpand: hiddenChildCount > 0,
        hiddenChildCount,
      };
    })
    .filter((node): node is MindMapProjectedNode => node !== null);
  const treeEdgeIds = new Set<string>();
  const treeEdges = ordered.flatMap((id) => {
    if (id === rootId) return [];
    const edge = tree.parentEdgeById.get(id);
    if (!edge || !visible.has(id)) return [];
    treeEdgeIds.add(edge.id);
    return [edge];
  });
  const crossEdges = graph.edges.filter(
    (edge) =>
      visible.has(edge.sourceNodeId) &&
      visible.has(edge.targetNodeId) &&
      !treeEdgeIds.has(edge.id),
  );
  const disconnectedNodeIds = graph.nodes
    .filter((node) => !tree.componentNodeIds.has(node.id))
    .sort(byStableNodeOrder)
    .map((node) => node.id);

  return {
    rootId,
    nodes,
    treeEdges,
    crossEdges,
    visibleNodeCount: nodes.length,
    totalNodeCount,
    hiddenNodeCount: tree.componentNodeIds.size - visible.size,
    unorganizedGroup: disconnectedNodeIds.length
      ? {
          id: MIND_MAP_UNORGANIZED_GROUP_ID,
          count: disconnectedNodeIds.length,
          nodeIds: disconnectedNodeIds,
          expanded: false,
        }
      : null,
  };
}
