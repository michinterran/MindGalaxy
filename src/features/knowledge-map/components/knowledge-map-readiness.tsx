"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  FileText,
  LoaderCircle,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import {
  deriveKnowledgeMapReadiness,
  type KnowledgeMapReadinessKind,
  type RecentCapture,
} from "@/features/knowledge-map/model/readiness";
import { processingStatusLabel } from "@/lib/i18n/labels";
import {
  formatDateTime,
  formatInteger,
  t,
  type Locale,
  type MessageKey,
} from "@/lib/i18n";

const PIPELINE_STEP_KEYS = [
  "workspace.graph.readiness.step.source",
  "workspace.graph.readiness.step.queued",
  "workspace.graph.readiness.step.extract",
  "workspace.graph.readiness.step.connect",
  "workspace.graph.readiness.step.complete",
] as const satisfies readonly MessageKey[];

const TITLE_KEYS = {
  no_capture: "workspace.graph.readiness.noCapture.title",
  queued: "workspace.graph.readiness.queued.title",
  running: "workspace.graph.readiness.running.title",
  needs_review: "workspace.graph.readiness.needsReview.title",
  failed: "workspace.graph.readiness.failed.title",
  completed_empty: "workspace.graph.readiness.completedEmpty.title",
  ready: "workspace.graph.realTitle",
} as const satisfies Record<KnowledgeMapReadinessKind, MessageKey>;

const DESCRIPTION_KEYS = {
  no_capture: "workspace.graph.readiness.noCapture.description",
  queued: "workspace.graph.readiness.queued.description",
  running: "workspace.graph.readiness.running.description",
  needs_review: "workspace.graph.readiness.needsReview.description",
  failed: "workspace.graph.readiness.failed.description",
  completed_empty: "workspace.graph.readiness.completedEmpty.description",
  ready: "workspace.graph.realDescription",
} as const satisfies Record<KnowledgeMapReadinessKind, MessageKey>;

type RetryState = "idle" | "loading" | "success" | "error";

function useElapsedSeconds(since: string | null | undefined, enabled: boolean) {
  const sinceMs = useMemo(() => (since ? Date.parse(since) : Number.NaN), [since]);
  const [elapsedSeconds, setElapsedSeconds] = useState(() =>
    Number.isFinite(sinceMs) ? Math.max(0, Math.floor((Date.now() - sinceMs) / 1000)) : 0,
  );

  useEffect(() => {
    if (!enabled || !Number.isFinite(sinceMs)) return;

    const update = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - sinceMs) / 1000)));
    };
    update();
    const intervalId = window.setInterval(update, 1_000);
    return () => window.clearInterval(intervalId);
  }, [enabled, sinceMs]);

  return elapsedSeconds;
}

function elapsedLabel(locale: Locale, elapsedSeconds: number) {
  if (elapsedSeconds < 60) {
    return t(locale, "workspace.graph.readiness.elapsedSeconds", {
      count: formatInteger(locale, elapsedSeconds),
    });
  }

  return t(locale, "workspace.graph.readiness.elapsedMinutes", {
    count: formatInteger(locale, Math.floor(elapsedSeconds / 60)),
  });
}

export function KnowledgeMapReadiness({
  locale,
  onNewCapture,
  onOpenCapture,
  onRetry,
  recentCaptures,
}: {
  locale: Locale;
  onNewCapture?: () => void;
  onOpenCapture?: (captureId: string) => void;
  onRetry?: (jobId: string) => Promise<void>;
  recentCaptures: RecentCapture[];
}) {
  const capture = recentCaptures[0] ?? null;
  const readiness = deriveKnowledgeMapReadiness({
    hasCapture: Boolean(capture),
    nodeCount: 0,
    processingStatus: capture?.processingStatus,
  });
  const isActive = readiness.kind === "queued" || readiness.kind === "running";
  const elapsedSeconds = useElapsedSeconds(
    capture?.processingStartedAt ?? capture?.processingCreatedAt ?? capture?.createdAt,
    isActive,
  );
  const [retryState, setRetryState] = useState<RetryState>("idle");

  async function retryAnalysis() {
    if (!capture?.processingJobId || !onRetry || retryState === "loading") return;
    setRetryState("loading");
    try {
      await onRetry(capture.processingJobId);
      setRetryState("success");
    } catch {
      setRetryState("error");
    }
  }

  if (!capture) {
    return (
      <section className="canvas-stage map-readiness-stage map-readiness-stage--empty">
        <div className="map-readiness-empty">
          <span><FileText className="size-5" /></span>
          <p className="ui-kicker">{t(locale, "workspace.graph.realKicker")}</p>
          <h2>{t(locale, TITLE_KEYS.no_capture)}</h2>
          <p>{t(locale, DESCRIPTION_KEYS.no_capture)}</p>
          {onNewCapture ? (
            <button className="primary-button" onClick={onNewCapture} type="button">
              {t(locale, "workspace.graph.readiness.newCapture")}
              <ArrowRight className="size-4" />
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  const visibleError =
    readiness.kind === "failed" && capture.processingError
      ? t(locale, "workspace.graph.readiness.failureCode", {
          code: capture.processingError,
        })
      : null;
  const sourceSummary = capture.rawTextPreview?.trim()
    ? capture.rawTextPreview.trim()
    : t(locale, "workspace.graph.readiness.sourceSummary", {
        count: formatInteger(locale, capture.rawTextLength),
      });

  return (
    <section
      aria-busy={isActive}
      aria-labelledby="knowledge-map-readiness-title"
      className={`canvas-stage map-readiness-stage map-readiness-stage--${readiness.kind}`}
    >
      <header className="canvas-stage__header map-readiness-header">
        <div>
          <p>{t(locale, "workspace.graph.readiness.kicker")}</p>
          <h2 id="knowledge-map-readiness-title">{t(locale, TITLE_KEYS[readiness.kind])}</h2>
          <span className="canvas-stage__description">
            {t(locale, DESCRIPTION_KEYS[readiness.kind])}
          </span>
        </div>
        <div className={`map-readiness-status map-readiness-status--${readiness.kind}`}>
          {isActive ? <LoaderCircle className="size-4" /> : readiness.kind === "failed" ? <AlertTriangle className="size-4" /> : <Sparkles className="size-4" />}
          <span>{processingStatusLabel(locale, capture.processingStatus)}</span>
          {isActive ? <small>{elapsedLabel(locale, elapsedSeconds)}</small> : null}
        </div>
      </header>

      <div className="map-readiness-canvas">
        <article className="provisional-source-node">
          <div className="provisional-source-node__topline">
            <span><FileText className="size-3.5" /> {t(locale, "graph.tone.source")}</span>
            <em>{t(locale, "workspace.graph.readiness.sourceSafe")}</em>
          </div>
          <h3>{capture.title ?? t(locale, "workspace.recent.untitled")}</h3>
          <p>{sourceSummary}</p>
          <footer>
            <span>{formatDateTime(locale, capture.createdAt)}</span>
            <span>{t(locale, "capture.characterUnit", { count: formatInteger(locale, capture.rawTextLength) })}</span>
          </footer>
        </article>

        <div className="map-readiness-connector" aria-hidden="true">
          <span />
          <i />
        </div>

        <section className="map-readiness-pipeline">
          <div className="map-readiness-pipeline__heading">
            <span><Sparkles className="size-4" /></span>
            <div>
              <p>{t(locale, "workspace.graph.readiness.pipelineKicker")}</p>
              <h3>{t(locale, "workspace.graph.readiness.pipelineTitle")}</h3>
            </div>
          </div>
          <ol>
            {PIPELINE_STEP_KEYS.map((key, index) => {
              const isComplete = index < readiness.completedSteps;
              const isCurrent = index === readiness.activeStep;
              const isFailed = readiness.kind === "failed" && isCurrent;
              return (
                <li
                  className={isFailed ? "is-failed" : isCurrent ? "is-current" : isComplete ? "is-complete" : ""}
                  key={key}
                >
                  <span>{isComplete ? <Check className="size-3.5" /> : isCurrent && isActive ? <LoaderCircle className="size-3.5" /> : index + 1}</span>
                  <p>{t(locale, key)}</p>
                  {isCurrent ? <em>{t(locale, `workspace.graph.readiness.stepState.${readiness.kind}` as MessageKey)}</em> : null}
                </li>
              );
            })}
          </ol>

          {visibleError ? <p className="map-readiness-error" role="alert">{visibleError}</p> : null}

          <div className="map-readiness-actions">
            {readiness.kind === "failed" && capture.processingJobId && onRetry ? (
              <button
                className="primary-button"
                disabled={retryState === "loading"}
                onClick={retryAnalysis}
                type="button"
              >
                <RefreshCcw className="size-4" />
                {retryState === "loading"
                  ? t(locale, "workspace.graph.readiness.retrying")
                  : t(locale, "workspace.graph.readiness.retry")}
              </button>
            ) : null}
            {onOpenCapture && !isActive ? (
              <button className="secondary-button" onClick={() => onOpenCapture(capture.id)} type="button">
                {t(locale, "workspace.graph.readiness.openCapture")}
                <ArrowRight className="size-4" />
              </button>
            ) : null}
            {onNewCapture && isActive ? (
              <button className="secondary-button" onClick={onNewCapture} type="button">
                {t(locale, "workspace.graph.readiness.addAnother")}
              </button>
            ) : null}
          </div>

          <p
            aria-live="polite"
            className={`map-readiness-live map-readiness-live--${retryState}`}
            role="status"
          >
            {retryState === "success"
              ? t(locale, "workspace.graph.readiness.retrySuccess")
              : retryState === "error"
                ? t(locale, "workspace.graph.readiness.retryError")
                : isActive
                  ? t(locale, "workspace.graph.readiness.autoRefresh")
                  : ""}
          </p>
        </section>
      </div>
    </section>
  );
}
