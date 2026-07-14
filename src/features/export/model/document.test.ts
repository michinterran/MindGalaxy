import { describe, expect, it } from "vitest";
import type { GraphSnapshot } from "@/features/knowledge-map/model/graph";
import {
  buildExportDocument,
  EXPORT_DOCUMENT_LIMITS,
} from "@/features/export/model/document";
import {
  buildExportFilename,
  contentDispositionAttachment,
  sanitizeFilenamePart,
} from "@/features/export/model/filename";

function largeGraph(): GraphSnapshot {
  return {
    id: "large",
    source: "workspace",
    nodes: Array.from({ length: 90 }, (_, index) => ({
      id: `node-${index.toString().padStart(2, "0")}`,
      title: `Node ${index} ${"<".repeat(20)}`,
      eyebrow: "Topic",
      summary: `Summary ${index} ${"long text ".repeat(80)}`,
      tone: index === 0 ? "source" : "topic",
      evidenceSnippet: index % 7 === 0 ? `Quote ${index} ${"evidence ".repeat(80)}` : undefined,
    })),
    edges: Array.from({ length: 89 }, (_, index) => ({
      id: `edge-${index}`,
      sourceNodeId: `node-${index.toString().padStart(2, "0")}`,
      targetNodeId: `node-${(index + 1).toString().padStart(2, "0")}`,
      tone: "context",
    })),
  };
}

describe("buildExportDocument", () => {
  it("normalizes a graph deterministically with node and text bounds", () => {
    const document = buildExportDocument({
      generatedAt: "2026-07-14T00:00:00.000Z",
      graph: largeGraph(),
      locale: "ko",
      workspaceName: "테스트 워크스페이스",
    });

    expect(document.nodes).toHaveLength(EXPORT_DOCUMENT_LIMITS.maxNodes);
    expect(document.truncation).toMatchObject({
      originalNodeCount: 90,
      includedNodeCount: 80,
      truncated: true,
    });
    expect(document.nodes.every((node) => node.summary.length <= 360)).toBe(true);
    expect(document.evidence.every((item) => item.quote.length <= 420)).toBe(true);
    expect(document.hierarchy[0]?.id).toBe(document.root.id);
  });

  it("rejects empty graphs explicitly", () => {
    expect(() =>
      buildExportDocument({
        graph: { id: "empty", source: "empty", nodes: [], edges: [] },
        locale: "en",
      }),
    ).toThrow("EXPORT_EMPTY_GRAPH");
  });
});

describe("export filenames", () => {
  it("sanitizes unsafe filename characters and emits RFC5987 disposition", () => {
    const filename = buildExportFilename({
      extension: "pdf",
      timestamp: "2026-07-14T00:00:00.000Z",
      workspaceName: '../위험한:"이름"',
    });

    expect(filename).toBe("위험한--이름-2026-07-14T00-00-00-000Z.pdf");
    expect(sanitizeFilenamePart("")).toBe("mindgalaxy-export");
    expect(contentDispositionAttachment(filename)).toContain("filename*=UTF-8''");
  });

  it("sanitizes header-breaking filenames even when the builder is bypassed", () => {
    const disposition = contentDispositionAttachment(
      'evil\r\nContent-Length: 0\\name;"x".pdf',
    );

    expect(disposition).toContain("attachment;");
    expect(disposition).not.toContain("\r");
    expect(disposition).not.toContain("\n");
    expect(disposition).not.toContain("\\");
    expect(disposition).not.toContain(';"x"');
    expect(decodeURIComponent(disposition.split("filename*=UTF-8''")[1] ?? "")).toBe(
      "evil--Content-Length: 0-name--x-.pdf",
    );
  });
});
