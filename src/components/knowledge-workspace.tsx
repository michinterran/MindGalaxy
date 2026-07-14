"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CaptureDrawer } from "@/components/capture-drawer";
import { CapturePanel } from "@/components/capture-panel";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { WorkspaceToolbar } from "@/components/workspace-toolbar";
import { FEATURE_REGISTRY } from "@/config/registry";
import { ExportPanel } from "@/features/export/components/export-panel";
import {
  KnowledgeMapClient,
  KnowledgeMapInspector,
  type RecentCapture,
  type ViewMode,
} from "@/features/knowledge-map/components/knowledge-map-client";
import {
  DEMO_GRAPH_LAYOUT,
  getDemoGraphSnapshot,
  getEmptyGraphSnapshot,
} from "@/features/knowledge-map/demo/demo-graph";
import type { GraphSnapshot } from "@/features/knowledge-map/model/graph";
import { projectGraphSnapshot } from "@/features/knowledge-map/model/projection";
import {
  SearchCommandPanel,
  type SearchPanelState,
} from "@/features/search/components/search-command-panel";
import {
  isAbortError,
  isLatestSearchRequest,
  searchKnowledge,
} from "@/features/search/api/search-client";
import type { SearchResult } from "@/features/search/model/schemas";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

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

export function KnowledgeWorkspace({
  captureCount,
  graph,
  locale = DEFAULT_LOCALE,
  recentCaptures,
  userEmail,
  workspace,
}: KnowledgeWorkspaceProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("mindmap");
  const [searchQuery, setSearchQuery] = useState("");
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [showCapturePanel, setShowCapturePanel] = useState(false);
  const [selectedCaptureId, setSelectedCaptureId] = useState<string | null>(null);
  const [searchState, setSearchState] = useState<SearchPanelState>({
    answer: null,
    error: null,
    query: "",
    results: [],
    status: "idle",
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const requestSequenceRef = useRef(0);
  const graphState = useMemo(
    () =>
      resolveGraphSnapshot({
        captureCount,
        graph,
        locale,
        workspaceId: workspace.id,
      }),
    [captureCount, graph, locale, workspace.id],
  );
  const projection = useMemo(
    () => projectGraphSnapshot(graphState.snapshot, graphState.layout),
    [graphState],
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    projection.nodes[0]?.id ?? null,
  );
  const showHeroCapture = captureCount === 0 && graphState.isDemo;
  const graphNodeIds = useMemo(
    () => new Set(projection.nodes.map((node) => node.id)),
    [projection.nodes],
  );
  const fallbackSelectedId = useMemo(
    () =>
      [...projection.nodes].sort(
        (left, right) =>
          right.importance - left.importance ||
          left.level - right.level ||
          left.title.localeCompare(right.title),
      )[0]?.id ?? null,
    [projection.nodes],
  );
  const effectiveSelectedId =
    selectedId && graphNodeIds.has(selectedId) ? selectedId : fallbackSelectedId;

  useEffect(
    () => () => {
      requestSequenceRef.current += 1;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    },
    [],
  );

  function closeSearchPanel() {
    requestSequenceRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setShowSearchPanel(false);
  }

  function closePanels() {
    closeSearchPanel();
    setShowExportPanel(false);
    setShowCapturePanel(false);
  }

  function openSearchPanel() {
    setShowExportPanel(false);
    setShowCapturePanel(false);
    setShowSearchPanel(true);
  }

  function openExportPanel() {
    closeSearchPanel();
    setShowCapturePanel(false);
    setShowExportPanel(true);
  }

  function openCapturePanel() {
    closeSearchPanel();
    setShowExportPanel(false);
    setShowCapturePanel(true);
  }

  function selectCapture(captureId: string) {
    setSelectedCaptureId(captureId);
    setViewMode("list");
    closePanels();
  }

  function goToMap() {
    setViewMode("mindmap");
    closePanels();
  }

  function goToInbox() {
    setViewMode("list");
    closePanels();
  }

  async function submitSearch() {
    const query = searchQuery.trim();

    if (!query) return;

    requestSequenceRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    const controller = new AbortController();
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    abortControllerRef.current = controller;

    setShowExportPanel(false);
    setShowSearchPanel(true);
    setSearchState({
      answer: null,
      error: null,
      query,
      results: [],
      status: "loading",
    });

    try {
      const payload = await searchKnowledge(
        {
          workspaceId: workspace.id,
          query,
          limit: 10,
          locale,
        },
        { signal: controller.signal },
      );

      if (!isLatestSearchRequest(requestId, requestSequenceRef.current)) return;

      setSearchState({
        answer: payload.answer,
        error: null,
        query: payload.query,
        results: payload.results,
        status: "success",
      });
    } catch (error) {
      if (isAbortError(error)) return;
      if (!isLatestSearchRequest(requestId, requestSequenceRef.current)) return;

      setSearchState({
        answer: null,
        error: null,
        query,
        results: [],
        status: "error",
      });
    }
  }

  function selectSearchResult(result: SearchResult) {
    const nodeId = result.resultId.startsWith("node:")
      ? result.resultId.slice("node:".length)
      : null;

    if (nodeId && graphNodeIds.has(nodeId)) {
      setSelectedId(nodeId);
      setViewMode("mindmap");
      closeSearchPanel();
      return;
    }

    const captureId =
      result.captureId ??
      (result.resultId.startsWith("capture:")
        ? result.resultId.slice("capture:".length)
        : null);

    if (result.sourceType === "capture" && captureId) {
      selectCapture(captureId);
    }
  }

  const activeSection = showExportPanel
    ? "export"
    : showSearchPanel
      ? "search"
      : viewMode === "list"
        ? "inbox"
        : "map";

  return (
    <main className="mindgalaxy-app">
      <WorkspaceSidebar
        activeSection={activeSection}
        captureCount={captureCount}
        locale={locale}
        onExportClick={openExportPanel}
        onHomeClick={goToMap}
        onInboxClick={goToInbox}
        onMapClick={goToMap}
        onNewMaterialClick={openCapturePanel}
        onRecentCaptureClick={selectCapture}
        onSearchClick={openSearchPanel}
        recentCaptures={recentCaptures}
        selectedCaptureId={selectedCaptureId}
        userEmail={userEmail}
      />
      <section className="workspace-shell">
        <WorkspaceToolbar
          current={viewMode}
          locale={locale}
          onChange={setViewMode}
          onSearchSubmit={submitSearch}
          searchInputRef={searchInputRef}
          searchQuery={searchQuery}
          searchStatus={searchState.status}
          setSearchQuery={setSearchQuery}
          workspaceName={workspace.name}
        />
        <div className="workspace-grid">
          {showHeroCapture ? (
            <div className="workspace-stack">
              <CapturePanel locale={locale} workspaceId={workspace.id} variant="hero" />
              <KnowledgeMapClient
                graph={projection}
                isDemo={graphState.isDemo}
                locale={locale}
                onSelect={setSelectedId}
                onSelectCapture={selectCapture}
                recentCaptures={recentCaptures}
                selectedCaptureId={selectedCaptureId}
                selectedId={effectiveSelectedId}
                viewMode={viewMode}
              />
            </div>
          ) : (
            <KnowledgeMapClient
              graph={projection}
              isDemo={graphState.isDemo}
              locale={locale}
              onSelect={setSelectedId}
              onSelectCapture={selectCapture}
              recentCaptures={recentCaptures}
              selectedCaptureId={selectedCaptureId}
              selectedId={effectiveSelectedId}
              viewMode={viewMode}
            />
          )}
          {showCapturePanel ? (
            <CaptureDrawer
              locale={locale}
              onClose={() => setShowCapturePanel(false)}
              workspaceId={workspace.id}
            />
          ) : showSearchPanel ? (
            <SearchCommandPanel
              locale={locale}
              onClose={closeSearchPanel}
              onSelectResult={selectSearchResult}
              state={searchState}
            />
          ) : showExportPanel ? (
            <ExportPanel
              disabled={!projection.nodes.length || graphState.snapshot.source !== "workspace"}
              locale={locale}
              onClose={() => setShowExportPanel(false)}
              workspaceId={workspace.id}
            />
          ) : (
            <KnowledgeMapInspector
              captureCount={captureCount}
              graph={projection}
              locale={locale}
              selectedId={effectiveSelectedId}
            />
          )}
        </div>
      </section>
    </main>
  );
}
