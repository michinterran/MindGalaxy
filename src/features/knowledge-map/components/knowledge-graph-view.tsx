"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CircleDot, FileText, Folder, RotateCcw } from "lucide-react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "reactflow";
import {
  buildKnowledgeGraphNetwork,
  directlyRelatedNodeIds,
  knowledgeGraphCategory,
  type KnowledgeGraphCategory,
  type KnowledgeGraphNetworkNode,
} from "@/features/knowledge-map/components/knowledge-graph-network";
import {
  GRAPH_TONE_COLORS,
  type GraphProjection,
} from "@/features/knowledge-map/model/graph";
import { t, type Locale } from "@/lib/i18n";

type KnowledgeGraphNodeData = KnowledgeGraphNetworkNode & {
  connectionCount: number;
  directlyRelated: boolean;
  dimmed: boolean;
  focusLabel: string;
  focusNode: (nodeId: string) => void;
  onSelect: (nodeId: string) => void;
  previewConnectionLabel: string;
  selectLabel: string;
  selected: boolean;
};

const nodeTypes = {
  knowledgeNode: KnowledgeGraphPointNode,
};

const CATEGORY_ORDER = ["folder", "material", "concept"] as const;

const CATEGORY_ICONS = {
  folder: Folder,
  material: FileText,
  concept: CircleDot,
} satisfies Record<KnowledgeGraphCategory, typeof CircleDot>;

function KnowledgeGraphPointNode({ data }: NodeProps<KnowledgeGraphNodeData>) {
  const tooltipId = useId();

  return (
    <div
      className={`knowledge-graph-node knowledge-graph-node--${data.category} ${
        data.selected ? "is-selected" : ""
      } ${data.directlyRelated ? "is-related" : ""} ${data.dimmed ? "is-dimmed" : ""}`}
    >
      <button
        aria-describedby={data.selected ? undefined : tooltipId}
        aria-label={data.selectLabel}
        className="knowledge-graph-node__target nodrag nopan"
        onClick={() => data.onSelect(data.id)}
        onDoubleClick={() => data.focusNode(data.id)}
        type="button"
      >
        <span className="knowledge-graph-node__dot" />
        {data.showLabel || data.selected || data.directlyRelated ? (
          <span className="knowledge-graph-node__label">{data.title}</span>
        ) : null}
      </button>
      {!data.selected ? (
        <div className="knowledge-graph-node__tooltip" id={tooltipId} role="tooltip">
          <strong>{data.title}</strong>
          <span>{data.summary}</span>
        </div>
      ) : null}
      {data.selected ? (
        <aside className="knowledge-graph-preview" aria-live="polite">
          <span>{data.eyebrow}</span>
          <strong>{data.title}</strong>
          <p>{data.summary}</p>
          <div>
            <small>
              {data.previewConnectionLabel} {data.connectionCount}
            </small>
            <button
              aria-label={data.focusLabel}
              className="nodrag nopan"
              onClick={() => data.focusNode(data.id)}
              type="button"
            >
              {data.focusLabel}
            </button>
          </div>
        </aside>
      ) : null}
    </div>
  );
}

export function KnowledgeGraphView({
  graph,
  locale,
  onSelect,
  selectedId,
}: {
  graph: GraphProjection;
  locale: Locale;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const flowRef = useRef<ReactFlowInstance<KnowledgeGraphNodeData> | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [activeCategories, setActiveCategories] = useState<
    ReadonlySet<KnowledgeGraphCategory>
  >(new Set(CATEGORY_ORDER));
  const network = useMemo(
    () =>
      buildKnowledgeGraphNetwork(graph, {
        categories: [...activeCategories],
        focusNodeId,
      }),
    [activeCategories, focusNodeId, graph],
  );
  const relatedNodeIds = useMemo(
    () => directlyRelatedNodeIds(network.edges, selectedId),
    [network.edges, selectedId],
  );
  const relatedLabelIds = useMemo(
    () =>
      new Set(
        network.nodes
          .filter((node) => relatedNodeIds.has(node.id))
          .sort(
            (left, right) =>
              right.importance - left.importance || right.degree - left.degree,
          )
          .slice(0, 8)
          .map((node) => node.id),
      ),
    [network.nodes, relatedNodeIds],
  );
  const connectionCounts = useMemo(() => {
    const counts = new Map(network.nodes.map((node) => [node.id, 0]));
    for (const edge of network.edges) {
      counts.set(edge.sourceNodeId, (counts.get(edge.sourceNodeId) ?? 0) + 1);
      counts.set(edge.targetNodeId, (counts.get(edge.targetNodeId) ?? 0) + 1);
    }
    return counts;
  }, [network.edges, network.nodes]);

  const focusNode = useCallback(
    (nodeId: string) => {
      setFocusNodeId(nodeId);
      onSelect(nodeId);
    },
    [onSelect],
  );

  const nodes: Node<KnowledgeGraphNodeData>[] = useMemo(
    () =>
      network.nodes.map((node) => {
        const selected = node.id === selectedId;
        const directlyRelated = relatedNodeIds.has(node.id);

        return {
          id: node.id,
          type: "knowledgeNode",
          position: node.networkPosition,
          draggable: false,
          focusable: false,
          selectable: false,
          zIndex: selected ? 20 : directlyRelated ? 10 : 0,
          data: {
            ...node,
            connectionCount: connectionCounts.get(node.id) ?? 0,
            directlyRelated,
            dimmed: Boolean(selectedId) && !selected && !directlyRelated,
            focusLabel: t(locale, "workspace.graph2d.node.focus", {
              title: node.title,
            }),
            focusNode,
            onSelect,
            previewConnectionLabel: t(locale, "workspace.graph2d.preview.connections"),
            selectLabel: t(locale, "workspace.graph2d.node.select", {
              title: node.title,
            }),
            selected,
            showLabel: node.showLabel || selected || relatedLabelIds.has(node.id),
          },
        };
      }),
    [
      connectionCounts,
      focusNode,
      locale,
      network.nodes,
      onSelect,
      relatedLabelIds,
      relatedNodeIds,
      selectedId,
    ],
  );
  const edges: Edge[] = useMemo(
    () =>
      network.edges.map((edge) => {
        const highlighted =
          Boolean(selectedId) &&
          (edge.sourceNodeId === selectedId || edge.targetNodeId === selectedId);

        return {
          id: edge.id,
          source: edge.sourceNodeId,
          target: edge.targetNodeId,
          type: "straight",
          interactionWidth: 14,
          style: {
            stroke: GRAPH_TONE_COLORS[edge.tone ?? "source"],
            strokeOpacity: highlighted ? 0.82 : selectedId ? 0.08 : 0.24,
            strokeWidth: highlighted ? 1.8 : 0.8,
          },
        };
      }),
    [network.edges, selectedId],
  );
  const categoryCounts = useMemo(() => {
    const counts = new Map<KnowledgeGraphCategory, number>(
      CATEGORY_ORDER.map((category) => [category, 0]),
    );
    for (const node of graph.nodes) {
      const category = knowledgeGraphCategory(node);
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return counts;
  }, [graph.nodes]);

  useEffect(() => {
    const instance = flowRef.current;
    if (!instance) return;
    const frame = window.requestAnimationFrame(() => {
      void instance.fitView({ duration: 280, maxZoom: 1.02, padding: 0.2 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeCategories, focusNodeId]);

  function toggleCategory(category: KnowledgeGraphCategory) {
    setActiveCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        if (next.size === 1) return current;
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  return (
    <section
      aria-label={t(locale, "workspace.graph2d.aria")}
      className="canvas-stage knowledge-graph-stage"
    >
      <header className="canvas-stage__header knowledge-graph-stage__header">
        <div>
          <p>{t(locale, "workspace.graph2d.kicker")}</p>
          <h2>{t(locale, "workspace.graph2d.title")}</h2>
          <span className="canvas-stage__description">
            {t(locale, "workspace.graph2d.description")}
          </span>
        </div>
        <div className="knowledge-graph-count" aria-live="polite">
          {t(locale, "workspace.graph2d.count", {
            total: network.totalEligibleNodeCount,
            visible: network.nodes.length,
          })}
        </div>
      </header>
      <ReactFlow
        edges={edges}
        fitView
        fitViewOptions={{ maxZoom: 1.02, padding: 0.2 }}
        maxZoom={1.8}
        minZoom={0.2}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable={false}
        nodesFocusable={false}
        nodeTypes={nodeTypes}
        onInit={(instance) => {
          flowRef.current = instance;
        }}
        panOnDrag
        panOnScroll
        proOptions={{ hideAttribution: true }}
        selectNodesOnDrag={false}
        zoomOnDoubleClick={false}
        zoomOnPinch
        zoomOnScroll
      >
        <Background
          color="var(--line)"
          gap={54}
          size={1}
          variant={BackgroundVariant.Dots}
        />
        <Controls showInteractive={false} />
        <Panel className="knowledge-graph-filter" position="top-left">
          <span>{t(locale, "workspace.graph2d.filter.aria")}</span>
          <div aria-label={t(locale, "workspace.graph2d.filter.aria")} role="group">
            {CATEGORY_ORDER.map((category) => {
              const Icon = CATEGORY_ICONS[category];
              return (
                <button
                  aria-pressed={activeCategories.has(category)}
                  className={activeCategories.has(category) ? "is-active" : ""}
                  key={category}
                  onClick={() => toggleCategory(category)}
                  type="button"
                >
                  <Icon aria-hidden="true" className="size-3" />
                  {t(locale, `workspace.graph2d.filter.${category}`)}
                  <small>{categoryCounts.get(category) ?? 0}</small>
                </button>
              );
            })}
          </div>
          {focusNodeId ? (
            <button
              className="knowledge-graph-reset"
              onClick={() => setFocusNodeId(null)}
              type="button"
            >
              <RotateCcw aria-hidden="true" className="size-3" />
              {t(locale, "workspace.graph2d.focus.reset")}
            </button>
          ) : null}
        </Panel>
        <Panel className="canvas-help" position="bottom-right">
          {t(locale, "workspace.graph2d.hint")}
        </Panel>
      </ReactFlow>
    </section>
  );
}
