"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Download, FileArchive, FileText, Presentation, X } from "lucide-react";
import { useDialogPanel } from "@/components/dialog-panel";
import {
  downloadExportBlob,
  ExportClientError,
  isAbortErrorLike,
  requestWorkspaceExport,
} from "@/features/export/api/export-client";
import {
  beginExportRequest,
  cancelActiveExportRequest,
  cancelExportRequest,
  completeExportRequest,
  createExportPanelState,
  failExportRequest,
} from "@/features/export/components/export-panel-state";
import type { ExportKind } from "@/features/export/model/schemas";
import { t, type Locale } from "@/lib/i18n";

type ExportStatus = "idle" | "pending" | "success" | "error";

const FORMATS: Array<{
  kind: ExportKind;
  icon: typeof FileText;
  labelKey: "workspace.export.html" | "workspace.export.pdf" | "workspace.export.pptx";
  descriptionKey:
    | "workspace.export.htmlDescription"
    | "workspace.export.pdfDescription"
    | "workspace.export.pptxDescription";
}> = [
  {
    kind: "html",
    icon: FileText,
    labelKey: "workspace.export.html",
    descriptionKey: "workspace.export.htmlDescription",
  },
  {
    kind: "pdf",
    icon: FileArchive,
    labelKey: "workspace.export.pdf",
    descriptionKey: "workspace.export.pdfDescription",
  },
  {
    kind: "pptx",
    icon: Presentation,
    labelKey: "workspace.export.pptx",
    descriptionKey: "workspace.export.pptxDescription",
  },
];

function statusMessage(locale: Locale, status: ExportStatus, errorCode: string | null) {
  if (status === "pending") return t(locale, "workspace.export.pending");
  if (status === "success") return t(locale, "workspace.export.success");
  if (status === "error") {
    if (errorCode === "EXPORT_EMPTY_GRAPH") {
      return t(locale, "workspace.export.emptyGraph");
    }
    if (errorCode === "AUTH_REQUIRED") {
      return t(locale, "workspace.export.authRequired");
    }
    return t(locale, "workspace.export.error");
  }
  return t(locale, "workspace.export.ready");
}

export function ExportPanel({
  disabled,
  locale,
  onClose,
  workspaceId,
}: {
  workspaceId: string;
  locale: Locale;
  disabled?: boolean;
  onClose: () => void;
}) {
  const stateRef = useRef(createExportPanelState());
  const [state, setState] = useState(stateRef.current);
  const abortRef = useRef<AbortController | null>(null);
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const setPanelState = useCallback((
    updater:
      | typeof stateRef.current
      | ((current: typeof stateRef.current) => typeof stateRef.current),
  ) => {
    const next =
      typeof updater === "function" ? updater(stateRef.current) : updater;
    stateRef.current = next;
    setState(next);
  }, []);

  const closePanel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPanelState((current) => cancelActiveExportRequest(current));
    onClose();
  }, [onClose, setPanelState]);
  const panelRef = useDialogPanel({
    initialFocusRef: headingRef,
    onClose: closePanel,
  });

  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
    },
    [],
  );

  async function download(kind: ExportKind) {
    const next = beginExportRequest(stateRef.current, kind);

    if (!next.started) return;

    setPanelState(next.state);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await requestWorkspaceExport(
        { kind, locale, workspaceId },
        { signal: controller.signal },
      );
      downloadExportBlob(result);
      setPanelState((current) =>
        completeExportRequest(current, next.requestId, kind),
      );
    } catch (error) {
      if (isAbortErrorLike(error)) {
        setPanelState((current) =>
          cancelExportRequest(current, next.requestId, kind),
        );
        return;
      }

      setPanelState((current) =>
        failExportRequest(
          current,
          next.requestId,
          kind,
          error instanceof ExportClientError ? error.code : "EXPORT_FAILED",
        ),
      );
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }

  return (
    <aside
      aria-modal="true"
      aria-labelledby={headingId}
      className="export-panel"
      ref={panelRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="export-panel__orbit" aria-hidden="true" />
      <header className="export-panel__header">
        <div className="inspector-heading">
          <p>{t(locale, "workspace.export.kicker")}</p>
          <h2 id={headingId} ref={headingRef} tabIndex={-1}>
            {t(locale, "workspace.export.title")}
          </h2>
        </div>
        <button
          className="icon-button"
          aria-label={t(locale, "workspace.export.close")}
          onClick={closePanel}
          title={t(locale, "workspace.export.close")}
          type="button"
        >
          <X className="size-4" />
        </button>
      </header>
      <p className="export-panel__copy">{t(locale, "workspace.export.description")}</p>
      <div className="export-panel__formats">
        {FORMATS.map((format) => {
          const Icon = format.icon;
          const status = state.statuses[format.kind];
          const isPending = status === "pending";

          return (
            <button
              className={`export-format export-format--${status}`}
              disabled={disabled || Boolean(state.activeKind) || isPending}
              key={format.kind}
              onClick={() => download(format.kind)}
              type="button"
            >
              <span className="export-format__icon">
                <Icon className="size-4" />
              </span>
              <span>
                <strong>{t(locale, format.labelKey)}</strong>
                <small>{t(locale, format.descriptionKey)}</small>
                <em>{statusMessage(locale, status, state.errors[format.kind])}</em>
              </span>
              <Download className="size-4 export-format__download" />
            </button>
          );
        })}
      </div>
      {disabled ? (
        <p className="export-panel__warning">{t(locale, "workspace.export.emptyGraph")}</p>
      ) : null}
    </aside>
  );
}
