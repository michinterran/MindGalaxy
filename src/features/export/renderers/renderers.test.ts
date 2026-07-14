import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildExportDocument } from "@/features/export/model/document";
import { getDemoGraphSnapshot } from "@/features/knowledge-map/demo/demo-graph";
import { renderHtmlExport } from "@/features/export/renderers/html";
import { renderPdfExport } from "@/features/export/renderers/pdf";
import { renderPptxExport } from "@/features/export/renderers/pptx";

const QA_DIR = join(process.cwd(), "output", "export-qa");

function demoDocument() {
  return buildExportDocument({
    generatedAt: "2026-07-14T00:00:00.000Z",
    graph: {
      ...getDemoGraphSnapshot("ko", "00000000-0000-0000-0000-000000000000"),
      source: "workspace",
      nodes: getDemoGraphSnapshot("ko").nodes.map((node, index) => ({
        ...node,
        evidenceSnippet:
          index === 0
            ? "<script>alert('xss')</script> 원문 근거는 HTML에서 escape되어야 합니다."
            : node.evidenceSnippet,
      })),
    },
    locale: "ko",
    workspaceName: "MindGalaxy QA",
  });
}

function mixedBoundsDocument() {
  const longMixed =
    "한글 English 123 <> & \" ' " +
    "데이터 운영과 지식 구조를 안전하게 내보내는 긴 문장 ".repeat(18) +
    "evidence connection summary presentation export ".repeat(18);

  return buildExportDocument({
    generatedAt: "2026-07-14T00:00:00.000Z",
    graph: {
      id: "mixed-bounds",
      source: "workspace",
      nodes: Array.from({ length: 12 }, (_, index) => ({
        id: `mixed-${index}`,
        title: `${index} ${longMixed}`,
        eyebrow: index % 2 ? "Evidence" : "원문 요약",
        summary: `${longMixed} ${index}`,
        tone: index === 0 ? "source" : index % 3 === 0 ? "evidence" : "topic",
        confidenceLabel: `${90 - index}%`,
        evidenceSnippet:
          index % 2 === 0
            ? `<script>bad()</script> ${longMixed} quote ${index}`
            : undefined,
      })),
      edges: Array.from({ length: 11 }, (_, index) => ({
        id: `mixed-edge-${index}`,
        sourceNodeId: `mixed-${index}`,
        targetNodeId: `mixed-${index + 1}`,
        label: `${longMixed} relation ${index}`,
        tone: index % 2 ? "context" : "evidence",
      })),
    },
    locale: "ko",
    workspaceName: "혼합 Bounds QA",
  });
}

describe("export renderers", () => {
  it("renders standalone escaped HTML and writes a QA sample", async () => {
    const rendered = await renderHtmlExport(demoDocument());
    const html = new TextDecoder().decode(rendered.bytes);

    expect(rendered.mimeType).toBe("text/html; charset=utf-8");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).not.toMatch(/<script[\s>]/i);

    await mkdir(QA_DIR, { recursive: true });
    await writeFile(join(QA_DIR, "mindgalaxy-demo.html"), rendered.bytes);
  });

  it("renders PDF bytes with an embedded Korean-capable font strategy", async () => {
    const rendered = await renderPdfExport(demoDocument());
    const signature = Buffer.from(rendered.bytes.slice(0, 5)).toString("utf8");

    expect(rendered.mimeType).toBe("application/pdf");
    expect(signature).toBe("%PDF-");
    expect(rendered.bytes.byteLength).toBeGreaterThan(10_000);

    await mkdir(QA_DIR, { recursive: true });
    await writeFile(join(QA_DIR, "mindgalaxy-demo.pdf"), rendered.bytes);
  });

  it("renders PPTX zip bytes and writes a QA sample", async () => {
    const rendered = await renderPptxExport(demoDocument());
    const signature = Buffer.from(rendered.bytes.slice(0, 4)).toString("hex");

    expect(rendered.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(signature).toBe("504b0304");
    expect(rendered.bytes.byteLength).toBeGreaterThan(10_000);

    await mkdir(QA_DIR, { recursive: true });
    await writeFile(join(QA_DIR, "mindgalaxy-demo.pptx"), rendered.bytes);
  });

  it("renders bounded mixed Korean and English content in every format", async () => {
    const document = mixedBoundsDocument();
    const html = await renderHtmlExport(document);
    const pdf = await renderPdfExport(document);
    const pptx = await renderPptxExport(document);
    const htmlText = new TextDecoder().decode(html.bytes);

    expect(document.nodes.every((node) => node.title.length <= 140)).toBe(true);
    expect(document.nodes.every((node) => node.summary.length <= 360)).toBe(true);
    expect(document.evidence.every((item) => item.quote.length <= 420)).toBe(true);
    expect(document.connections.every((item) => item.label.length <= 80)).toBe(true);

    expect(htmlText).toContain("&lt;script&gt;bad()&lt;/script&gt;");
    expect(htmlText).not.toMatch(/<script[\s>]/i);
    expect(Buffer.from(pdf.bytes.slice(0, 5)).toString("utf8")).toBe("%PDF-");
    expect(Buffer.from(pptx.bytes.slice(0, 4)).toString("hex")).toBe("504b0304");
    expect(html.bytes.byteLength).toBeGreaterThan(10_000);
    expect(pdf.bytes.byteLength).toBeGreaterThan(10_000);
    expect(pptx.bytes.byteLength).toBeGreaterThan(10_000);
  });
});
