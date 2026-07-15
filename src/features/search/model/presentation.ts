import type { MessageKey } from "@/lib/i18n";

export const SEARCH_PROGRESS_STEPS = [
  {
    id: "retrieve",
    labelKey: "workspace.search.progress.retrieve",
  },
  {
    id: "evidence",
    labelKey: "workspace.search.progress.evidence",
  },
  {
    id: "answer",
    labelKey: "workspace.search.progress.answer",
  },
] as const satisfies ReadonlyArray<{
  id: "retrieve" | "evidence" | "answer";
  labelKey: MessageKey;
}>;

export type SearchLayerReadiness = {
  id: "lexical" | "semantic" | "graph";
  labelKey: MessageKey;
  status: "ready" | "preparing";
};

export function getSearchLayerReadiness(
  hasActiveAnalysis: boolean,
): SearchLayerReadiness[] {
  return [
    {
      id: "lexical",
      labelKey: "workspace.search.layer.lexical",
      status: "ready",
    },
    {
      id: "semantic",
      labelKey: "workspace.search.layer.semantic",
      status: hasActiveAnalysis ? "preparing" : "ready",
    },
    {
      id: "graph",
      labelKey: "workspace.search.layer.graph",
      status: hasActiveAnalysis ? "preparing" : "ready",
    },
  ];
}
