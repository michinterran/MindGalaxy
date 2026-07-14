import type { SearchResult } from "@/features/search/model/schemas";
import { DEFAULT_LOCALE, t, type Locale } from "@/lib/i18n";

type SearchRow = {
  result_id: string;
  source_type: string;
  title: string | null;
  snippet: string | null;
  evidence: string | null;
  node_kind: SearchResult["nodeKind"];
  capture_id: string | null;
  lexical_score: number | null;
  semantic_score: number | null;
  graph_score: number | null;
  final_score: number | null;
};

function clampScore(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

export function mapSearchRow(
  row: SearchRow,
  locale: Locale = DEFAULT_LOCALE,
): SearchResult {
  const sourceType = row.source_type === "capture" ? "capture" : "node";
  const title = row.title?.trim() || (
    sourceType === "capture" ? t(locale, "workspace.recent.untitled") : ""
  );

  return {
    resultId: row.result_id,
    sourceType,
    title,
    snippet: (row.snippet ?? "").slice(0, 500),
    evidence: row.evidence ? row.evidence.slice(0, 500) : null,
    nodeKind: row.node_kind,
    captureId: row.capture_id,
    lexicalScore: clampScore(row.lexical_score),
    semanticScore: clampScore(row.semantic_score),
    graphScore: clampScore(row.graph_score),
    finalScore: clampScore(row.final_score),
  };
}

export function mapSearchRows(
  rows: SearchRow[] | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
) {
  return (rows ?? []).map((row) => mapSearchRow(row, locale));
}
