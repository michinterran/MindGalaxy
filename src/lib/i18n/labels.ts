import { t, type Locale, type MessageKey } from "@/lib/i18n";
import type { CaptureSourceKind, NodeKind, ProcessingStatus } from "@/types/domain";

export function nodeKindLabel(locale: Locale, kind: NodeKind | null | undefined) {
  return kind ? t(locale, `graph.nodeKind.${kind}` as MessageKey) : "";
}

export function captureSourceLabel(locale: Locale, kind: CaptureSourceKind | string | null | undefined) {
  return kind
    ? t(locale, `capture.sourceKind.${kind}` as MessageKey)
    : t(locale, "capture.sourceKind.unknown");
}

export function processingStatusLabel(
  locale: Locale,
  status: ProcessingStatus | string | null | undefined,
) {
  return status
    ? t(locale, `processing.status.${status}` as MessageKey)
    : t(locale, "processing.status.pending");
}

export function searchSourceTypeLabel(locale: Locale, sourceType: "node" | "capture") {
  return t(locale, `workspace.search.sourceType.${sourceType}` as MessageKey);
}
