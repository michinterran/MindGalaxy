import { t, type Locale } from "@/lib/i18n";
import type { GraphSnapshot } from "@/features/knowledge-map/model/graph";

export const DEMO_GRAPH_LAYOUT = {
  root: { mindMap: { x: 40, y: 250 }, galaxy: [0, 0, 0] },
  problem: { mindMap: { x: 360, y: 60 }, galaxy: [-2.3, 1.35, -0.5] },
  capture: { mindMap: { x: 360, y: 178 }, galaxy: [1.9, 1.1, 0.4] },
  search: { mindMap: { x: 360, y: 296 }, galaxy: [-1.8, -1.25, 1.1] },
  context: { mindMap: { x: 360, y: 414 }, galaxy: [2.2, -1.05, -0.8] },
  export: { mindMap: { x: 360, y: 532 }, galaxy: [0.35, -2.0, 0.8] },
  "plain-map": { mindMap: { x: 700, y: 116 }, galaxy: [3.2, 1.6, 0.1] },
  galaxy: { mindMap: { x: 700, y: 236 }, galaxy: [3.6, 0.4, 1.1] },
  evidence: { mindMap: { x: 700, y: 356 }, galaxy: [-3.4, -0.8, 0.3] },
  next: { mindMap: { x: 700, y: 476 }, galaxy: [1.5, -2.8, -0.2] },
} as const;

export function getEmptyGraphSnapshot(workspaceId?: string): GraphSnapshot {
  return {
    id: `empty-${workspaceId ?? "workspace"}`,
    workspaceId,
    source: "empty",
    nodes: [],
    edges: [],
  };
}

export function getDemoGraphSnapshot(locale: Locale, workspaceId?: string): GraphSnapshot {
  return {
    id: "demo-mindgalaxy-mvp",
    workspaceId,
    source: "demo",
    nodes: [
      {
        id: "root",
        title: t(locale, "demo.graph.root.title"),
        eyebrow: t(locale, "demo.graph.root.eyebrow"),
        summary: t(locale, "demo.graph.root.summary"),
        tone: "source",
        confidenceLabel: "source",
      },
      {
        id: "problem",
        title: t(locale, "demo.graph.problem.title"),
        eyebrow: t(locale, "demo.graph.problem.eyebrow"),
        summary: t(locale, "demo.graph.problem.summary"),
        tone: "topic",
        confidenceLabel: "92%",
      },
      {
        id: "capture",
        title: t(locale, "demo.graph.capture.title"),
        eyebrow: t(locale, "demo.graph.capture.eyebrow"),
        summary: t(locale, "demo.graph.capture.summary"),
        tone: "ai",
        confidenceLabel: "88%",
      },
      {
        id: "search",
        title: t(locale, "demo.graph.search.title"),
        eyebrow: t(locale, "demo.graph.search.eyebrow"),
        summary: t(locale, "demo.graph.search.summary"),
        tone: "evidence",
        confidenceLabel: "85%",
      },
      {
        id: "context",
        title: t(locale, "demo.graph.context.title"),
        eyebrow: t(locale, "demo.graph.context.eyebrow"),
        summary: t(locale, "demo.graph.context.summary"),
        tone: "context",
        confidenceLabel: "81%",
      },
      {
        id: "export",
        title: t(locale, "demo.graph.export.title"),
        eyebrow: t(locale, "demo.graph.export.eyebrow"),
        summary: t(locale, "demo.graph.export.summary"),
        tone: "action",
        confidenceLabel: "planned",
      },
      {
        id: "plain-map",
        title: t(locale, "demo.graph.plainMap.title"),
        eyebrow: t(locale, "demo.graph.plainMap.eyebrow"),
        summary: t(locale, "demo.graph.plainMap.summary"),
        tone: "topic",
        confidenceLabel: "MVP",
      },
      {
        id: "galaxy",
        title: t(locale, "demo.graph.galaxy.title"),
        eyebrow: t(locale, "demo.graph.galaxy.eyebrow"),
        summary: t(locale, "demo.graph.galaxy.summary"),
        tone: "ai",
        confidenceLabel: "beta",
      },
      {
        id: "evidence",
        title: t(locale, "demo.graph.evidence.title"),
        eyebrow: t(locale, "demo.graph.evidence.eyebrow"),
        summary: t(locale, "demo.graph.evidence.summary"),
        tone: "evidence",
        confidenceLabel: "required",
      },
      {
        id: "next",
        title: t(locale, "demo.graph.next.title"),
        eyebrow: t(locale, "demo.graph.next.eyebrow"),
        summary: t(locale, "demo.graph.next.summary"),
        tone: "action",
        confidenceLabel: "ready",
      },
    ],
    edges: [
      { id: "root-problem", sourceNodeId: "root", targetNodeId: "problem", tone: "topic" },
      { id: "root-capture", sourceNodeId: "root", targetNodeId: "capture", tone: "ai" },
      { id: "root-search", sourceNodeId: "root", targetNodeId: "search", tone: "evidence" },
      { id: "root-context", sourceNodeId: "root", targetNodeId: "context", tone: "context" },
      { id: "root-export", sourceNodeId: "root", targetNodeId: "export", tone: "action" },
      { id: "capture-plain-map", sourceNodeId: "capture", targetNodeId: "plain-map", tone: "topic" },
      { id: "capture-galaxy", sourceNodeId: "capture", targetNodeId: "galaxy", tone: "ai" },
      { id: "search-evidence", sourceNodeId: "search", targetNodeId: "evidence", tone: "evidence" },
      { id: "export-next", sourceNodeId: "export", targetNodeId: "next", tone: "action" },
    ],
  };
}
