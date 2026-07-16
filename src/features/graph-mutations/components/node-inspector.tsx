"use client";

import {
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bot,
  Check,
  CircleDot,
  FileText,
  Layers3,
  Link2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type {
  GraphEdge,
  GraphProjection,
  GraphTone,
} from "@/features/knowledge-map/model/graph";
import { GRAPH_TONE_COLORS } from "@/features/knowledge-map/model/graph";
import {
  scheduleUndoableDelete,
  type UndoableDelete,
} from "@/features/graph-mutations/model/undoable-delete";
import { GRAPH_INTERACTION_REGISTRY } from "@/config/registry";
import { connectionCandidatesForNode } from "@/features/graph-mutations/model/connection-candidates";
import { t, type Locale } from "@/lib/i18n";
import { edgeKindLabel } from "@/lib/i18n/labels";
import { EDGE_KINDS } from "@/lib/graph/schema";
import type { EdgeKind } from "@/types/domain";

type InspectorTab = "overview" | "evidence" | "connections";
type MutationStatus = "idle" | "saving" | "success" | "error";

const INSPECTOR_TABS = ["overview", "evidence", "connections"] as const;

export type NodeInspectorActions = {
  createEdge: (input: {
    sourceNodeId: string;
    targetNodeId: string;
    kind: EdgeKind;
    label?: string;
  }) => Promise<void>;
  deleteEdge: (edgeId: string) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  updateNode: (
    nodeId: string,
    input: { title?: string; summary?: string | null },
  ) => Promise<void>;
};

function toneClass(tone: GraphTone) {
  return `mind-node--${tone}`;
}

function linkedNodeId(edge: GraphEdge, nodeId: string) {
  return edge.sourceNodeId === nodeId ? edge.targetNodeId : edge.sourceNodeId;
}

function EdgeOriginIcon({ origin }: { origin: NonNullable<GraphEdge["origin"]> }) {
  if (origin === "ai") return <Bot aria-hidden="true" className="size-3" />;
  if (origin === "user") {
    return <UserRound aria-hidden="true" className="size-3" />;
  }
  return <Layers3 aria-hidden="true" className="size-3" />;
}

export function NodeInspector({
  actions,
  graph,
  locale,
  onClose,
  onOpenCapture,
  selectedId,
}: {
  actions: NodeInspectorActions;
  graph: GraphProjection;
  locale: Locale;
  onClose: () => void;
  onOpenCapture: (captureId: string) => void;
  selectedId: string;
}) {
  const node = graph.nodes.find((candidate) => candidate.id === selectedId) ?? null;
  const [tab, setTab] = useState<InspectorTab>("overview");
  const [title, setTitle] = useState(node?.title ?? "");
  const [summary, setSummary] = useState(node?.summary ?? "");
  const [status, setStatus] = useState<MutationStatus>("idle");
  const [canRetry, setCanRetry] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPendingDeletion, setIsPendingDeletion] = useState(false);
  const [targetNodeId, setTargetNodeId] = useState("");
  const [edgeKind, setEdgeKind] = useState<EdgeKind>(
    GRAPH_INTERACTION_REGISTRY.defaultEdgeKind,
  );
  const [edgeLabel, setEdgeLabel] = useState("");
  const pendingDeleteRef = useRef<UndoableDelete | null>(null);
  const retryActionRef = useRef<(() => Promise<void>) | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const tabIdPrefix = useId();

  const linkedItems = useMemo(() => {
    if (!node) return [];

    return graph.edges
      .filter(
        (edge) =>
          edge.sourceNodeId === node.id || edge.targetNodeId === node.id,
      )
      .map((edge) => ({
        edge,
        node: graph.nodes.find(
          (candidate) => candidate.id === linkedNodeId(edge, node.id),
        ),
      }))
      .filter(
        (item): item is { edge: GraphEdge; node: NonNullable<typeof item.node> } =>
          Boolean(item.node),
      );
  }, [graph.edges, graph.nodes, node]);

  const connectionCandidates = useMemo(
    () => connectionCandidatesForNode(graph.nodes, graph.edges, selectedId),
    [graph.edges, graph.nodes, selectedId],
  );

  useEffect(
    () => () => {
      pendingDeleteRef.current?.cancel();
    },
    [],
  );

  useEffect(() => {
    if (showDeleteConfirm && !deleteDialogRef.current?.open) {
      deleteDialogRef.current?.showModal();
    }
  }, [showDeleteConfirm]);

  if (!node) return null;

  async function runMutation(
    action: () => Promise<void>,
    onSuccess?: () => void,
  ) {
    retryActionRef.current = null;
    setCanRetry(false);
    setStatus("saving");
    try {
      await action();
      setStatus("success");
      onSuccess?.();
    } catch {
      retryActionRef.current = () => runMutation(action, onSuccess);
      setCanRetry(true);
      setStatus("error");
    }
  }

  function saveNode() {
    if (!title.trim()) return;
    void runMutation(() =>
      actions.updateNode(selectedId, {
        title: title.trim(),
        summary: summary.trim() || null,
      }),
    );
  }

  function scheduleDelete() {
    setShowDeleteConfirm(false);
    setIsPendingDeletion(true);
    setStatus("idle");
    pendingDeleteRef.current = scheduleUndoableDelete(
      async () => {
        setIsPendingDeletion(false);
        await runMutation(
          () => actions.deleteNode(selectedId),
          () => {
            pendingDeleteRef.current = null;
            onClose();
          },
        );
      },
      GRAPH_INTERACTION_REGISTRY.deleteUndoDelayMs,
    );
  }

  function undoDelete() {
    const cancelled = pendingDeleteRef.current?.cancel() ?? false;
    if (!cancelled) return;
    pendingDeleteRef.current = null;
    setIsPendingDeletion(false);
  }

  function addConnection() {
    if (!targetNodeId) return;
    void runMutation(
      () =>
        actions.createEdge({
          sourceNodeId: selectedId,
          targetNodeId,
          kind: edgeKind,
          label: edgeLabel.trim() || undefined,
        }),
      () => {
        setTargetNodeId("");
        setEdgeLabel("");
      },
    );
  }

  function removeConnection(edgeId: string) {
    void runMutation(() => actions.deleteEdge(edgeId));
  }

  function retryMutation() {
    void retryActionRef.current?.();
  }

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: InspectorTab,
  ) {
    const currentIndex = INSPECTOR_TABS.indexOf(currentTab);
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % INSPECTOR_TABS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + INSPECTOR_TABS.length) % INSPECTOR_TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = INSPECTOR_TABS.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = INSPECTOR_TABS[nextIndex];
    setTab(nextTab);
    document.getElementById(`${tabIdPrefix}-tab-${nextTab}`)?.focus();
  }

  return (
    <aside
      aria-busy={status === "saving"}
      aria-label={t(locale, "workspace.inspector.selected")}
      className="node-inspector inspector-panel"
    >
      <header className="node-inspector__header">
        <div>
          <p>{t(locale, "workspace.inspector.selected")}</p>
          <h2>{node.title}</h2>
        </div>
        <button
          aria-label={t(locale, "workspace.inspector.close")}
          className="icon-button"
          disabled={status === "saving"}
          onClick={onClose}
          type="button"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="node-inspector__tabs" role="tablist">
        {INSPECTOR_TABS.map((item) => (
          <button
            aria-controls={`${tabIdPrefix}-panel-${item}`}
            aria-selected={tab === item}
            className={tab === item ? "is-active" : ""}
            id={`${tabIdPrefix}-tab-${item}`}
            key={item}
            onKeyDown={(event) => handleTabKeyDown(event, item)}
            onClick={() => setTab(item)}
            role="tab"
            tabIndex={tab === item ? 0 : -1}
            type="button"
          >
            {t(locale, `workspace.inspector.tab.${item}`)}
          </button>
        ))}
      </div>

      <div className="node-inspector__body">
        <section
            aria-labelledby={`${tabIdPrefix}-tab-overview`}
            className="node-editor"
            hidden={tab !== "overview"}
            id={`${tabIdPrefix}-panel-overview`}
            role="tabpanel"
            tabIndex={0}
          >
            <div className={`node-type-badge ${toneClass(node.tone)}`}>
              <CircleDot className="size-4" />
              {t(locale, `graph.tone.${node.tone}`)}
            </div>
            <label className="field-label">
              {t(locale, "workspace.inspector.titleLabel")}
              <input
                disabled={isPendingDeletion || status === "saving"}
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
            </label>
            <label className="field-label">
              {t(locale, "workspace.inspector.summaryLabel")}
              <textarea
                disabled={isPendingDeletion || status === "saving"}
                onChange={(event) => setSummary(event.target.value)}
                value={summary}
              />
            </label>
            <div className="node-editor__actions">
              <button
                className="secondary-button"
                disabled={isPendingDeletion || status === "saving" || !title.trim()}
                onClick={saveNode}
                type="button"
              >
                <Save className="size-4" />
                {t(locale, "workspace.inspector.save")}
              </button>
              <button
                className="danger-button"
                disabled={isPendingDeletion || status === "saving"}
                onClick={() => setShowDeleteConfirm(true)}
                type="button"
              >
                <Trash2 className="size-4" />
                {t(locale, "workspace.inspector.delete")}
              </button>
            </div>
        </section>

        <section
            aria-labelledby={`${tabIdPrefix}-tab-evidence`}
            className="node-evidence"
            hidden={tab !== "evidence"}
            id={`${tabIdPrefix}-panel-evidence`}
            role="tabpanel"
            tabIndex={0}
          >
            <p className="ui-kicker">{t(locale, "workspace.inspector.evidence")}</p>
            <h3>{t(locale, "workspace.inspector.evidenceTitle")}</h3>
            <blockquote>
              {node.evidenceSnippet ?? t(locale, "workspace.inspector.noEvidence")}
            </blockquote>
            {node.captureId ? (
              <button
                className="node-evidence__source-action secondary-button"
                onClick={() => onOpenCapture(node.captureId as string)}
                type="button"
              >
                <FileText aria-hidden="true" className="size-4" />
                {t(locale, "workspace.inspector.openSource")}
              </button>
            ) : null}
        </section>

        <section
            aria-labelledby={`${tabIdPrefix}-tab-connections`}
            className="node-connections"
            hidden={tab !== "connections"}
            id={`${tabIdPrefix}-panel-connections`}
            role="tabpanel"
            tabIndex={0}
          >
            <div className="connection-list">
              {linkedItems.length ? (
                linkedItems.map((item) => {
                  const origin = item.edge.origin ?? "system";
                  return (
                    <article className="relationship-card" key={item.edge.id}>
                      <span
                        aria-hidden="true"
                        className="relationship-card__tone"
                        style={{
                          backgroundColor:
                            GRAPH_TONE_COLORS[item.edge.tone ?? item.node.tone],
                        }}
                      />
                      <div className="relationship-card__body">
                        <div className="relationship-card__meta">
                          <strong>
                            {item.edge.kind
                              ? edgeKindLabel(locale, item.edge.kind)
                              : item.edge.label ?? t(locale, "graph.edge.related")}
                          </strong>
                          <span>
                            <EdgeOriginIcon origin={origin} />
                            {t(locale, `workspace.inspector.origin.${origin}`)}
                          </span>
                          {typeof item.edge.confidence === "number" ? (
                            <span>
                              {t(
                                locale,
                                "workspace.inspector.relationshipConfidence",
                                {
                                  confidence: `${Math.round(item.edge.confidence * 100)}%`,
                                },
                              )}
                            </span>
                          ) : null}
                        </div>
                        <p>{item.node.title}</p>
                        {item.edge.label && item.edge.kind ? (
                          <small>{item.edge.label}</small>
                        ) : null}
                        {item.edge.evidenceSnippet ? (
                          <blockquote>
                            <span>
                              {t(locale, "workspace.inspector.relationshipEvidence")}
                            </span>
                            {item.edge.evidenceSnippet}
                          </blockquote>
                        ) : null}
                      </div>
                      {origin !== "system" ? (
                        <button
                          aria-label={t(
                            locale,
                            "workspace.inspector.removeConnection",
                            { title: item.node.title },
                          )}
                          className="icon-button icon-button--compact"
                          disabled={isPendingDeletion || status === "saving"}
                          onClick={() => removeConnection(item.edge.id)}
                          type="button"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <p className="connection-list__empty">
                  {t(locale, "workspace.inspector.noConnections")}
                </p>
              )}
            </div>
            <div className="connection-composer">
              <div className="connection-composer__title">
                <Link2 className="size-4" />
                <h3>{t(locale, "workspace.inspector.addConnection")}</h3>
              </div>
              {connectionCandidates.length ? (
                <>
                  <select
                    aria-label={t(locale, "workspace.inspector.connectionTarget")}
                    disabled={isPendingDeletion || status === "saving"}
                    onChange={(event) => setTargetNodeId(event.target.value)}
                    value={targetNodeId}
                  >
                    <option value="">
                      {t(locale, "workspace.inspector.connectionTarget")}
                    </option>
                    {connectionCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.title}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={t(locale, "workspace.inspector.connectionKind")}
                    disabled={isPendingDeletion || status === "saving"}
                    onChange={(event) => setEdgeKind(event.target.value as EdgeKind)}
                    value={edgeKind}
                  >
                    {EDGE_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {edgeKindLabel(locale, kind)}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={t(locale, "workspace.inspector.connectionLabel")}
                    disabled={isPendingDeletion || status === "saving"}
                    onChange={(event) => setEdgeLabel(event.target.value)}
                    placeholder={t(locale, "workspace.inspector.connectionLabel")}
                    value={edgeLabel}
                  />
                  <button
                    className="secondary-button"
                    disabled={
                      isPendingDeletion || !targetNodeId || status === "saving"
                    }
                    onClick={addConnection}
                    type="button"
                  >
                    <Plus className="size-4" />
                    {t(locale, "workspace.inspector.add")}
                  </button>
                </>
              ) : (
                <p className="connection-composer__empty" role="status">
                  {t(locale, "workspace.inspector.noConnectionCandidates")}
                </p>
              )}
            </div>
        </section>
      </div>

      <div
        aria-live={status === "error" ? "assertive" : "polite"}
        className={`mutation-status mutation-status--${status}`}
        role={status === "error" ? "alert" : "status"}
      >
        {status === "success" ? <Check className="size-4" /> : null}
        {status !== "idle" ? t(locale, `workspace.mutation.${status}`) : null}
        {status === "error" && canRetry ? (
          <button onClick={retryMutation} type="button">
            <RefreshCw aria-hidden="true" className="size-3" />
            {t(locale, "workspace.inspector.retry")}
          </button>
        ) : null}
      </div>

      {isPendingDeletion ? (
        <div aria-live="assertive" className="undo-toast" role="status">
          <span>{t(locale, "workspace.inspector.deleteScheduled")}</span>
          <button onClick={undoDelete} type="button">
            <RotateCcw className="size-4" />
            {t(locale, "workspace.inspector.undo")}
          </button>
        </div>
      ) : null}

      {showDeleteConfirm ? (
        <dialog
          aria-labelledby="delete-node-title"
          className="confirm-dialog"
          onCancel={() => setShowDeleteConfirm(false)}
          ref={deleteDialogRef}
        >
          <h3 id="delete-node-title">{t(locale, "workspace.inspector.deleteConfirmTitle")}</h3>
          <p>{t(locale, "workspace.inspector.deleteConfirmDescription")}</p>
          <div>
            <button
              autoFocus
              className="secondary-button"
              onClick={() => setShowDeleteConfirm(false)}
              type="button"
            >
              {t(locale, "workspace.inspector.cancel")}
            </button>
            <button className="danger-button" onClick={scheduleDelete} type="button">
              {t(locale, "workspace.inspector.delete")}
            </button>
          </div>
        </dialog>
      ) : null}
    </aside>
  );
}
