import type {
  GraphEdge,
  GraphProjection,
  GraphSnapshot,
  PositionedGraphNode,
} from "@/features/knowledge-map/model/graph";

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
