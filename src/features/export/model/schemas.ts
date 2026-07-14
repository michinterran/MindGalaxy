import { z } from "zod";
import type { Locale } from "@/lib/i18n";

export const exportKindSchema = z.enum(["html", "pdf", "pptx"]);

export const exportRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  kind: exportKindSchema,
  locale: z.enum(["ko", "en"]).default("ko"),
});

export type ExportKind = z.infer<typeof exportKindSchema>;
export type ExportRequest = z.infer<typeof exportRequestSchema>;

export type ExportNode = {
  id: string;
  title: string;
  eyebrow: string;
  summary: string;
  tone: string;
  confidenceLabel?: string;
  evidenceSnippet?: string;
  level: number;
  degree: number;
  importance: number;
};

export type ExportHierarchyItem = {
  id: string;
  title: string;
  depth: number;
  summary: string;
};

export type ExportEvidence = {
  nodeId: string;
  title: string;
  quote: string;
};

export type ExportConnection = {
  id: string;
  sourceTitle: string;
  targetTitle: string;
  label: string;
};

export type ExportDocument = {
  id: string;
  locale: Locale;
  title: string;
  subtitle: string;
  generatedAt: string;
  source: "demo" | "empty" | "workspace";
  root: ExportNode;
  summary: {
    headline: string;
    bullets: string[];
    metrics: Array<{ label: string; value: string }>;
  };
  hierarchy: ExportHierarchyItem[];
  nodes: ExportNode[];
  evidence: ExportEvidence[];
  connections: ExportConnection[];
  nextQuestions: string[];
  truncation: {
    maxNodes: number;
    originalNodeCount: number;
    includedNodeCount: number;
    truncated: boolean;
  };
};

export type RenderedExport = {
  bytes: Uint8Array;
  extension: ExportKind;
  mimeType: string;
};
