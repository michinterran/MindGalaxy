"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  FileText,
  LoaderCircle,
  RefreshCcw,
} from "lucide-react";
import { PROCESSING_STATUS } from "@/config/domain";
import type { RecentCapture } from "@/features/knowledge-map/model/readiness";
import { t, type Locale } from "@/lib/i18n";
import { processingStatusLabel } from "@/lib/i18n/labels";

type RetryState = "idle" | "loading" | "success" | "error";

export function KnowledgeMapActivityBanner({
  capture,
  locale,
  onOpenCapture,
  onRetry,
}: {
  capture: RecentCapture;
  locale: Locale;
  onOpenCapture?: (captureId: string) => void;
  onRetry?: (jobId: string) => Promise<void>;
}) {
  const [retryState, setRetryState] = useState<RetryState>("idle");
  const isActive =
    capture.processingStatus === PROCESSING_STATUS.queued ||
    capture.processingStatus === PROCESSING_STATUS.running;
  const isFailed = capture.processingStatus === PROCESSING_STATUS.failed;

  async function retryAnalysis() {
    if (!capture.processingJobId || !onRetry || retryState === "loading") return;
    setRetryState("loading");
    try {
      await onRetry(capture.processingJobId);
      setRetryState("success");
    } catch {
      setRetryState("error");
    }
  }

  return (
    <aside
      aria-busy={isActive || retryState === "loading"}
      aria-label={t(locale, "workspace.graph.readiness.activityAria")}
      className={`map-activity-banner map-activity-banner--${capture.processingStatus ?? "pending"}`}
    >
      <div className="map-activity-banner__source" aria-hidden="true">
        <FileText className="size-4" />
      </div>
      <div className="map-activity-banner__copy">
        <span>{t(locale, "workspace.graph.readiness.activityKicker")}</span>
        <strong>{capture.title ?? t(locale, "workspace.recent.untitled")}</strong>
        <small>
          {capture.rawTextPreview?.trim() ||
            t(locale, "workspace.graph.readiness.sourceSummary", {
              count: capture.rawTextLength,
            })}
        </small>
      </div>
      <div className="map-activity-banner__status" role="status" aria-live="polite">
        {isActive ? (
          <LoaderCircle aria-hidden="true" className="size-4" />
        ) : (
          <AlertTriangle aria-hidden="true" className="size-4" />
        )}
        <span>{processingStatusLabel(locale, capture.processingStatus)}</span>
        <small>
          {t(
            locale,
            isActive
              ? "workspace.graph.readiness.activityWorking"
              : isFailed
                ? "workspace.graph.readiness.activityFailed"
                : "workspace.graph.readiness.activityReview",
          )}
        </small>
      </div>
      <div className="map-activity-banner__actions">
        {isFailed && capture.processingJobId && onRetry ? (
          <button
            className="map-activity-banner__retry"
            disabled={retryState === "loading"}
            onClick={retryAnalysis}
            type="button"
          >
            <RefreshCcw aria-hidden="true" className="size-3.5" />
            {retryState === "loading"
              ? t(locale, "workspace.graph.readiness.retrying")
              : t(locale, "workspace.graph.readiness.retry")}
          </button>
        ) : null}
        {onOpenCapture ? (
          <button
            aria-label={t(locale, "workspace.graph.readiness.openCapture")}
            className="map-activity-banner__open"
            onClick={() => onOpenCapture(capture.id)}
            type="button"
          >
            <ArrowRight aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>
      {retryState === "success" || retryState === "error" ? (
        <p className="sr-only" role="status">
          {t(
            locale,
            retryState === "success"
              ? "workspace.graph.readiness.retrySuccess"
              : "workspace.graph.readiness.retryError",
          )}
        </p>
      ) : null}
    </aside>
  );
}
