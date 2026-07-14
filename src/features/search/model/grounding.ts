import { SEARCH_REGISTRY } from "@/config/registry";
import type {
  GroundedAnswer,
  SearchResult,
} from "@/features/search/model/schemas";
import { DEFAULT_LOCALE, t, type Locale } from "@/lib/i18n";

function normalizeForMatch(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function resultContainsQuote(result: SearchResult, quote: string) {
  const normalizedQuote = normalizeForMatch(quote);
  const haystack = normalizeForMatch(
    [result.snippet, result.evidence].filter(Boolean).join(" "),
  );

  return normalizedQuote.length > 0 && haystack.includes(normalizedQuote);
}

export function fallbackGroundedAnswer(
  locale: Locale = DEFAULT_LOCALE,
  message = t(locale, "workspace.search.fallbackAnswer"),
): GroundedAnswer {
  return {
    answer: message,
    grounded: false,
    confidence: SEARCH_REGISTRY.answer.lowConfidence,
    citations: [],
  };
}

export function validateGroundedAnswer(
  answer: GroundedAnswer,
  topResults: SearchResult[],
  locale: Locale = DEFAULT_LOCALE,
): GroundedAnswer {
  if (!answer.answer.trim() || !answer.grounded || !answer.citations.length) {
    return fallbackGroundedAnswer(locale);
  }

  const resultMap = new Map(topResults.map((result) => [result.resultId, result]));
  const citations = answer.citations;
  const allCitationsValid = citations.every((citation) => {
    const result = resultMap.get(citation.resultId);
    return result ? resultContainsQuote(result, citation.quote) : false;
  });

  if (!allCitationsValid) {
    return fallbackGroundedAnswer(locale);
  }

  return {
    ...answer,
    grounded: true,
    confidence: Math.min(Math.max(answer.confidence, 0), 1),
    citations,
  };
}
