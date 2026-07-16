import type { EdgeKind, ID } from "@/types/domain";

export type ProjectionOnlyGraphNodeKind = "folder" | "capture" | "topic";
export type ProjectionOnlyGraphNodeId =
  `projection:${ProjectionOnlyGraphNodeKind}:${string}`;

const PROJECTION_ONLY_GRAPH_NODE_PREFIXES = [
  "projection:folder:",
  "projection:capture:",
  "projection:topic:",
] as const;

/**
 * Folder, manual-topic, and unprocessed-capture nodes are read-model
 * projections. Their IDs do not exist in `public.nodes`, so graph mutation APIs
 * must never receive them.
 */
export function isProjectionOnlyGraphNodeId(
  nodeId: ID,
): nodeId is ProjectionOnlyGraphNodeId {
  return PROJECTION_ONLY_GRAPH_NODE_PREFIXES.some((prefix) =>
    nodeId.startsWith(prefix),
  );
}

export function canMutateGraphNode(nodeId: ID) {
  return !isProjectionOnlyGraphNodeId(nodeId);
}

export type GraphTone = "source" | "ai" | "topic" | "evidence" | "context" | "action";

export type GraphNode = {
  id: ID;
  title: string;
  eyebrow: string;
  summary: string;
  tone: GraphTone;
  nodeKind?: string;
  /** Source capture shared by the original material and its AI-derived nodes. */
  captureId?: ID;
  /** Saved-at time of the source capture, used by date-scoped graph projections. */
  captureCreatedAt?: string;
  confidenceLabel?: string;
  evidenceSnippet?: string;
  savedPosition?: { x: number; y: number };
};

export type GraphEdge = {
  id: ID;
  sourceNodeId: ID;
  targetNodeId: ID;
  tone?: GraphTone;
  label?: string;
  /** Exact semantic relationship persisted in `public.edges.kind`. */
  kind?: EdgeKind;
  /** Normalized 0..1 confidence from AI analysis, when available. */
  confidence?: number;
  /** Relationship-level evidence, distinct from either connected node. */
  evidenceSnippet?: string;
  /** Provenance of the relationship rather than its visual tone. */
  origin?: "ai" | "user" | "system";
  /** Analysis trace fields retained for auditability and source navigation. */
  captureId?: ID;
  model?: string;
  promptVersion?: string;
  processingJobId?: ID;
  createdBy?: ID;
};

export type GraphSnapshot = {
  id: ID;
  workspaceId?: ID;
  source: "demo" | "empty" | "workspace";
  generatedAt?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type PositionedGraphNode = GraphNode & {
  position: { x: number; y: number };
  galaxyPosition: [number, number, number];
  importance: number;
  degree: number;
  level: number;
};

export type GraphProjection = {
  snapshot: GraphSnapshot;
  nodes: PositionedGraphNode[];
  edges: GraphEdge[];
};

/**
 * Stable identifier for the collapsed bucket that represents nodes outside the
 * focused connected component. It is projection metadata, not a persisted
 * knowledge-graph node.
 */
export const MIND_MAP_UNORGANIZED_GROUP_ID = "__mindmap_unorganized__" as const;

export type MindMapProjectedNode = PositionedGraphNode & {
  /** Whether the rooted projection tree contains at least one child. */
  hasChildren: boolean;
  /** Whether at least one child is currently visible in this projection. */
  expanded: boolean;
  /** Whether the user explicitly requested this branch to reveal more. */
  explicitlyExpanded: boolean;
  /** Whether the user explicitly closed this branch. */
  collapsed: boolean;
  /** Whether the branch still owns descendants that can be revealed. */
  canExpand: boolean;
  /** Descendants owned by this branch that are not currently visible. */
  hiddenChildCount: number;
};

export type MindMapUnorganizedGroup = {
  id: typeof MIND_MAP_UNORGANIZED_GROUP_ID;
  count: number;
  nodeIds: ID[];
  expanded: false;
};

export type MindMapProjection = {
  /** The current focus node. All visible hierarchy levels are relative to it. */
  rootId: ID | null;
  nodes: MindMapProjectedNode[];
  /** One stable primary-parent edge per visible non-root node. */
  treeEdges: GraphEdge[];
  /** Additional semantic relations between visible nodes. Hidden by default. */
  crossEdges: GraphEdge[];
  visibleNodeCount: number;
  totalNodeCount: number;
  /** Nodes in the focused component hidden by depth, branch, or cap rules. */
  hiddenNodeCount: number;
  /** Disconnected knowledge stays collapsed instead of extending the layout. */
  unorganizedGroup: MindMapUnorganizedGroup | null;
};

export type MindMapProjectionOptions = {
  focusNodeId?: ID | null;
  /** Default readable neighborhood depth. */
  maxDepth?: number;
  /** Initial readable node budget before the user explicitly expands a branch. */
  initialVisibleCap?: number;
  /** Hard node budget after explicit branch expansion. */
  maxVisibleCap?: number;
  /** Maximum visible children per branch in one projection pass. */
  branchLimit?: number;
  /** Branches explicitly opened beyond the default depth. */
  expandedNodeIds?: readonly ID[];
  /** Branches explicitly closed; this takes precedence over expansion. */
  collapsedNodeIds?: readonly ID[];
};

export const GRAPH_TONES = [
  "source",
  "ai",
  "topic",
  "evidence",
  "context",
  "action",
] as const satisfies readonly GraphTone[];

export const GRAPH_TONE_COLORS: Record<GraphTone, string> = {
  source: "#7dd3fc",
  ai: "#c4b5fd",
  topic: "#f4f4f5",
  evidence: "#67e8f9",
  context: "#fde68a",
  action: "#d6ff6b",
};
