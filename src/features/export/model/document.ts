import {
  GRAPH_TONE_COLORS,
  type GraphSnapshot,
} from "@/features/knowledge-map/model/graph";
import {
  projectGraphSnapshot,
  shortestGraphPath,
} from "@/features/knowledge-map/model/projection";
import { formatDateTime, formatInteger, t, type Locale } from "@/lib/i18n";
import type {
  ExportConnection,
  ExportDocument,
  ExportEvidence,
  ExportHierarchyItem,
  ExportNode,
} from "@/features/export/model/schemas";

export const EXPORT_DOCUMENT_LIMITS = {
  maxNodes: 80,
  maxEvidence: 12,
  maxConnections: 32,
  maxTitleChars: 140,
  maxEyebrowChars: 48,
  maxSummaryChars: 360,
  maxEvidenceChars: 420,
  maxConnectionLabelChars: 80,
} as const;

function compactText(value: string | null | undefined, maxLength: number) {
  const compacted = (value ?? "").replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) return compacted;
  return `${compacted.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function byDocumentOrder(left: ExportNode, right: ExportNode) {
  return (
    left.level - right.level ||
    right.importance - left.importance ||
    left.title.localeCompare(right.title) ||
    left.id.localeCompare(right.id)
  );
}

function edgeLabel(locale: Locale, label: string | undefined, tone: string | undefined) {
  if (label) return compactText(label, EXPORT_DOCUMENT_LIMITS.maxConnectionLabelChars);
  if (tone === "evidence") return t(locale, "export.document.connectionEvidence");
  if (tone === "action") return t(locale, "export.document.connectionAction");
  return t(locale, "export.document.connectionRelated");
}

function normalizeNode(
  node: ReturnType<typeof projectGraphSnapshot>["nodes"][number],
): ExportNode {
  return {
    id: node.id,
    title: compactText(node.title, EXPORT_DOCUMENT_LIMITS.maxTitleChars),
    eyebrow: compactText(node.eyebrow, EXPORT_DOCUMENT_LIMITS.maxEyebrowChars),
    summary: compactText(node.summary, EXPORT_DOCUMENT_LIMITS.maxSummaryChars),
    tone: node.tone,
    confidenceLabel: compactText(node.confidenceLabel, 24) || undefined,
    evidenceSnippet: compactText(
      node.evidenceSnippet,
      EXPORT_DOCUMENT_LIMITS.maxEvidenceChars,
    ) || undefined,
    level: node.level,
    degree: node.degree,
    importance: Number(node.importance.toFixed(3)),
  };
}

function buildHierarchy(nodes: ExportNode[], rootId: string, snapshot: GraphSnapshot) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const visibleIds = new Set(nodeById.keys());
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of snapshot.edges) {
    if (!visibleIds.has(edge.sourceNodeId) || !visibleIds.has(edge.targetNodeId)) {
      continue;
    }
    adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
    adjacency.get(edge.targetNodeId)?.push(edge.sourceNodeId);
  }

  for (const neighbors of adjacency.values()) {
    neighbors.sort((left, right) => {
      const leftNode = nodeById.get(left);
      const rightNode = nodeById.get(right);
      if (!leftNode || !rightNode) return left.localeCompare(right);
      return byDocumentOrder(leftNode, rightNode);
    });
  }

  const visited = new Set<string>();
  const items: ExportHierarchyItem[] = [];

  function visit(id: string, depth: number) {
    const node = nodeById.get(id);
    if (!node || visited.has(id)) return;
    visited.add(id);
    items.push({
      id,
      title: node.title,
      depth,
      summary: node.summary,
    });

    for (const nextId of adjacency.get(id) ?? []) {
      visit(nextId, depth + 1);
    }
  }

  visit(rootId, 0);

  for (const node of nodes) {
    visit(node.id, 0);
  }

  return items;
}

function buildEvidence(nodes: ExportNode[]): ExportEvidence[] {
  return nodes
    .filter((node) => Boolean(node.evidenceSnippet))
    .slice(0, EXPORT_DOCUMENT_LIMITS.maxEvidence)
    .map((node) => ({
      nodeId: node.id,
      title: node.title,
      quote: node.evidenceSnippet ?? "",
    }));
}

function buildConnections(
  nodes: ExportNode[],
  snapshot: GraphSnapshot,
  locale: Locale,
): ExportConnection[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const visibleIds = new Set(nodeById.keys());

  return snapshot.edges
    .filter((edge) => visibleIds.has(edge.sourceNodeId) && visibleIds.has(edge.targetNodeId))
    .sort(
      (left, right) =>
        left.sourceNodeId.localeCompare(right.sourceNodeId) ||
        left.targetNodeId.localeCompare(right.targetNodeId) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, EXPORT_DOCUMENT_LIMITS.maxConnections)
    .map((edge) => ({
      id: edge.id,
      sourceTitle: nodeById.get(edge.sourceNodeId)?.title ?? edge.sourceNodeId,
      targetTitle: nodeById.get(edge.targetNodeId)?.title ?? edge.targetNodeId,
      label: edgeLabel(locale, edge.label, edge.tone),
    }));
}

function buildNextQuestions(nodes: ExportNode[], locale: Locale) {
  const candidates = nodes.filter(
    (node) =>
      node.tone === "action" ||
      node.eyebrow.includes(t(locale, "graph.nodeKind.question")) ||
      node.title.includes("?"),
  );

  return (candidates.length ? candidates : nodes.slice(1))
    .slice(0, 4)
    .map((node) => node.title);
}

export function buildExportDocument({
  generatedAt = new Date().toISOString(),
  graph,
  locale,
  workspaceName = "MindGalaxy",
}: {
  graph: GraphSnapshot;
  locale: Locale;
  workspaceName?: string;
  generatedAt?: string;
}): ExportDocument {
  const projection = projectGraphSnapshot(graph);
  const originalNodeCount = projection.nodes.length;
  const nodes = projection.nodes
    .slice(0, EXPORT_DOCUMENT_LIMITS.maxNodes)
    .map(normalizeNode)
    .sort(byDocumentOrder);

  if (!nodes.length) {
    throw new Error("EXPORT_EMPTY_GRAPH");
  }

  const root = nodes.find((node) => node.level === 0) ?? nodes[0];
  const rootPathCounts = nodes
    .slice(1)
    .map((node) => shortestGraphPath(projection, root.id, node.id).length)
    .filter((length) => length > 0);
  const avgPathLength = rootPathCounts.length
    ? Math.round(
        rootPathCounts.reduce((sum, length) => sum + length, 0) /
          rootPathCounts.length,
      )
    : 0;
  const summaryBullets = [
    root.summary,
    ...nodes
      .filter((node) => node.id !== root.id && node.summary)
      .slice(0, 4)
      .map((node) => `${node.title}: ${node.summary}`),
  ].filter(Boolean);

  return {
    id: graph.id,
    locale,
    title: workspaceName,
    subtitle: t(locale, "export.document.subtitle", {
      date: formatDateTime(locale, generatedAt),
    }),
    generatedAt,
    source: graph.source,
    root,
    summary: {
      headline: root.title,
      bullets: summaryBullets.length
        ? summaryBullets
        : [t(locale, "export.document.emptySummary")],
      metrics: [
        {
          label: t(locale, "export.document.metricNodes"),
          value: formatInteger(locale, nodes.length),
        },
        {
          label: t(locale, "export.document.metricConnections"),
          value: formatInteger(locale, projection.edges.length),
        },
        {
          label: t(locale, "export.document.metricAvgPath"),
          value: formatInteger(locale, avgPathLength),
        },
      ],
    },
    hierarchy: buildHierarchy(nodes, root.id, graph),
    nodes,
    evidence: buildEvidence(nodes),
    connections: buildConnections(nodes, graph, locale),
    nextQuestions: buildNextQuestions(nodes, locale),
    truncation: {
      maxNodes: EXPORT_DOCUMENT_LIMITS.maxNodes,
      originalNodeCount,
      includedNodeCount: nodes.length,
      truncated: originalNodeCount > nodes.length,
    },
  };
}

export function exportToneColor(tone: string) {
  return GRAPH_TONE_COLORS[tone as keyof typeof GRAPH_TONE_COLORS] ?? "#7dd3fc";
}
