import type {
  ExportDocument,
  ExportKind,
  RenderedExport,
} from "@/features/export/model/schemas";
import { renderHtmlExport } from "@/features/export/renderers/html";
import { renderPdfExport } from "@/features/export/renderers/pdf";
import { renderPptxExport } from "@/features/export/renderers/pptx";

export type ExportRenderer = (document: ExportDocument) => Promise<RenderedExport>;

export const exportRendererRegistry: Record<ExportKind, ExportRenderer> = {
  html: renderHtmlExport,
  pdf: renderPdfExport,
  pptx: renderPptxExport,
};

export function getExportRenderer(kind: ExportKind) {
  return exportRendererRegistry[kind];
}
