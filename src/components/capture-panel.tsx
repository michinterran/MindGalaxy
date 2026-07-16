"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  FileCheck2,
  FileText,
  Loader2,
  MessageSquareText,
  Network,
  Sparkles,
  Tags,
} from "lucide-react";
import {
  CaptureClientError,
  captureErrorMessage,
  createCapture,
  type CreateCaptureResponse,
} from "@/features/capture/api/capture-client";
import { DEFAULT_LOCALE, formatInteger, t, type Locale } from "@/lib/i18n";

type CapturePanelProps = {
  workspaceId: string;
  autoFocus?: boolean;
  variant?: "panel" | "hero";
  locale?: Locale;
  onCaptureCreated?: (result: CreateCaptureResponse, draft: CaptureDraft) => void;
  onViewKnowledge?: () => void;
};

export type CaptureDraft = {
  rawText: string;
  title: string | null;
};

type CaptureState =
  | { kind: "idle"; message: string }
  | { kind: "saving"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

function detectSource(rawText: string, locale: Locale) {
  const lower = rawText.toLowerCase();

  if (lower.includes("chatgpt") || lower.includes("openai")) {
    return { label: "ChatGPT", icon: Bot };
  }

  if (lower.includes("claude")) {
    return { label: "Claude", icon: MessageSquareText };
  }

  if (lower.includes("gemini")) {
    return { label: "Gemini", icon: Sparkles };
  }

  return {
    label: rawText.trim()
      ? t(locale, "capture.source.pasted")
      : t(locale, "capture.source.waiting"),
    icon: FileText,
  };
}

export function CapturePanel({
  autoFocus = false,
  locale = DEFAULT_LOCALE,
  onCaptureCreated,
  onViewKnowledge,
  workspaceId,
  variant = "panel",
}: CapturePanelProps) {
  const router = useRouter();
  const [rawText, setRawText] = useState("");
  const [title, setTitle] = useState("");
  const [showTitle, setShowTitle] = useState(false);
  const [state, setState] = useState<CaptureState>({
    kind: "idle",
    message: t(locale, "capture.status.idle"),
  });
  const requestRef = useRef<{ signature: string; requestId: string } | null>(null);
  const rawTextRef = useRef<HTMLTextAreaElement>(null);
  const [isPending, startTransition] = useTransition();
  const source = useMemo(() => detectSource(rawText, locale), [locale, rawText]);
  const SourceIcon = source.icon;
  const textLength = rawText.trim().length;
  const hasRawText = textLength > 0;
  const isHero = variant === "hero";
  const isSuccess = state.kind === "success";

  function focusForNextCapture() {
    setState({
      kind: "idle",
      message: t(locale, "capture.status.idle"),
    });
    requestAnimationFrame(() => rawTextRef.current?.focus());
  }

  useEffect(() => {
    if (autoFocus) {
      rawTextRef.current?.focus();
    }
  }, [autoFocus]);

  function submitCapture() {
    const trimmed = rawText.trim();
    const trimmedTitle = title.trim();

    if (!trimmed) {
      setState({
        kind: "error",
        message: t(locale, "capture.status.emptyError"),
      });
      return;
    }

    const inputSignature = JSON.stringify({
      rawText: trimmed,
      sourceLabel: source.label,
      title: trimmedTitle,
      workspaceId,
    });

    if (requestRef.current?.signature !== inputSignature) {
      requestRef.current = {
        signature: inputSignature,
        requestId: crypto.randomUUID(),
      };
    }

    const requestId = requestRef.current.requestId;

    setState({
      kind: "saving",
      message: t(locale, "capture.status.saving"),
    });

    startTransition(async () => {
      try {
        const result = await createCapture({
          workspaceId,
          requestId,
          metadata: {},
          title: trimmedTitle || undefined,
          rawText: trimmed,
          sourceKind: "paste",
          source: {
            label: source.label,
            metadata: {},
            provider: "manual",
          },
        });

        setTitle("");
        setRawText("");
        setShowTitle(false);
        requestRef.current = null;
        setState({
          kind: "success",
          message: t(locale, "capture.status.success"),
        });
        onCaptureCreated?.(result, {
          rawText: trimmed,
          title: trimmedTitle || null,
        });
        router.refresh();
      } catch (error) {
        setState({
          kind: "error",
          message:
            error instanceof CaptureClientError
              ? captureErrorMessage(locale, error.code)
              : t(locale, "capture.status.error"),
        });
      }
    });
  }

  return (
    <section
      className={`capture-panel ${isHero ? "capture-panel--hero" : ""}`}
      aria-label={t(locale, "capture.aria")}
    >
      <div className="capture-panel__header">
        <div>
          <p className="ui-kicker">{t(locale, "capture.newMaterial")}</p>
          <h2>
            {isHero
              ? t(locale, "capture.heroTitle")
              : t(locale, "capture.panelTitle")}
          </h2>
          <p className="capture-panel__description">
            {t(locale, "capture.description")}
          </p>
          {isHero ? <div className="capture-panel__flow" aria-hidden="true">
            <span>
              <em>1</em>
              <FileCheck2 className="size-4" />
              {t(locale, "capture.flow.source")}
            </span>
            <span>
              <em>2</em>
              <Network className="size-4" />
              {t(locale, "capture.flow.node")}
            </span>
            <span>
              <em>3</em>
              <Tags className="size-4" />
              {t(locale, "capture.flow.context")}
            </span>
          </div> : null}
        </div>
        <div className="source-pill">
          <SourceIcon className="size-4" />
          <span>{source.label}</span>
        </div>
      </div>

      <div className="capture-panel__composer">
        {showTitle ? (
          <label className="field-label" htmlFor="capture-title">
            {t(locale, "capture.titleLabel")}
            <input
              disabled={isSuccess}
              id="capture-title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t(locale, "capture.titlePlaceholder")}
              type="text"
              value={title}
            />
          </label>
        ) : null}

        <label className="field-label" htmlFor="capture-raw-text">
          {t(locale, "capture.rawTextLabel")}
          <textarea
            disabled={isSuccess}
            id="capture-raw-text"
            onChange={(event) => setRawText(event.target.value)}
            placeholder={t(locale, "capture.rawTextPlaceholder")}
            ref={rawTextRef}
            value={rawText}
          />
        </label>

        <div className="capture-panel__meta">
          <button
            className="ghost-button"
            disabled={isSuccess}
            onClick={() => setShowTitle((value) => !value)}
            type="button"
          >
            {showTitle
              ? t(locale, "capture.hideTitle")
              : t(locale, "capture.showTitle")}
          </button>
          <span>
            {t(locale, "capture.characterUnit", {
              count: formatInteger(locale, textLength),
            })}
          </span>
        </div>

        <div
          aria-live="polite"
          className={`status-line status-line--${state.kind}`}
          role="status"
        >
          {state.kind === "saving" ? <Loader2 className="size-4 animate-spin" /> : null}
          {state.kind === "success" ? <CheckCircle2 className="size-4" /> : null}
          <span>{state.message}</span>
        </div>

        {isSuccess ? (
          <div className="capture-panel__success-actions">
            <button className="ghost-button" onClick={focusForNextCapture} type="button">
              {t(locale, "capture.success.next")}
            </button>
            {onViewKnowledge ? (
              <button
                className="ghost-button capture-panel__success-primary"
                onClick={onViewKnowledge}
                type="button"
              >
                {t(locale, "capture.success.knowledge")}
                <ArrowRight className="size-4" />
              </button>
            ) : null}
          </div>
        ) : null}

        {!isSuccess ? (
          <button
            className={`primary-button ${hasRawText ? "primary-button--ready" : "primary-button--empty"}`}
            disabled={isPending || !hasRawText}
            onClick={submitCapture}
            type="button"
          >
            {isPending
              ? t(locale, "capture.cta.pending")
              : t(locale, "capture.cta.idle")}
            <ArrowRight className="size-4" />
          </button>
        ) : null}
      </div>
    </section>
  );
}
