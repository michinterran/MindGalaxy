"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import {
  CheckCircle2,
  CircleDot,
  FileText,
  Workflow,
} from "lucide-react";
import {
  GRAPH_TONE_COLORS,
  type GraphProjection,
  type GraphTone,
} from "@/features/knowledge-map/model/graph";
import { formatDateTime, formatInteger, t, type Locale, type MessageKey } from "@/lib/i18n";
import {
  captureSourceLabel,
  processingStatusLabel,
} from "@/lib/i18n/labels";

const DynamicMindMapView = dynamic(
  () =>
    import("@/features/knowledge-map/components/mind-map-view").then(
      (mod) => mod.MindMapView,
    ),
  {
    loading: () => (
      <section className="canvas-stage renderer-loading" aria-hidden="true" />
    ),
    ssr: false,
  },
);

const DynamicGalaxyView = dynamic(
  () =>
    import("@/features/knowledge-map/components/galaxy-view").then(
      (mod) => mod.GalaxyView,
    ),
  {
    loading: () => (
      <section className="galaxy-stage renderer-loading" aria-hidden="true" />
    ),
    ssr: false,
  },
);

export type RecentCapture = {
  id: string;
  title: string | null;
  rawTextLength: number;
  sourceKind: string;
  createdAt: string;
  processingStatus?: string | null;
};

export type ViewMode = "mindmap" | "galaxy" | "list";

function getToneClass(tone: GraphTone) {
  return `mind-node--${tone}`;
}

const EDGE_LABEL_KEYS = {
  source: "graph.edge.source",
  ai: "graph.edge.ai",
  topic: "graph.edge.topic",
  evidence: "graph.edge.evidence",
  context: "graph.edge.context",
  action: "graph.edge.action",
  related: "graph.edge.related",
} as const satisfies Record<GraphTone | "related", MessageKey>;

function edgeRelationLabel(locale: Locale, tone?: GraphTone, label?: string | null) {
  return label ?? t(locale, EDGE_LABEL_KEYS[tone ?? "related"]);
}

function findNode(graph: GraphProjection, id: string | null) {
  return graph.nodes.find((node) => node.id === id) ?? graph.nodes[0] ?? null;
}

export function KnowledgeMapClient({
  graph,
  isDemo,
  locale,
  onSelect,
  onSelectCapture,
  recentCaptures,
  selectedCaptureId,
  selectedId,
  viewMode,
}: {
  graph: GraphProjection;
  isDemo: boolean;
  locale: Locale;
  onSelect: (id: string) => void;
  onSelectCapture?: (captureId: string) => void;
  recentCaptures: RecentCapture[];
  selectedCaptureId?: string | null;
  selectedId: string | null;
  viewMode: ViewMode;
}) {
  if (!graph.nodes.length && viewMode !== "list") {
    return (
      <section className="canvas-stage empty-graph-stage">
        <h2>{t(locale, "workspace.graph.emptyTitle")}</h2>
        <p>{t(locale, "workspace.graph.emptyDescription")}</p>
      </section>
    );
  }

  if (viewMode === "galaxy") {
    return (
      <DynamicGalaxyView
        graph={graph}
        locale={locale}
        onSelect={onSelect}
        selectedId={selectedId}
      />
    );
  }

  if (viewMode === "list") {
    return (
      <ListView
        locale={locale}
        onSelectCapture={onSelectCapture}
        recentCaptures={recentCaptures}
        selectedCaptureId={selectedCaptureId}
      />
    );
  }

  return (
    <DynamicMindMapView
      graph={graph}
      isDemo={isDemo}
      locale={locale}
      onSelect={onSelect}
      selectedId={selectedId}
    />
  );
}

function ListView({
  locale,
  onSelectCapture,
  recentCaptures,
  selectedCaptureId,
}: {
  locale: Locale;
  onSelectCapture?: (captureId: string) => void;
  recentCaptures: RecentCapture[];
  selectedCaptureId?: string | null;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedCaptureId]);

  return (
    <section className="list-stage">
      <div className="list-stage__header">
        <div>
          <p>{t(locale, "workspace.list.kicker")}</p>
          <h2>{t(locale, "workspace.list.title")}</h2>
        </div>
      </div>
      <div className="capture-table">
        {recentCaptures.map((capture) => (
          <button
            aria-current={selectedCaptureId === capture.id ? "true" : undefined}
            className={selectedCaptureId === capture.id ? "is-selected" : ""}
            key={capture.id}
            onClick={() => onSelectCapture?.(capture.id)}
            ref={selectedCaptureId === capture.id ? selectedRef : undefined}
            type="button"
          >
            <FileText className="size-4" />
            <div>
              <h3>{capture.title ?? t(locale, "workspace.recent.untitled")}</h3>
              <p>
                {captureSourceLabel(locale, capture.sourceKind)} ·{" "}
                {t(locale, "capture.characterUnit", {
                  count: formatInteger(locale, capture.rawTextLength),
                })}{" "}
                · {formatDateTime(locale, capture.createdAt)}
              </p>
            </div>
            <span>
              {processingStatusLabel(locale, capture.processingStatus)}
            </span>
          </button>
        ))}
        {!recentCaptures.length ? (
          <div className="empty-table">{t(locale, "workspace.list.empty")}</div>
        ) : null}
      </div>
    </section>
  );
}

export function KnowledgeMapInspector({
  captureCount,
  graph,
  locale,
  selectedId,
}: {
  captureCount: number;
  graph: GraphProjection;
  locale: Locale;
  selectedId: string | null;
}) {
  const node = findNode(graph, selectedId);
  const linkedItems = node
    ? graph.edges
        .filter(
          (edge) => edge.sourceNodeId === node.id || edge.targetNodeId === node.id,
        )
        .map((edge) => {
          const linkedNode = findNode(
            graph,
            edge.sourceNodeId === node.id ? edge.targetNodeId : edge.sourceNodeId,
          );

          return linkedNode
            ? {
                edge,
                node: linkedNode,
                relation: edgeRelationLabel(locale, edge.tone, edge.label),
              }
            : null;
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];
  const evidenceText =
    node?.evidenceSnippet ??
    (graph.snapshot.source === "demo"
      ? t(locale, "workspace.inspector.sampleEvidence")
      : t(locale, "workspace.inspector.noEvidence"));

  return (
    <aside className="inspector-panel">
      <section className="inspector-section">
        <div className="inspector-heading">
          <p>{t(locale, "workspace.inspector.selected")}</p>
          <h2>{node?.title ?? t(locale, "workspace.inspector.emptyNodeTitle")}</h2>
        </div>
        {node ? (
          <div className={`node-type-badge ${getToneClass(node.tone)}`}>
            <CircleDot className="size-4" />
            {t(locale, `graph.tone.${node.tone}`)}
          </div>
        ) : null}
        <p className="inspector-summary">
          {node?.summary ?? t(locale, "workspace.inspector.emptyNodeSummary")}
        </p>
      </section>

      <section className="inspector-section">
        <div className="inspector-heading">
          <p>{t(locale, "workspace.inspector.evidence")}</p>
          <h2>{t(locale, "workspace.inspector.evidenceTitle")}</h2>
        </div>
        <blockquote>{evidenceText}</blockquote>
      </section>

      <section className="inspector-section">
        <div className="inspector-heading">
          <p>{t(locale, "workspace.inspector.connections")}</p>
          <h2>{t(locale, "workspace.inspector.connectionsTitle")}</h2>
        </div>
        <div className="connection-list">
          {linkedItems.map((item) => (
            <div key={item.edge.id}>
              <span style={{ backgroundColor: GRAPH_TONE_COLORS[item.edge.tone ?? item.node.tone] }} />
              <p>
                <strong>{item.relation}</strong>
                {item.node.title}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="inspector-section inspector-section--metrics">
        <div>
          <CheckCircle2 className="size-4" />
          <span>{t(locale, "workspace.inspector.captureMetric")}</span>
          <strong>{formatInteger(locale, captureCount)}</strong>
        </div>
        <div>
          <Workflow className="size-4" />
          <span>{t(locale, "workspace.inspector.nodeMetric")}</span>
          <strong>{formatInteger(locale, graph.nodes.length)}</strong>
        </div>
      </section>
    </aside>
  );
}
