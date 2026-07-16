"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Panel,
  type Edge,
  type Node,
  type ReactFlowInstance,
  useNodesState,
} from "reactflow";
import {
  canPersistMindMapNodePosition,
  type MindMapBranchState,
  toggleMindMapBranch,
} from "@/features/knowledge-map/components/mind-map-interactions";
import {
  MindMapNode,
  type MindMapNodeData,
} from "@/features/knowledge-map/components/mind-map-node";
import { GRAPH_INTERACTION_REGISTRY } from "@/config/registry";
import {
  createKeyedDebouncer,
  type KeyedDebouncer,
} from "@/features/graph-mutations/model/keyed-debouncer";
import {
  GRAPH_TONE_COLORS,
  type GraphProjection,
  type GraphTone,
  type MindMapProjectedNode,
  type MindMapProjection,
} from "@/features/knowledge-map/model/graph";
import {
  projectMindMapProjection,
  shortestGraphPath,
} from "@/features/knowledge-map/model/projection";
import { t, type Locale, type MessageKey } from "@/lib/i18n";

const nodeTypes = {
  mindNode: MindMapNode,
};

type NodePosition = { x: number; y: number };
type PendingNodePosition = {
  attempt: number;
  position: NodePosition;
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

function selectedPathIds(graph: MindMapProjection, selectedId: string | null) {
  if (!selectedId) return new Set<string>();
  const path = shortestGraphPath(
    { edges: graph.treeEdges, nodes: graph.nodes },
    graph.rootId,
    selectedId,
  );

  return new Set(path.length ? path : [selectedId]);
}

function nodeCenter(node: MindMapProjectedNode) {
  const width = node.importance > 0.74 ? 286 : node.importance > 0.42 ? 252 : 224;
  const height = node.importance > 0.74 ? 112 : node.importance > 0.42 ? 92 : 78;

  return {
    x: node.position.x + width / 2,
    y: node.position.y + height / 2,
  };
}

function placeRootInReadableViewport(
  instance: ReactFlowInstance<MindMapNodeData>,
  center: { x: number; y: number },
  stage: HTMLElement | null,
  duration = 0,
) {
  const width = stage?.clientWidth ?? 1280;
  const height = Math.max(420, (stage?.clientHeight ?? 760) - 72);
  const zoom = width < 760 ? 0.78 : 0.9;
  const targetX = width < 760 ? 56 : Math.min(168, Math.max(96, width * 0.12));

  void instance.setViewport(
    {
      x: targetX - center.x * zoom,
      y: height / 2 - center.y * zoom,
      zoom,
    },
    { duration },
  );
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
  const stageRef = useRef<HTMLElement>(null);
  const flowInstanceRef = useRef<ReactFlowInstance<MindMapNodeData> | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(selectedId);
  const [branchState, setBranchState] = useState<MindMapBranchState>({
    collapsedNodeIds: new Set(),
    expandedNodeIds: new Set(),
  });
  const mindMap = useMemo(
    () =>
      projectMindMapProjection(graph, {
        collapsedNodeIds: [...branchState.collapsedNodeIds],
        expandedNodeIds: [...branchState.expandedNodeIds],
        focusNodeId,
      }),
    [branchState, focusNodeId, graph],
  );
  const visibleNodeIds = useMemo(
    () => new Set(mindMap.nodes.map((node) => node.id)),
    [mindMap.nodes],
  );
  const highlightedNodeIds = useMemo(
    () => selectedPathIds(mindMap, selectedId),
    [mindMap, selectedId],
  );

  const centerNode = useCallback(
    (nodeId: string) => {
      const instance = flowInstanceRef.current;
      const node = mindMap.nodes.find((candidate) => candidate.id === nodeId);
      if (!instance || !node) return;
      const center = nodeCenter(node);

      void instance.setCenter(center.x, center.y, {
        duration: 260,
        zoom: Math.max(0.88, instance.getZoom()),
      });
    },
    [mindMap.nodes],
  );

  const handleNodeSelect = useCallback(
    (nodeId: string) => {
      onSelect(nodeId);
      centerNode(nodeId);
    },
    [centerNode, onSelect],
  );

  const handleNodeFocus = useCallback(
    (nodeId: string) => {
      setBranchState({ collapsedNodeIds: new Set(), expandedNodeIds: new Set() });
      setFocusNodeId(nodeId);
      onSelect(nodeId);
    },
    [onSelect],
  );

  const handleToggleBranch = useCallback((nodeId: string, isExpanded: boolean) => {
    setBranchState((current) => toggleMindMapBranch(nodeId, isExpanded, current));
  }, []);

  const projectedNodes: Node<MindMapNodeData>[] = useMemo(
    () =>
      mindMap.nodes.map((node) => ({
        id: node.id,
        type: "mindNode",
        position: node.position,
        data: {
          ...node,
          collapseLabel: t(locale, "workspace.graph.branch.collapse", {
            title: node.title,
          }),
          expandLabel: t(locale, "workspace.graph.branch.expand", {
            count: node.hiddenChildCount,
            title: node.title,
          }),
          focusLabel: t(locale, "workspace.graph.node.focus", {
            title: node.title,
          }),
          highlighted: highlightedNodeIds.has(node.id),
          onFocus: handleNodeFocus,
          onSelect: handleNodeSelect,
          onToggleBranch: handleToggleBranch,
          selectLabel: t(locale, "workspace.graph.node.select", {
            title: node.title,
          }),
          selected: selectedId === node.id,
        },
        draggable: true,
        focusable: false,
        selectable: false,
      })),
    [
      handleNodeFocus,
      handleNodeSelect,
      handleToggleBranch,
      highlightedNodeIds,
      locale,
      mindMap.nodes,
      selectedId,
    ],
  );
  const [nodes, setNodes, onNodesChange] =
    useNodesState<MindMapNodeData>(projectedNodes);
  const previousRootIdRef = useRef(mindMap.rootId);
  const [positionStatus, setPositionStatus] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const positionSaverRef = useRef<
    KeyedDebouncer<string, PendingNodePosition> | null
  >(null);
  const positionAttemptRef = useRef(0);

  useEffect(() => {
    const rootChanged = previousRootIdRef.current !== mindMap.rootId;
    previousRootIdRef.current = mindMap.rootId;

    setNodes((currentNodes) =>
      projectedNodes.map((projectedNode) => ({
        ...projectedNode,
        position: rootChanged
          ? projectedNode.position
          : currentNodes.find((currentNode) => currentNode.id === projectedNode.id)
              ?.position ?? projectedNode.position,
      })),
    );
  }, [mindMap.rootId, projectedNodes, setNodes]);

  useEffect(() => {
    if (!selectedId || visibleNodeIds.has(selectedId)) return;
    if (!graph.nodes.some((node) => node.id === selectedId)) return;

    let isCurrent = true;
    window.queueMicrotask(() => {
      if (!isCurrent) return;
      setBranchState({ collapsedNodeIds: new Set(), expandedNodeIds: new Set() });
      setFocusNodeId(selectedId);
    });

    return () => {
      isCurrent = false;
    };
  }, [graph.nodes, selectedId, visibleNodeIds]);

  const rootNode = useMemo(
    () => mindMap.nodes.find((node) => node.id === mindMap.rootId) ?? null,
    [mindMap.nodes, mindMap.rootId],
  );
  const rootCenter = rootNode ? nodeCenter(rootNode) : null;
  const rootCenterX = rootCenter?.x;
  const rootCenterY = rootCenter?.y;

  useEffect(() => {
    const instance = flowInstanceRef.current;
    if (!instance || rootCenterX === undefined || rootCenterY === undefined) return;
    const frame = window.requestAnimationFrame(() => {
      placeRootInReadableViewport(
        instance,
        { x: rootCenterX, y: rootCenterY },
        stageRef.current,
        280,
      );
    });

    return () => window.cancelAnimationFrame(frame);
  }, [mindMap.rootId, rootCenterX, rootCenterY]);

  useEffect(() => {
    if (!onNodePositionChange || isDemo) {
      positionSaverRef.current = null;
      return;
    }

    let isCurrent = true;
    const positionSaver = createKeyedDebouncer(
      async (nodeId: string, pending: PendingNodePosition) => {
        try {
          await onNodePositionChange(nodeId, pending.position);
          if (isCurrent && positionAttemptRef.current === pending.attempt) {
            setPositionStatus("success");
          }
        } catch {
          if (isCurrent && positionAttemptRef.current === pending.attempt) {
            setPositionStatus("error");
          }
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

  const edges: Edge[] = useMemo(() => {
    const visibleCrossEdges = selectedId
      ? mindMap.crossEdges.filter(
          (edge) =>
            edge.sourceNodeId === selectedId || edge.targetNodeId === selectedId,
        )
      : [];

    return [
      ...mindMap.treeEdges.map((edge) => ({ edge, isCrossEdge: false })),
      ...visibleCrossEdges.map((edge) => ({ edge, isCrossEdge: true })),
    ].map(({ edge, isCrossEdge }) => {
      const edgeTone = edge.tone ?? "source";
      const isHighlighted =
        Boolean(selectedId) &&
        (isCrossEdge
          ? edge.sourceNodeId === selectedId || edge.targetNodeId === selectedId
          : highlightedNodeIds.has(edge.sourceNodeId) &&
            highlightedNodeIds.has(edge.targetNodeId));

      return {
        id: `${isCrossEdge ? "cross" : "tree"}-${edge.id}`,
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
          strokeDasharray: isCrossEdge ? "5 6" : undefined,
          strokeOpacity: isHighlighted ? 0.86 : selectedId ? 0.14 : 0.34,
          strokeWidth: isHighlighted ? 2.2 : 1.15,
        },
      };
    });
  }, [highlightedNodeIds, locale, mindMap.crossEdges, mindMap.treeEdges, selectedId]);

  const legendTones: GraphTone[] = ["source", "ai", "evidence", "context", "action"];

  function persistNodePosition(nodeId: string, position: NodePosition) {
    const attempt = positionAttemptRef.current + 1;
    positionAttemptRef.current = attempt;
    if (
      !canPersistMindMapNodePosition({
        hasPersistenceHandler: Boolean(onNodePositionChange),
        isDemo,
        nodeId,
      }) ||
      !positionSaverRef.current
    ) {
      setPositionStatus("idle");
      return;
    }
    setPositionStatus("saving");
    positionSaverRef.current.schedule(nodeId, { attempt, position });
  }

  return (
    <section
      aria-label={t(locale, "workspace.graph.mindMapAria")}
      className="canvas-stage"
      ref={stageRef}
    >
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
          <div className="mind-map-scope" aria-live="polite">
            <span>
              {t(locale, "workspace.graph.projectionSummary", {
                total: mindMap.totalNodeCount,
                visible: mindMap.visibleNodeCount,
              })}
            </span>
            {mindMap.unorganizedGroup ? (
              <span>
                {t(locale, "workspace.graph.unorganizedSummary", {
                  count: mindMap.unorganizedGroup.count,
                })}
              </span>
            ) : null}
          </div>
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
        defaultViewport={{ x: 96, y: 120, zoom: 0.9 }}
        edges={edges}
        elementsSelectable={false}
        maxZoom={1.45}
        minZoom={0.5}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable
        nodesFocusable={false}
        nodeTypes={nodeTypes}
        onInit={(instance) => {
          flowInstanceRef.current = instance;
          if (rootCenter) {
            window.requestAnimationFrame(() => {
              placeRootInReadableViewport(instance, rootCenter, stageRef.current);
            });
          }
        }}
        onNodeDragStop={(_, node) => {
          persistNodePosition(node.id, node.position);
        }}
        onNodesChange={onNodesChange}
        panOnDrag
        panOnScroll
        proOptions={{ hideAttribution: true }}
        selectNodesOnDrag={false}
        zoomOnDoubleClick={false}
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
          <span
            aria-live={positionStatus === "error" ? "assertive" : "polite"}
            role={positionStatus === "error" ? "alert" : "status"}
          >
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
