"use client";

import { useId, useMemo, useRef } from "react";
import { AlertCircle, CheckCircle2, Loader2, Search, X } from "lucide-react";
import { useDialogPanel } from "@/components/dialog-panel";
import type {
  GroundedAnswer,
  SearchResult,
} from "@/features/search/model/schemas";
import { splitHighlightSegments } from "@/features/search/model/highlight";
import { t, type Locale } from "@/lib/i18n";
import { searchSourceTypeLabel } from "@/lib/i18n/labels";

export type SearchPanelState = {
  answer: GroundedAnswer | null;
  error: string | null;
  query: string;
  results: SearchResult[];
  status: "idle" | "loading" | "success" | "error";
};

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function HighlightedText({
  text,
  tokens,
}: {
  text: string;
  tokens: string[];
}) {
  return (
    <>
      {splitHighlightSegments(text, tokens).map((segment, index) =>
        segment.highlighted ? (
          <mark key={`${segment.text}:${index}`}>{segment.text}</mark>
        ) : (
          <span key={`${segment.text}:${index}`}>{segment.text}</span>
        ),
      )}
    </>
  );
}

export function SearchCommandPanel({
  locale,
  onClose,
  onSelectResult,
  state,
}: {
  locale: Locale;
  onClose: () => void;
  onSelectResult: (result: SearchResult) => void;
  state: SearchPanelState;
}) {
  const isLoading = state.status === "loading";
  const hasResults = state.results.length > 0;
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useDialogPanel({
    initialFocusRef: headingRef,
    onClose,
  });
  const queryTokens = useMemo(() => state.query.split(/\s+/g), [state.query]);

  function tokensForResult(result: SearchResult) {
    const citationTokens =
      state.answer?.citations
        .filter((citation) => citation.resultId === result.resultId)
        .map((citation) => citation.quote) ?? [];

    return [...queryTokens, ...citationTokens];
  }

  return (
    <aside
      aria-modal="true"
      aria-labelledby={headingId}
      className="search-panel"
      ref={panelRef}
      role="dialog"
      tabIndex={-1}
    >
      <header className="search-panel__header">
        <div>
          <p>{t(locale, "workspace.search.kicker")}</p>
          <h2 id={headingId} ref={headingRef} tabIndex={-1}>
            {state.query || t(locale, "workspace.search.title")}
          </h2>
        </div>
        <button
          aria-label={t(locale, "workspace.search.close")}
          className="icon-button"
          onClick={onClose}
          type="button"
        >
          <X className="size-4" />
        </button>
      </header>

      {isLoading ? (
        <section className="search-panel__state">
          <Loader2 className="size-5 animate-spin" />
          <p>{t(locale, "workspace.search.loading")}</p>
        </section>
      ) : null}

      {state.status === "error" ? (
        <section className="search-panel__state search-panel__state--error">
          <AlertCircle className="size-5" />
          <p>{state.error ?? t(locale, "workspace.search.error")}</p>
          <small>{t(locale, "workspace.search.errorHint")}</small>
        </section>
      ) : null}

      {state.status === "success" && state.answer ? (
        <section className="search-answer">
          <div className="search-answer__status">
            {state.answer.grounded ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <AlertCircle className="size-4" />
            )}
            {state.answer.grounded
              ? t(locale, "workspace.search.grounded")
              : t(locale, "workspace.search.ungrounded")}
            <span>{percent(state.answer.confidence)}</span>
          </div>
          <p>{state.answer.answer}</p>
          {state.answer.citations.length ? (
            <div className="search-citations">
              {state.answer.citations.map((citation) => (
                <blockquote key={`${citation.resultId}:${citation.quote}`}>
                  <small>{citation.resultId}</small>
                  <HighlightedText text={citation.quote} tokens={queryTokens} />
                </blockquote>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {state.status === "success" && !hasResults ? (
        <section className="search-panel__state">
          <Search className="size-5" />
          <p>{t(locale, "workspace.search.empty")}</p>
        </section>
      ) : null}

      {hasResults ? (
        <section className="search-results" aria-label={t(locale, "workspace.search.results")}>
          {state.results.map((result) => (
            <button
              key={result.resultId}
              onClick={() => onSelectResult(result)}
              type="button"
            >
              <span className="search-result__topline">
                <em>{searchSourceTypeLabel(locale, result.sourceType)}</em>
                <strong>{percent(result.finalScore)}</strong>
              </span>
              <h3>
                <HighlightedText text={result.title} tokens={tokensForResult(result)} />
              </h3>
              <p>
                <HighlightedText text={result.snippet} tokens={tokensForResult(result)} />
              </p>
              {result.evidence ? (
                <blockquote>
                  <HighlightedText text={result.evidence} tokens={tokensForResult(result)} />
                </blockquote>
              ) : null}
              <span className="search-result__scores">
                {t(locale, "workspace.search.lexical")} {percent(result.lexicalScore)}
                {" · "}
                {t(locale, "workspace.search.semantic")} {percent(result.semanticScore)}
                {" · "}
                {t(locale, "workspace.search.graph")} {percent(result.graphScore)}
              </span>
            </button>
          ))}
        </section>
      ) : null}
    </aside>
  );
}
