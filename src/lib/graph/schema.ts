import type { ContextKind, EdgeKind, NodeKind } from "@/types/domain";

export const NODE_KINDS = [
  "idea",
  "claim",
  "entity",
  "event",
  "task",
  "question",
  "source_summary",
] as const satisfies readonly NodeKind[];

export const EDGE_KINDS = [
  "relates_to",
  "supports",
  "contradicts",
  "causes",
  "mentions",
  "contains",
  "follows",
  "derived_from",
] as const satisfies readonly EdgeKind[];

export const CONTEXT_KINDS = [
  "topic",
  "time",
  "place",
  "person",
  "organization",
  "project",
  "tag",
] as const satisfies readonly ContextKind[];

export const EDGE_LABELS: Record<EdgeKind, string> = {
  relates_to: "관련",
  supports: "근거",
  contradicts: "충돌",
  causes: "원인",
  mentions: "언급",
  contains: "포함",
  follows: "후속",
  derived_from: "원문 기반",
};

export const CONTEXT_LABELS: Record<ContextKind, string> = {
  topic: "주제",
  time: "시간",
  place: "장소",
  person: "인물",
  organization: "조직",
  project: "프로젝트",
  tag: "태그",
};

export const GRAPH_LAYER_NAMES = {
  source: "Capture / Source",
  ai: "Nodes / Edges / Contexts",
  views: "Mindmap / Galaxy / Search / Export",
} as const;
