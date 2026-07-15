"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  FileText,
  LoaderCircle,
  RefreshCcw,
} from "lucide-react";
import { PROCESSING_STATUS } from "@/config/domain";
import { canReconnectQueuedJob } from "@/features/analysis/queue/reconnect-policy";
import {
  reconnectErrorMessageKey,
  type ReconnectErrorMessageKey,
} from "@/features/analysis/queue/reconnect-feedback";
import type { RecentCapture } from "@/features/knowledge-map/model/readiness";
import { t, type Locale } from "@/lib/i18n";
import { processingStatusLabel } from "@/lib/i18n/labels";

type RetryState = "idle" | "loading" | "success" | "error";

export function KnowledgeMapActivityBanner({
  capture,
  locale,
  onOpenCapture,
  onReconnect,
  onRetry,
}: {
  capture: RecentCapture;
  locale: Locale;
  onOpenCapture?: (captureId: string) => void;
  onReconnect?: (jobId: string) => Promise<void>;
  onRetry?: (jobId: string) => Promise<void>;
}) {
  const [retryState, setRetryState] = useState<RetryState>("idle");
  const [reconnectState, setReconnectState] = useState<RetryState>("idle");
  const [reconnectErrorKey, setReconnectErrorKey] =
    useState<ReconnectErrorMessageKey | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isActive =
    capture.processingStatus === PROCESSING_STATUS.queued ||
    capture.processingStatus === PROCESSING_STATUS.running;
  const isFailed = capture.processingStatus === PROCESSING_STATUS.failed;
  const reconnectable = canReconnectQueuedJob(
    {
      status: capture.processingStatus,
      updatedAt: capture.processingUpdatedAt,
      nextRunAt: capture.processingNextRunAt,
    },
    nowMs,
  );
  const reconnectFeedback =
    reconnectState === "success"
      ? t(locale, "workspace.graph.readiness.reconnectSuccess")
      : reconnectState === "error"
        ? t(
            locale,
            reconnectErrorKey ?? "workspace.analysisReconnect.error.default",
          )
        : null;

  useEffect(() => {
    if (capture.processingStatus !== PROCESSING_STATUS.queued) return;
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 10_000);
    return () => window.clearInterval(intervalId);
  }, [capture.processingStatus]);

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

  async function reconnectAnalysis() {
    if (!capture.processingJobId || !onReconnect || reconnectState === "loading") return;
    setReconnectState("loading");
    setReconnectErrorKey(null);
    try {
      await onReconnect(capture.processingJobId);
      setReconnectState("success");
    } catch (error) {
      setReconnectErrorKey(reconnectErrorMessageKey(error));
      setReconnectState("error");
    }
  }

  return (
    <aside
      aria-busy={
        isActive || retryState === "loading" || reconnectState === "loading"
      }
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
        {reconnectable &&
        reconnectState !== "success" &&
        capture.processingJobId &&
        onReconnect ? (
          <button
            className="map-activity-banner__retry"
            disabled={reconnectState === "loading"}
            onClick={reconnectAnalysis}
            type="button"
          >
            <RefreshCcw aria-hidden="true" className="size-3.5" />
            {reconnectState === "loading"
              ? t(locale, "workspace.graph.readiness.reconnecting")
              : t(locale, "workspace.graph.readiness.reconnect")}
          </button>
        ) : null}
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
      {reconnectFeedback ? (
        <p
          className={`map-activity-banner__feedback map-activity-banner__feedback--${reconnectState}`}
          role={reconnectState === "error" ? "alert" : "status"}
        >
          {reconnectFeedback}
        </p>
      ) : null}
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
