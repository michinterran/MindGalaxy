"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WORKSPACE_REGISTRY } from "@/config/registry";
import type { WorkspaceArea } from "@/features/workspace/model/navigation";
import type {
  ViewMode,
} from "@/features/knowledge-map/components/knowledge-map-client";
import type { RecentCapture } from "@/features/knowledge-map/model/readiness";
import {
  canMutateGraphNode,
  type GraphProjection,
} from "@/features/knowledge-map/model/graph";
import type { SearchPanelState } from "@/features/search/components/search-command-panel";
import {
  isAbortError,
  isLatestSearchRequest,
  searchKnowledge,
} from "@/features/search/api/search-client";
import type { SearchResult } from "@/features/search/model/schemas";
import type { Locale } from "@/lib/i18n";

export type WorkspaceController = ReturnType<typeof useWorkspaceController>;

export function useWorkspaceController({
  captureCount,
  graph,
  locale,
  recentCaptures,
  workspaceId,
}: {
  captureCount: number;
  graph: GraphProjection;
  locale: Locale;
  recentCaptures: RecentCapture[];
  workspaceId: string;
}) {
  const router = useRouter();
  const hasActiveJobs = recentCaptures.some((capture) =>
    WORKSPACE_REGISTRY.activeStatuses.some(
      (status) => status === capture.processingStatus,
    ),
  );
  const [activeArea, setActiveArea] = useState<WorkspaceArea>("knowledge");
  const [viewMode, setViewMode] = useState<ViewMode>("mindmap");
  const [searchQuery, setSearchQuery] = useState("");
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [showCapturePanel, setShowCapturePanel] = useState(false);
  const [selectedCaptureId, setSelectedCaptureId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const graphNodeIds = useMemo(
    () => new Set(graph.nodes.map((node) => node.id)),
    [graph.nodes],
  );
  const effectiveSelectedId =
    selectedId && graphNodeIds.has(selectedId) ? selectedId : null;

  useEffect(() => {
    if (!hasActiveJobs) return;
    const intervalId = window.setInterval(
      () => router.refresh(),
      WORKSPACE_REGISTRY.activeJobPollIntervalMs,
    );
    return () => window.clearInterval(intervalId);
  }, [hasActiveJobs, router]);

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

  function openExportPanel() {
    closeSearchPanel();
    setShowCapturePanel(false);
    setShowExportPanel(true);
  }

  function closeExportPanel() {
    setShowExportPanel(false);
  }

  function openCapturePanel() {
    closeSearchPanel();
    setShowExportPanel(false);
    setSelectedCaptureId(null);
    setSelectedId(null);
    setShowCapturePanel(true);
  }

  function closeCapturePanel() {
    setShowCapturePanel(false);
  }

  function closeLibraryDetail() {
    setSelectedCaptureId(null);
  }

  function closeNodeInspector() {
    setSelectedId(null);
  }

  function selectCapture(captureId: string) {
    setSelectedCaptureId(captureId);
    setSelectedId(null);
    setActiveArea("library");
    setViewMode("list");
    closePanels();
  }

  function changeArea(area: WorkspaceArea) {
    setActiveArea(area);
    setSelectedId(null);
    if (area === "library") {
      setViewMode("list");
    } else if (viewMode === "list") {
      setViewMode("mindmap");
      setSelectedCaptureId(null);
    }
    closePanels();
  }

  function changeMapView(mode: Extract<ViewMode, "mindmap" | "graph" | "galaxy">) {
    setActiveArea("knowledge");
    setViewMode(mode);
    setSelectedCaptureId(null);
    closePanels();
  }

  async function submitSearch() {
    const query = searchQuery.trim();
    if (!query) return;

    requestSequenceRef.current += 1;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    abortControllerRef.current = controller;

    setShowExportPanel(false);
    setShowCapturePanel(false);
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
          workspaceId,
          query,
          limit: WORKSPACE_REGISTRY.searchResultLimit,
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
      setSelectedCaptureId(null);
      setActiveArea("knowledge");
      setViewMode("mindmap");
      closeSearchPanel();
      return;
    }

    const captureId =
      result.captureId ??
      (result.resultId.startsWith("capture:")
        ? result.resultId.slice("capture:".length)
        : null);

    if (result.sourceType === "capture" && captureId) selectCapture(captureId);
  }

  const showFirstRun =
    captureCount === 0 &&
    !showCapturePanel &&
    !showSearchPanel &&
    !showExportPanel;
  const showNodeInspector =
    activeArea === "knowledge" &&
    Boolean(effectiveSelectedId && canMutateGraphNode(effectiveSelectedId)) &&
    !showSearchPanel &&
    !showExportPanel &&
    !showFirstRun;
  const showLibraryDetail =
    activeArea === "library" &&
    Boolean(selectedCaptureId) &&
    !showSearchPanel &&
    !showExportPanel;
  const showSidePanel =
    showSearchPanel || showExportPanel || showNodeInspector || showLibraryDetail;

  return {
    activeArea,
    changeArea,
    changeMapView,
    closeCapturePanel,
    closeExportPanel,
    closeLibraryDetail,
    closeNodeInspector,
    closeSearchPanel,
    effectiveSelectedId,
    openCapturePanel,
    openExportPanel,
    refresh: router.refresh,
    searchInputRef,
    searchQuery,
    searchState,
    selectCapture,
    selectNode: setSelectedId,
    selectSearchResult,
    selectedCaptureId,
    setSearchQuery,
    showCapturePanel,
    showExportPanel,
    showFirstRun,
    showLibraryDetail,
    showNodeInspector,
    showSearchPanel,
    showSidePanel,
    submitSearch,
    viewMode,
  };
}
