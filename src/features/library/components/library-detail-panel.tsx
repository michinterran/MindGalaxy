"use client";

import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import {
  canReconnectQueuedJob,
  canRetryCapture,
  getRetryableProcessingJobId,
  type LibraryCaptureDetail,
} from "@/features/library/model/capture-detail";
import {
  reconnectErrorMessageKey,
  type ReconnectErrorMessageKey,
} from "@/features/analysis/queue/reconnect-feedback";
import { captureSourceLabel, processingStatusLabel } from "@/lib/i18n/labels";
import { formatDateTime, formatInteger, t, type Locale } from "@/lib/i18n";

type PanelStatus = "idle" | "loading" | "saving" | "success" | "error";

export type LibraryDetailActions = {
  deleteCapture: (captureId: string) => Promise<void>;
  loadCapture: (captureId: string) => Promise<LibraryCaptureDetail>;
  reconnectProcessing: (jobId: string) => Promise<void>;
  retryProcessing: (jobId: string) => Promise<void>;
  updateTitle: (captureId: string, title: string | null) => Promise<void>;
};

type LibraryDetailPanelProps = {
  actions: LibraryDetailActions;
  captureId: string;
  locale: Locale;
  onClose: () => void;
};

export function LibraryDetailPanel(props: LibraryDetailPanelProps) {
  return <LibraryDetailPanelContent key={props.captureId} {...props} />;
}

function LibraryDetailPanelContent({
  actions,
  captureId,
  locale,
  onClose,
}: LibraryDetailPanelProps) {
  const [detail, setDetail] = useState<LibraryCaptureDetail | null>(null);
  const [status, setStatus] = useState<PanelStatus>("loading");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [reconnectStatus, setReconnectStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [reconnectErrorKey, setReconnectErrorKey] =
    useState<ReconnectErrorMessageKey | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let isCurrent = true;

    actions
      .loadCapture(captureId)
      .then((nextDetail) => {
        if (!isCurrent) return;
        setDetail(nextDetail);
        setTitle(nextDetail.title ?? "");
        setStatus("idle");
      })
      .catch(() => {
        if (isCurrent) setStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [actions, captureId]);

  useEffect(() => {
    if (showDeleteConfirm && !deleteDialogRef.current?.open) {
      deleteDialogRef.current?.showModal();
    }
  }, [showDeleteConfirm]);

  useEffect(() => {
    if (detail?.processingStatus !== "queued") return;
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 10_000);
    return () => window.clearInterval(intervalId);
  }, [detail?.processingStatus]);

  async function saveTitle() {
    if (!detail) return;
    setStatus("saving");
    try {
      await actions.updateTitle(detail.id, title.trim() || null);
      setDetail({ ...detail, title: title.trim() || null });
      setIsEditingTitle(false);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  async function retryProcessing() {
    if (!detail) return;
    const processingJobId = getRetryableProcessingJobId(detail);
    if (!processingJobId) return;
    setStatus("saving");
    try {
      await actions.retryProcessing(processingJobId);
      setDetail({ ...detail, processingStatus: "queued", processingError: null });
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  async function reconnectProcessing() {
    if (!detail?.processingJobId || reconnectStatus === "loading") return;
    setReconnectStatus("loading");
    setReconnectErrorKey(null);
    try {
      await actions.reconnectProcessing(detail.processingJobId);
      setReconnectStatus("success");
    } catch (error) {
      setReconnectErrorKey(reconnectErrorMessageKey(error));
      setReconnectStatus("error");
    }
  }

  async function removeCapture() {
    if (!detail) return;
    setShowDeleteConfirm(false);
    setStatus("saving");
    try {
      await actions.deleteCapture(detail.id);
      onClose();
    } catch {
      setStatus("error");
    }
  }

  return (
    <aside
      aria-busy={status === "loading" || status === "saving"}
      aria-label={t(locale, "workspace.library.detailAria")}
      className="library-detail-panel"
    >
      <header className="library-detail-panel__header">
        <div>
          <p>{t(locale, "workspace.library.detailKicker")}</p>
          <h2>{detail?.title ?? t(locale, "workspace.recent.untitled")}</h2>
        </div>
        <button
          aria-label={t(locale, "workspace.library.close")}
          className="icon-button"
          disabled={status === "saving"}
          onClick={onClose}
          type="button"
        >
          <X className="size-4" />
        </button>
      </header>

      {status === "loading" ? (
        <div className="library-detail-panel__state" role="status">
          <Loader2 className="size-5 animate-spin" />
          {t(locale, "workspace.library.loading")}
        </div>
      ) : null}

      {status === "error" && !detail ? (
        <div className="library-detail-panel__state library-detail-panel__state--error" role="alert">
          {t(locale, "workspace.library.loadError")}
        </div>
      ) : null}

      {detail ? (
        <div className="library-detail-panel__body">
          <section className="library-detail-panel__title-editor">
            {isEditingTitle && detail.canEdit ? (
              <>
                <label className="field-label">
                  {t(locale, "workspace.library.titleLabel")}
                  <input
                    disabled={status === "saving"}
                    onChange={(event) => setTitle(event.target.value)}
                    value={title}
                  />
                </label>
                <button
                  className="secondary-button"
                  disabled={status === "saving"}
                  onClick={saveTitle}
                  type="button"
                >
                  <Save className="size-4" />
                  {t(locale, "workspace.library.saveTitle")}
                </button>
              </>
            ) : detail.canEdit ? (
              <button
                className="ghost-button library-detail-panel__edit-title"
                disabled={status === "saving"}
                onClick={() => setIsEditingTitle(true)}
                type="button"
              >
                <Pencil className="size-4" />
                {t(locale, "workspace.library.editTitle")}
              </button>
            ) : null}
          </section>

          <section className="library-detail-panel__meta">
            <div>
              <FileText className="size-4" />
              <span>{captureSourceLabel(locale, detail.sourceKind)}</span>
              <small>{formatDateTime(locale, detail.createdAt)}</small>
            </div>
            <div>
              <Workflow className="size-4" />
              <span>{processingStatusLabel(locale, detail.processingStatus)}</span>
              <small>
                {t(locale, "workspace.library.derivedNodes", {
                  count: formatInteger(locale, detail.derivedNodeCount),
                })}
              </small>
            </div>
          </section>

          {detail.processingError ? (
            <div className="library-detail-panel__error" role="alert">
              {detail.processingError}
            </div>
          ) : null}

          {detail.canEdit && canRetryCapture(detail.processingStatus) && detail.processingJobId ? (
            <button
              className="secondary-button library-detail-panel__retry"
              disabled={status === "saving"}
              onClick={retryProcessing}
              type="button"
            >
              <RotateCcw className="size-4" />
              {t(locale, "workspace.library.retry")}
            </button>
          ) : null}

          {detail.canEdit &&
          detail.processingJobId &&
          reconnectStatus !== "success" &&
          canReconnectQueuedJob(
            {
              status: detail.processingStatus,
              updatedAt: detail.processingUpdatedAt,
              nextRunAt: detail.processingNextRunAt,
            },
            nowMs,
          ) ? (
            <button
              className="secondary-button library-detail-panel__retry"
              disabled={reconnectStatus === "loading" || status === "saving"}
              onClick={reconnectProcessing}
              type="button"
            >
              <RotateCcw className="size-4" />
              {reconnectStatus === "loading"
                ? t(locale, "workspace.library.reconnecting")
                : t(locale, "workspace.library.reconnect")}
            </button>
          ) : null}

          {reconnectStatus === "success" || reconnectStatus === "error" ? (
            <p
              className={`library-detail-panel__reconnect-status library-detail-panel__reconnect-status--${reconnectStatus}`}
              role={reconnectStatus === "error" ? "alert" : "status"}
            >
              {t(
                locale,
                reconnectStatus === "success"
                  ? "workspace.library.reconnectSuccess"
                  : reconnectErrorKey ?? "workspace.analysisReconnect.error.default",
              )}
            </p>
          ) : null}

          <section className="library-detail-panel__source">
            <p className="ui-kicker">{t(locale, "workspace.library.sourceKicker")}</p>
            <h3>{t(locale, "workspace.library.sourceTitle")}</h3>
            <pre>{detail.rawText}</pre>
          </section>

          {detail.canDelete ? (
            <button
              className="danger-button library-detail-panel__delete"
              disabled={status === "saving"}
              onClick={() => setShowDeleteConfirm(true)}
              type="button"
            >
              <Trash2 className="size-4" />
              {t(locale, "workspace.library.delete")}
            </button>
          ) : null}
        </div>
      ) : null}

      <div aria-live="polite" className={`mutation-status mutation-status--${status}`} role="status">
        {detail && status !== "idle" && status !== "loading"
          ? t(locale, `workspace.mutation.${status}`)
          : null}
      </div>

      {showDeleteConfirm ? (
        <dialog
          aria-labelledby="delete-capture-title"
          className="confirm-dialog"
          onCancel={() => setShowDeleteConfirm(false)}
          ref={deleteDialogRef}
        >
          <h3 id="delete-capture-title">{t(locale, "workspace.library.deleteConfirmTitle")}</h3>
          <p>{t(locale, "workspace.library.deleteConfirmDescription")}</p>
          <div>
            <button
              autoFocus
              className="secondary-button"
              onClick={() => setShowDeleteConfirm(false)}
              type="button"
            >
              {t(locale, "workspace.inspector.cancel")}
            </button>
            <button className="danger-button" onClick={removeCapture} type="button">
              {t(locale, "workspace.library.delete")}
            </button>
          </div>
        </dialog>
      ) : null}
    </aside>
  );
}
