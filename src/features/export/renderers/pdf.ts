import { readFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { t } from "@/lib/i18n";
import { exportToneColor } from "@/features/export/model/document";
import type {
  ExportDocument,
  RenderedExport,
} from "@/features/export/model/schemas";

const FONT_REGULAR = join(
  process.cwd(),
  "node_modules",
  "@expo-google-fonts",
  "noto-sans-kr",
  "400Regular",
  "NotoSansKR_400Regular.ttf",
);
const FONT_BOLD = join(
  process.cwd(),
  "node_modules",
  "@expo-google-fonts",
  "noto-sans-kr",
  "700Bold",
  "NotoSansKR_700Bold.ttf",
);
const PDF_MIME = "application/pdf";
const PAGE_BACKGROUND = "#050506";

function collectPdf(document: PDFKit.PDFDocument) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    document.on("error", reject);
  });
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function paintPageBackground(doc: PDFKit.PDFDocument) {
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PAGE_BACKGROUND);
  doc.restore();
  doc.x = doc.page.margins.left;
  doc.y = doc.page.margins.top;
}

function heading(doc: PDFKit.PDFDocument, text: string) {
  ensureSpace(doc, 42);
  doc.x = doc.page.margins.left;
  doc.moveDown(0.7);
  doc.font("NotoSansKRBold").fontSize(16).fillColor("#f4f4f5").text(text);
  doc.moveDown(0.35);
}

function paragraph(doc: PDFKit.PDFDocument, text: string, options: PDFKit.Mixins.TextOptions = {}) {
  doc.x = doc.page.margins.left;
  doc.font("NotoSansKR").fontSize(9.5).fillColor("#d4d4d8").text(text, {
    lineGap: 3,
    width: 480,
    ...options,
  });
}

function addPageNumbers(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  const totalPages = range.count;

  for (let index = range.start; index < range.start + totalPages; index += 1) {
    doc.switchToPage(index);
    const label = `MindGalaxy · ${index + 1}/${totalPages}`;

    doc.save();
    doc.font("NotoSansKR").fontSize(8).fillColor("#71717a");

    const labelWidth = Math.ceil(doc.widthOfString(label)) + 8;

    doc.text(label, doc.page.width - doc.page.margins.right - labelWidth, 28, {
      continued: false,
      lineBreak: false,
      width: labelWidth,
    });
    doc.restore();
  }
  doc.x = doc.page.margins.left;
  doc.y = doc.page.margins.top;
}

export async function renderPdfExport(document: ExportDocument): Promise<RenderedExport> {
  const pdf = new PDFDocument({
    autoFirstPage: true,
    bufferPages: true,
    margins: { top: 56, right: 48, bottom: 54, left: 48 },
    size: "A4",
  });
  const done = collectPdf(pdf);

  pdf.registerFont("NotoSansKR", readFileSync(FONT_REGULAR));
  pdf.registerFont("NotoSansKRBold", readFileSync(FONT_BOLD));
  pdf.on("pageAdded", () => {
    paintPageBackground(pdf);
  });
  paintPageBackground(pdf);
  pdf
    .font("NotoSansKR")
    .fontSize(9)
    .fillColor("#67e8f9")
    .text("MINDGALAXY EXPORT", { characterSpacing: 1.4 });
  pdf.moveDown(0.7);
  pdf
    .font("NotoSansKRBold")
    .fontSize(30)
    .fillColor("#f4f4f5")
    .text(document.summary.headline, { lineGap: 2 });
  pdf.moveDown(0.45);
  paragraph(pdf, document.subtitle, { width: 460 });
  pdf.moveDown(1.1);

  const metricTop = pdf.y;
  const metricWidth = 148;
  document.summary.metrics.forEach((metric, index) => {
    const x = pdf.page.margins.left + index * (metricWidth + 12);
    pdf
      .roundedRect(x, metricTop, metricWidth, 56, 10)
      .fillAndStroke("#0b0f10", "#1f2933");
    pdf.font("NotoSansKR").fontSize(8).fillColor("#a1a1aa").text(metric.label, x + 12, metricTop + 11);
    pdf.font("NotoSansKRBold").fontSize(17).fillColor("#d6ff6b").text(metric.value, x + 12, metricTop + 28);
  });
  pdf.x = pdf.page.margins.left;
  pdf.y = metricTop + 72;

  heading(pdf, t(document.locale, "export.document.summary"));
  for (const bullet of document.summary.bullets) {
    ensureSpace(pdf, 34);
    paragraph(pdf, `• ${bullet}`);
  }

  heading(pdf, t(document.locale, "export.document.hierarchy"));
  for (const item of document.hierarchy) {
    ensureSpace(pdf, 30);
    const indent = Math.min(item.depth, 6) * 14;
    pdf.font("NotoSansKRBold").fontSize(9.5).fillColor("#f4f4f5").text(item.title, {
      indent,
    });
    if (item.summary) {
      paragraph(pdf, item.summary, { indent, width: 480 - indent });
    }
  }

  heading(pdf, t(document.locale, "export.document.nodes"));
  for (const node of document.nodes) {
    ensureSpace(pdf, 78);
    const y = pdf.y;
    pdf.roundedRect(pdf.page.margins.left, y, 500, 64, 8).fillAndStroke("#0b0f10", "#20262b");
    pdf
      .circle(pdf.page.margins.left + 14, y + 16, 4)
      .fill(exportToneColor(node.tone));
    pdf.font("NotoSansKR").fontSize(8).fillColor("#a1a1aa").text(node.eyebrow, pdf.page.margins.left + 26, y + 10);
    pdf.font("NotoSansKRBold").fontSize(11).fillColor("#f4f4f5").text(node.title, pdf.page.margins.left + 14, y + 25, {
      width: 470,
    });
    pdf.font("NotoSansKR").fontSize(8.5).fillColor("#d4d4d8").text(node.summary, pdf.page.margins.left + 14, y + 42, {
      width: 470,
      height: 16,
      ellipsis: true,
    });
    pdf.y = y + 74;
  }

  heading(pdf, t(document.locale, "export.document.evidence"));
  if (!document.evidence.length) {
    paragraph(pdf, t(document.locale, "export.document.noEvidence"));
  }
  for (const item of document.evidence) {
    ensureSpace(pdf, 70);
    pdf.font("NotoSansKRBold").fontSize(10).fillColor("#67e8f9").text(item.title);
    paragraph(pdf, `“${item.quote}”`, { width: 480 });
    pdf.moveDown(0.4);
  }

  heading(pdf, t(document.locale, "export.document.connections"));
  for (const connection of document.connections) {
    ensureSpace(pdf, 28);
    paragraph(
      pdf,
      `${connection.sourceTitle} → ${connection.targetTitle} · ${connection.label}`,
      { width: 480 },
    );
  }

  heading(pdf, t(document.locale, "export.document.nextQuestions"));
  for (const question of document.nextQuestions) {
    ensureSpace(pdf, 24);
    paragraph(pdf, `• ${question}`, { width: 480 });
  }

  addPageNumbers(pdf);
  pdf.end();

  return {
    bytes: await done,
    extension: "pdf",
    mimeType: PDF_MIME,
  };
}
