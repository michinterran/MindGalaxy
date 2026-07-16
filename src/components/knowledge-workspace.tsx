"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Download, Map as MapIcon, Orbit, Share2 } from "lucide-react";
import { CaptureDrawer } from "@/components/capture-drawer";
import { CapturePanel, type CaptureDraft } from "@/components/capture-panel";
import { WorkspaceToolbar } from "@/components/workspace-toolbar";
import {
  FEATURE_REGISTRY,
  WORKSPACE_REGISTRY,
} from "@/config/registry";
import { ExportPanel } from "@/features/export/components/export-panel";
import { KnowledgeMapClient } from "@/features/knowledge-map/components/knowledge-map-client";
import { LibraryOrganizerContainer } from "@/features/library-organizer/components/library-organizer-container";
import { shouldAutoOpenKnowledge } from "@/features/library-organizer/model/capture-organization";
import type { CreateCaptureResponse } from "@/features/capture/api/capture-client";
import {
  createGraphEdge,
  deleteGraphEdge,
  deleteGraphNode,
  updateGraphNode,
} from "@/features/graph-mutations/api/graph-mutations-client";
import {
  NodeInspector,
  type NodeInspectorActions,
} from "@/features/graph-mutations/components/node-inspector";
import {
  deleteCapture,
  getCaptureDetail,
  reconnectProcessingJob,
  retryProcessingJob,
  updateCaptureTitle,
} from "@/features/library/api/library-client";
import {
  LibraryDetailPanel,
  type LibraryDetailActions,
} from "@/features/library/components/library-detail-panel";
import {
  DEMO_GRAPH_LAYOUT,
  getDemoGraphSnapshot,
  getEmptyGraphSnapshot,
} from "@/features/knowledge-map/demo/demo-graph";
import {
  canMutateGraphNode,
  type GraphSnapshot,
} from "@/features/knowledge-map/model/graph";
import type { RecentCapture } from "@/features/knowledge-map/model/readiness";
import { projectGraphSnapshot } from "@/features/knowledge-map/model/projection";
import { SearchCommandPanel } from "@/features/search/components/search-command-panel";
import { useWorkspaceController } from "@/features/workspace/hooks/use-workspace-controller";
import { DEFAULT_LOCALE, t, type Locale } from "@/lib/i18n";

type KnowledgeWorkspaceProps = {
  workspace: {
    id: string;
    name: string;
  };
  userEmail?: string | null;
  captureCount: number;
  recentCaptures: RecentCapture[];
  graph?: GraphSnapshot | null;
  locale?: Locale;
};

function resolveGraphSnapshot({
  captureCount,
  graph,
  locale,
  workspaceId,
}: {
  captureCount: number;
  graph?: GraphSnapshot | null;
  locale: Locale;
  workspaceId: string;
}) {
  if (graph?.source === "demo" && !FEATURE_REGISTRY.demoGraphFallback) {
    return {
      isDemo: false,
      layout: undefined,
      snapshot: getEmptyGraphSnapshot(workspaceId),
    };
  }

  if (graph) {
    return {
      isDemo: graph.source === "demo",
      layout: graph.source === "demo" ? DEMO_GRAPH_LAYOUT : undefined,
      snapshot: graph,
    };
  }

  if (captureCount === 0 && FEATURE_REGISTRY.demoGraphFallback) {
    return {
      isDemo: true,
      layout: DEMO_GRAPH_LAYOUT,
      snapshot: getDemoGraphSnapshot(locale, workspaceId),
    };
  }

  return {
    isDemo: false,
    layout: undefined,
    snapshot: getEmptyGraphSnapshot(workspaceId),
  };
}

function optimisticRecentCapture(
  result: CreateCaptureResponse,
  draft: CaptureDraft,
): RecentCapture {
  return {
    id: result.capture.id,
    title: result.capture.title ?? draft.title,
    rawTextLength: draft.rawText.length,
    rawTextPreview: draft.rawText.replace(/\s+/g, " ").trim().slice(0, 180),
    sourceKind: result.capture.source_kind,
    createdAt: result.capture.created_at,
    processingJobId: result.processingJob.id,
    processingStatus: result.processingJob.status,
    processingCreatedAt: result.processingJob.created_at,
    processingNextRunAt: result.processingJob.created_at,
    processingUpdatedAt: result.processingJob.created_at,
    retryCount: 0,
  };
}

export function KnowledgeWorkspace({
  captureCount,
  graph,
  locale = DEFAULT_LOCALE,
  recentCaptures,
  userEmail,
  workspace,
}: KnowledgeWorkspaceProps) {
  const [optimisticCapture, setOptimisticCapture] = useState<RecentCapture | null>(null);
  const visibleRecentCaptures = useMemo(() => {
    if (!optimisticCapture || recentCaptures.some((capture) => capture.id === optimisticCapture.id)) {
      return recentCaptures;
    }
    return [optimisticCapture, ...recentCaptures];
  }, [optimisticCapture, recentCaptures]);
  const visibleCaptureCount = Math.max(captureCount, visibleRecentCaptures.length);
  const hasActiveAnalysis = visibleRecentCaptures.some((capture) =>
    WORKSPACE_REGISTRY.activeStatuses.some(
      (status) => status === capture.processingStatus,
    ),
  );
  const graphState = useMemo(
    () =>
      resolveGraphSnapshot({
        captureCount: visibleCaptureCount,
        graph,
        locale,
        workspaceId: workspace.id,
      }),
    [graph, locale, visibleCaptureCount, workspace.id],
  );
  const projection = useMemo(
    () => projectGraphSnapshot(graphState.snapshot, graphState.layout),
    [graphState],
  );
  const controller = useWorkspaceController({
    captureCount: visibleCaptureCount,
    graph: projection,
    locale,
    recentCaptures: visibleRecentCaptures,
    workspaceId: workspace.id,
  });
  const refreshWorkspace = controller.refresh;
  const positionSaveQueueRef = useRef(new Map<string, Promise<void>>());
  const nodeActions = useMemo<NodeInspectorActions>(
    () => ({
      createEdge: async ({ kind, label, sourceNodeId, targetNodeId }) => {
        await createGraphEdge({
          workspaceId: workspace.id,
          sourceNodeId,
          targetNodeId,
          kind,
          label: label ?? null,
        });
        refreshWorkspace();
      },
      deleteEdge: async (edgeId) => {
        await deleteGraphEdge(edgeId);
        refreshWorkspace();
      },
      deleteNode: async (nodeId) => {
        await deleteGraphNode(nodeId);
        refreshWorkspace();
      },
      updateNode: async (nodeId, input) => {
        await updateGraphNode(nodeId, input);
        refreshWorkspace();
      },
    }),
    [refreshWorkspace, workspace.id],
  );
  const saveNodePosition = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      if (!canMutateGraphNode(nodeId)) return Promise.resolve();

      const previous = positionSaveQueueRef.current.get(nodeId) ?? Promise.resolve();
      const next = previous
        .catch(() => undefined)
        .then(async () => {
          await updateGraphNode(nodeId, { position });
        });

      positionSaveQueueRef.current.set(nodeId, next);
      void next.then(
        () => {
          if (positionSaveQueueRef.current.get(nodeId) === next) {
            positionSaveQueueRef.current.delete(nodeId);
          }
        },
        () => {
          if (positionSaveQueueRef.current.get(nodeId) === next) {
            positionSaveQueueRef.current.delete(nodeId);
          }
        },
      );

      return next;
    },
    [],
  );
  const libraryActions = useMemo<LibraryDetailActions>(
    () => ({
      deleteCapture: async (captureId) => {
        await deleteCapture(captureId);
        refreshWorkspace();
      },
      loadCapture: getCaptureDetail,
      reconnectProcessing: async (jobId) => {
        await reconnectProcessingJob(jobId);
        refreshWorkspace();
      },
      retryProcessing: async (jobId) => {
        await retryProcessingJob(jobId);
        refreshWorkspace();
      },
      updateTitle: async (captureId, title) => {
        await updateCaptureTitle(captureId, { title });
        refreshWorkspace();
      },
    }),
    [refreshWorkspace],
  );
  const rememberCapture = useCallback(
    (result: CreateCaptureResponse, draft: CaptureDraft) => {
      setOptimisticCapture(optimisticRecentCapture(result, draft));
    },
    [],
  );
  return (
    <main className="mindgalaxy-app">
      <section className="workspace-shell">
        <WorkspaceToolbar
          activeArea={controller.activeArea}
          captureCount={visibleCaptureCount}
          locale={locale}
          onAreaChange={controller.changeArea}
          onNewMaterialClick={controller.openCapturePanel}
          onSearchSubmit={controller.submitSearch}
          searchInputRef={controller.searchInputRef}
          searchQuery={controller.searchQuery}
          searchStatus={controller.searchState.status}
          setSearchQuery={controller.setSearchQuery}
          userEmail={userEmail}
          workspaceName={workspace.name}
        />
        {controller.showCapturePanel ? (
          <CaptureDrawer
            locale={locale}
            onClose={controller.closeCapturePanel}
            onCaptureCreated={rememberCapture}
            onViewKnowledge={() => {
              controller.closeCapturePanel();
              controller.changeArea("knowledge");
            }}
            workspaceId={workspace.id}
          />
        ) : null}
        <div className={`workspace-grid ${controller.showSidePanel ? "" : "workspace-grid--single"}`}>
          {controller.showFirstRun ? (
            <section className="first-run-stage">
              <div className="first-run-stage__intro">
                <p className="ui-kicker">{t(locale, "brand.philosophy")}</p>
                <h2
                  aria-label={t(locale, "onboarding.title")}
                  className="semantic-headline"
                >
                  <span aria-hidden="true">{t(locale, "onboarding.titleLine1")}</span>
                  <span aria-hidden="true">{t(locale, "onboarding.titleLine2")}</span>
                </h2>
                <p>{t(locale, "onboarding.description")}</p>
                <div className="first-run-stage__trust">
                  <span>{t(locale, "onboarding.trust.source")}</span>
                  <span>{t(locale, "onboarding.trust.ai")}</span>
                  <span>{t(locale, "onboarding.trust.retrieve")}</span>
                </div>
              </div>
              <CapturePanel
                autoFocus
                locale={locale}
                onCaptureCreated={(result, draft) => {
                  rememberCapture(result, draft);
                  if (shouldAutoOpenKnowledge(Boolean(draft.organizationFailed))) {
                    controller.changeArea("knowledge");
                  }
                }}
                onViewKnowledge={() => controller.changeArea("knowledge")}
                variant="hero"
                workspaceId={workspace.id}
              />
            </section>
          ) : (
            <section className="knowledge-stage">
              {controller.activeArea === "knowledge" ? (
                <div className="knowledge-local-toolbar">
                  <div className="knowledge-view-switch" aria-label={t(locale, "workspace.toolbar.viewModeAria")}>
                    <button
                      aria-pressed={controller.viewMode === "mindmap"}
                      className={controller.viewMode === "mindmap" ? "is-active" : ""}
                      onClick={() => controller.changeMapView("mindmap")}
                      type="button"
                    >
                      <MapIcon className="size-4" />
                      {t(locale, "workspace.view.mindmap")}
                    </button>
                    <button
                      aria-pressed={controller.viewMode === "graph"}
                      className={controller.viewMode === "graph" ? "is-active" : ""}
                      onClick={() => controller.changeMapView("graph")}
                      type="button"
                    >
                      <Share2 className="size-4" />
                      {t(locale, "workspace.view.graph")}
                    </button>
                    <button
                      aria-pressed={controller.viewMode === "galaxy"}
                      className={controller.viewMode === "galaxy" ? "is-active" : ""}
                      onClick={() => controller.changeMapView("galaxy")}
                      type="button"
                    >
                      <Orbit className="size-4" />
                      {t(locale, "workspace.view.galaxy")}
                      <em>{t(locale, "workspace.map.beta")}</em>
                    </button>
                  </div>
                  <button className="knowledge-export-action" onClick={controller.openExportPanel} type="button">
                    <Download className="size-4" />
                    {t(locale, "workspace.nav.export")}
                  </button>
                </div>
              ) : null}
              {controller.activeArea === "library" ? (
                <LibraryOrganizerContainer
                  locale={locale}
                  onOpenCapture={controller.selectCapture}
                  workspaceId={workspace.id}
                />
              ) : (
                <KnowledgeMapClient
                  graph={projection}
                  highlightedNodeIds={controller.searchHighlightedNodeIds}
                  isDemo={graphState.isDemo}
                  locale={locale}
                  onNodePositionChange={saveNodePosition}
                  onNewCapture={controller.openCapturePanel}
                  onReconnectCapture={libraryActions.reconnectProcessing}
                  onRetryCapture={libraryActions.retryProcessing}
                  onSelect={controller.selectNode}
                  onSelectCapture={controller.selectCapture}
                  recentCaptures={visibleRecentCaptures}
                  selectedCaptureId={controller.selectedCaptureId}
                  selectedId={controller.effectiveSelectedId}
                  viewMode={controller.viewMode}
                />
              )}
            </section>
          )}
          {controller.showSearchPanel ? (
            <SearchCommandPanel
              hasActiveAnalysis={hasActiveAnalysis}
              locale={locale}
              onClose={controller.closeSearchPanel}
              onSelectResult={controller.selectSearchResult}
              state={controller.searchState}
            />
          ) : controller.showExportPanel ? (
            <ExportPanel
              disabled={!projection.nodes.length || graphState.snapshot.source !== "workspace"}
              locale={locale}
              onClose={controller.closeExportPanel}
              workspaceId={workspace.id}
            />
          ) : controller.showLibraryDetail && controller.selectedCaptureId ? (
            <LibraryDetailPanel
              actions={libraryActions}
              captureId={controller.selectedCaptureId}
              key={controller.selectedCaptureId}
              locale={locale}
              onClose={controller.closeLibraryDetail}
            />
          ) : controller.showNodeInspector && controller.effectiveSelectedId ? (
            <NodeInspector
              actions={nodeActions}
              graph={projection}
              key={controller.effectiveSelectedId}
              locale={locale}
              onClose={controller.closeNodeInspector}
              onOpenCapture={controller.selectCapture}
              selectedId={controller.effectiveSelectedId}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}
