"use client";

import { useMemo } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Panel,
  type Edge,
  type Node,
} from "reactflow";
import { MindMapNode } from "@/features/knowledge-map/components/mind-map-node";
import {
  GRAPH_TONE_COLORS,
  type GraphProjection,
  type GraphTone,
} from "@/features/knowledge-map/model/graph";
import { shortestGraphPath } from "@/features/knowledge-map/model/projection";
import { t, type Locale, type MessageKey } from "@/lib/i18n";

const nodeTypes = {
  mindNode: MindMapNode,
};

const EDGE_LABEL_KEYS = {
  source: "graph.edge.source",
  ai: "graph.edge.ai",
  topic: "graph.edge.topic",
  evidence: "graph.edge.evidence",
  context: "graph.edge.context",
  action: "graph.edge.action",
  related: "graph.edge.related",
} as const satisfies Record<GraphTone | "related", MessageKey>;

function selectedPathIds(graph: GraphProjection, selectedId: string | null) {
  if (!selectedId) return new Set<string>();

  const root = [...graph.nodes].sort(
    (left, right) =>
      right.importance - left.importance ||
      left.level - right.level ||
      left.title.localeCompare(right.title),
  )[0];
  const path = shortestGraphPath(graph, root?.id ?? null, selectedId);

  return new Set(path.length ? path : [selectedId]);
}

export function MindMapView({
  graph,
  isDemo,
  locale,
  onSelect,
  selectedId,
}: {
  graph: GraphProjection;
  isDemo: boolean;
  locale: Locale;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const highlightedNodeIds = useMemo(
    () => selectedPathIds(graph, selectedId),
    [graph, selectedId],
  );
  const nodes: Node[] = useMemo(
    () =>
      graph.nodes.map((node) => ({
        id: node.id,
        type: "mindNode",
        position: node.position,
        data: {
          ...node,
          selected: selectedId === node.id,
          highlighted: highlightedNodeIds.has(node.id),
        },
        draggable: true,
      })),
    [graph.nodes, highlightedNodeIds, selectedId],
  );

  const edges: Edge[] = useMemo(
    () =>
      graph.edges.map((edge) => {
        const edgeTone = edge.tone ?? "source";
        const isHighlighted =
          Boolean(selectedId) &&
          highlightedNodeIds.has(edge.sourceNodeId) &&
          highlightedNodeIds.has(edge.targetNodeId);

        return {
          id: edge.id,
          source: edge.sourceNodeId,
          target: edge.targetNodeId,
          type: "smoothstep",
          interactionWidth: 22,
          label: edge.label ?? t(locale, EDGE_LABEL_KEYS[edge.tone ?? "related"]),
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: GRAPH_TONE_COLORS[edgeTone],
            width: 16,
            height: 16,
          },
          labelStyle: {
            fill: "rgba(244,244,245,0.68)",
            fontSize: 11,
            fontWeight: 650,
          },
          labelBgStyle: {
            fill: "rgba(5,5,6,0.82)",
          },
          labelBgPadding: [6, 4] as [number, number],
          style: {
            stroke: GRAPH_TONE_COLORS[edgeTone],
            strokeOpacity: isHighlighted || !selectedId ? 0.68 : 0.16,
            strokeWidth: isHighlighted ? 2.4 : 1.35,
          },
        };
      }),
    [graph.edges, highlightedNodeIds, locale, selectedId],
  );

  const legendTones: GraphTone[] = ["source", "ai", "evidence", "context", "action"];

  return (
    <section className="canvas-stage" aria-label={t(locale, "workspace.graph.mindMapAria")}>
      <div className="canvas-stage__header">
        <div>
          <p>
            {isDemo
              ? t(locale, "workspace.graph.sampleKicker")
              : t(locale, "workspace.graph.realKicker")}
          </p>
          <h2>
            {isDemo
              ? t(locale, "workspace.graph.sampleTitle")
              : t(locale, "workspace.graph.realTitle")}
          </h2>
          <span className="canvas-stage__description">
            {isDemo
              ? t(locale, "workspace.graph.sampleDescription")
              : t(locale, "workspace.graph.realDescription")}
          </span>
        </div>
        <div className="graph-legend">
          {legendTones.map((tone) => (
            <span key={tone}>
              <i style={{ backgroundColor: GRAPH_TONE_COLORS[tone] }} />
              {t(locale, `graph.tone.${tone}`)}
            </span>
          ))}
        </div>
      </div>
      <ReactFlow
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        maxZoom={1.35}
        minZoom={0.38}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onSelect(node.id)}
        panOnDrag
        panOnScroll
        proOptions={{ hideAttribution: true }}
        selectNodesOnDrag={false}
        elementsSelectable
        zoomOnDoubleClick
        zoomOnPinch
        zoomOnScroll
      >
        <Background
          color="rgba(255,255,255,0.12)"
          gap={32}
          variant={BackgroundVariant.Lines}
        />
        <Controls showInteractive={false} />
        <Panel className="canvas-help" position="bottom-right">
          {t(locale, "workspace.graph.interactionHint")}
        </Panel>
      </ReactFlow>
    </section>
  );
}
