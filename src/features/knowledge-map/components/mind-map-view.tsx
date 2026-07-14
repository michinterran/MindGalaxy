"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Panel,
  type Edge,
  type Node,
  useNodesState,
} from "reactflow";
import { MindMapNode } from "@/features/knowledge-map/components/mind-map-node";
import { GRAPH_INTERACTION_REGISTRY } from "@/config/registry";
import {
  createKeyedDebouncer,
  type KeyedDebouncer,
} from "@/features/graph-mutations/model/keyed-debouncer";
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

type NodePosition = { x: number; y: number };

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
  onNodePositionChange,
  onSelect,
  selectedId,
}: {
  graph: GraphProjection;
  isDemo: boolean;
  locale: Locale;
  onNodePositionChange?: (
    nodeId: string,
    position: { x: number; y: number },
  ) => Promise<void>;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const highlightedNodeIds = useMemo(
    () => selectedPathIds(graph, selectedId),
    [graph, selectedId],
  );
  const projectedNodes: Node[] = useMemo(
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
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(projectedNodes);
  const [positionStatus, setPositionStatus] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const positionSaverRef = useRef<
    KeyedDebouncer<string, NodePosition> | null
  >(null);

  useEffect(() => {
    setNodes((currentNodes) =>
      projectedNodes.map((projectedNode) => ({
        ...projectedNode,
        position:
          currentNodes.find((currentNode) => currentNode.id === projectedNode.id)
            ?.position ?? projectedNode.position,
      })),
    );
  }, [projectedNodes, setNodes]);

  useEffect(() => {
    if (!onNodePositionChange || isDemo) {
      positionSaverRef.current = null;
      return;
    }

    let isCurrent = true;
    const positionSaver = createKeyedDebouncer(
      async (nodeId: string, position: NodePosition) => {
        try {
          await onNodePositionChange(nodeId, position);
          if (isCurrent) setPositionStatus("success");
        } catch {
          if (isCurrent) setPositionStatus("error");
        }
      },
      GRAPH_INTERACTION_REGISTRY.nodePositionSaveDebounceMs,
    );
    positionSaverRef.current = positionSaver;

    return () => {
      isCurrent = false;
      positionSaver.cancelAll();
      if (positionSaverRef.current === positionSaver) {
        positionSaverRef.current = null;
      }
    };
  }, [isDemo, onNodePositionChange]);

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
          label: isHighlighted
            ? edge.label ?? t(locale, EDGE_LABEL_KEYS[edge.tone ?? "related"])
            : undefined,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: GRAPH_TONE_COLORS[edgeTone],
            width: 12,
            height: 12,
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
            strokeOpacity: isHighlighted ? 0.82 : selectedId ? 0.12 : 0.3,
            strokeWidth: isHighlighted ? 2.2 : 1.15,
          },
        };
      }),
    [graph.edges, highlightedNodeIds, locale, selectedId],
  );

  const legendTones: GraphTone[] = ["source", "ai", "evidence", "context", "action"];

  function persistNodePosition(nodeId: string, position: NodePosition) {
    if (!positionSaverRef.current) return;
    setPositionStatus("saving");
    positionSaverRef.current.schedule(nodeId, position);
  }

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
        onNodeDragStop={(_, node) => {
          persistNodePosition(node.id, node.position);
        }}
        onNodeClick={(_, node) => onSelect(node.id)}
        onNodesChange={onNodesChange}
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
          gap={42}
          size={1}
          variant={BackgroundVariant.Dots}
        />
        <Controls showInteractive={false} />
        <Panel
          className={`canvas-save-status canvas-save-status--${positionStatus}`}
          position="bottom-left"
        >
          <span aria-live="polite" role="status">
            {positionStatus === "idle"
              ? null
              : t(locale, `workspace.graph.position.${positionStatus}`)}
          </span>
        </Panel>
        <Panel className="canvas-help" position="bottom-right">
          {t(locale, "workspace.graph.interactionHint")}
        </Panel>
      </ReactFlow>
    </section>
  );
}
