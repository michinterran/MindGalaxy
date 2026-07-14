import type { ID } from "@/types/domain";

export type GraphTone = "source" | "ai" | "topic" | "evidence" | "context" | "action";

export type GraphNode = {
  id: ID;
  title: string;
  eyebrow: string;
  summary: string;
  tone: GraphTone;
  nodeKind?: string;
  confidenceLabel?: string;
  evidenceSnippet?: string;
};

export type GraphEdge = {
  id: ID;
  sourceNodeId: ID;
  targetNodeId: ID;
  tone?: GraphTone;
  label?: string;
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
