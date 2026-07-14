import pptxgen from "pptxgenjs";
import { t } from "@/lib/i18n";
import { exportToneColor } from "@/features/export/model/document";
import type {
  ExportDocument,
  RenderedExport,
} from "@/features/export/model/schemas";

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const THEME = {
  bg: "050506",
  panel: "0B0F10",
  ink: "F4F4F5",
  muted: "A1A1AA",
  line: "263238",
  lime: "D6FF6B",
  cyan: "67E8F9",
};
const FONT_FACE = "Noto Sans KR";

type ShapeName = Parameters<pptxgen.Slide["addShape"]>[0];

function addFrame(
  slide: pptxgen.Slide,
  title: string,
  shapes: { line: ShapeName },
) {
  slide.background = { color: THEME.bg };
  slide.addText("MindGalaxy", {
    x: 0.42,
    y: 0.22,
    w: 1.35,
    h: 0.22,
    fontFace: FONT_FACE,
    fontSize: 8,
    bold: true,
    color: THEME.cyan,
  });
  slide.addText(title, {
    x: 0.42,
    y: 0.48,
    w: 12.3,
    h: 0.5,
    fontFace: FONT_FACE,
    fontSize: 30,
    bold: true,
    color: THEME.ink,
    fit: "shrink",
  });
  slide.addShape(shapes.line, {
    x: 0.42,
    y: 0.92,
    w: 12.45,
    h: 0,
    line: { color: THEME.line, transparency: 10 },
  });
}

function addBullets(
  slide: pptxgen.Slide,
  items: string[],
  x: number,
  y: number,
  w: number,
  h: number,
  fontSize = 13,
) {
  slide.addText(
    items.map((text) => ({
      text,
      options: { bullet: { type: "bullet" as const } },
    })),
    {
      x,
      y,
      w,
      h,
      fontFace: FONT_FACE,
      fontSize: Math.max(16, fontSize),
      breakLine: false,
      color: THEME.ink,
      fit: "shrink",
      valign: "top",
    },
  );
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function colorWithoutHash(value: string) {
  return value.replace("#", "").toUpperCase();
}

export async function renderPptxExport(document: ExportDocument): Promise<RenderedExport> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "MindGalaxy";
  pptx.company = "MindGalaxy";
  pptx.subject = document.summary.headline;
  pptx.title = document.title;
  pptx.theme = {
    headFontFace: FONT_FACE,
    bodyFontFace: FONT_FACE,
  };
  pptx.defineLayout({ name: "LAYOUT_WIDE", width: 13.333, height: 7.5 });

  const cover = pptx.addSlide();
  cover.background = { color: THEME.bg };
  cover.addShape(pptx.ShapeType.arc, {
    x: 8.7,
    y: -0.55,
    w: 4.7,
    h: 4.7,
    line: { color: THEME.cyan, transparency: 35, width: 1 },
  });
  cover.addText("MINDGALAXY EXPORT", {
    x: 0.7,
    y: 0.85,
    w: 3.2,
    h: 0.22,
    fontSize: 9,
    fontFace: FONT_FACE,
    bold: true,
    color: THEME.cyan,
  });
  cover.addText(document.summary.headline, {
    x: 0.7,
    y: 1.35,
    w: 8.2,
    h: 1.9,
    fontSize: 46,
    fontFace: FONT_FACE,
    bold: true,
    color: THEME.ink,
    fit: "shrink",
    breakLine: false,
  });
  cover.addText(document.subtitle, {
    x: 0.72,
    y: 3.42,
    w: 6.6,
    h: 0.52,
    fontSize: 16,
    fontFace: FONT_FACE,
    color: THEME.muted,
    fit: "shrink",
  });
  document.summary.metrics.forEach((metric, index) => {
    cover.addShape(pptx.ShapeType.roundRect, {
      x: 0.72 + index * 2.2,
      y: 4.72,
      w: 1.95,
      h: 0.78,
      rectRadius: 0.08,
      fill: { color: THEME.panel },
      line: { color: THEME.line, transparency: 10 },
    });
    cover.addText(metric.label, {
      x: 0.86 + index * 2.2,
      y: 4.85,
      w: 1.5,
      h: 0.17,
      fontSize: 7,
      fontFace: FONT_FACE,
      color: THEME.muted,
      fit: "shrink",
    });
    cover.addText(metric.value, {
      x: 0.86 + index * 2.2,
      y: 5.08,
      w: 1.5,
      h: 0.28,
      fontSize: 17,
      fontFace: FONT_FACE,
      bold: true,
      color: THEME.lime,
      fit: "shrink",
    });
  });

  const summary = pptx.addSlide();
  addFrame(summary, t(document.locale, "export.document.summary"), pptx.ShapeType);
  addBullets(summary, document.summary.bullets.slice(0, 5), 0.78, 1.58, 11.4, 4.6, 18);

  for (const [index, group] of chunks(document.hierarchy, 6).entries()) {
    const slide = pptx.addSlide();
    addFrame(
      slide,
      `${t(document.locale, "export.document.hierarchy")}${
        index ? ` ${index + 1}` : ""
      }`,
      pptx.ShapeType,
    );
    group.forEach((item, itemIndex) => {
      const y = 1.28 + itemIndex * 0.78;
      slide.addText("•", {
        x: 0.75 + Math.min(item.depth, 5) * 0.22,
        y,
        w: 0.15,
        h: 0.18,
        fontSize: 17,
        fontFace: FONT_FACE,
        color: item.depth ? THEME.cyan : THEME.lime,
      });
      slide.addText(`${item.title} — ${item.summary}`, {
        x: 0.98 + Math.min(item.depth, 5) * 0.22,
        y,
        w: 11.4 - Math.min(item.depth, 5) * 0.22,
        h: 0.52,
        fontSize: 16,
        fontFace: FONT_FACE,
        color: THEME.ink,
        fit: "shrink",
      });
    });
  }

  for (const [index, group] of chunks(document.nodes, 4).entries()) {
    const slide = pptx.addSlide();
    addFrame(
      slide,
      `${t(document.locale, "export.document.nodes")}${index ? ` ${index + 1}` : ""}`,
      pptx.ShapeType,
    );
    group.forEach((node, itemIndex) => {
      const column = itemIndex % 2;
      const row = Math.floor(itemIndex / 2);
      const x = 0.68 + column * 6.12;
      const y = 1.35 + row * 2.35;
      slide.addShape(pptx.ShapeType.roundRect, {
        x,
        y,
        w: 5.62,
        h: 1.85,
        rectRadius: 0.08,
        fill: { color: THEME.panel },
        line: { color: THEME.line, transparency: 8 },
      });
      slide.addShape(pptx.ShapeType.ellipse, {
        x: x + 0.18,
        y: y + 0.19,
        w: 0.1,
        h: 0.1,
        fill: { color: colorWithoutHash(exportToneColor(node.tone)) },
        line: { color: colorWithoutHash(exportToneColor(node.tone)) },
      });
      slide.addText(node.eyebrow, {
        x: x + 0.36,
        y: y + 0.12,
        w: 4.95,
        h: 0.18,
        fontSize: 11,
        fontFace: FONT_FACE,
        color: THEME.muted,
        fit: "shrink",
      });
      slide.addText(node.title, {
        x: x + 0.18,
        y: y + 0.38,
        w: 5.22,
        h: 0.38,
        fontSize: 18,
        fontFace: FONT_FACE,
        bold: true,
        color: THEME.ink,
        fit: "shrink",
      });
      slide.addText(node.summary, {
        x: x + 0.18,
        y: y + 0.86,
        w: 5.22,
        h: 0.68,
        fontSize: 15,
        fontFace: FONT_FACE,
        color: "D4D4D8",
        fit: "shrink",
      });
    });
  }

  const evidenceGroups = chunks(
    document.evidence.length
      ? document.evidence
      : [{ title: t(document.locale, "export.document.evidence"), quote: t(document.locale, "export.document.noEvidence"), nodeId: "empty" }],
    3,
  );
  for (const [index, group] of evidenceGroups.entries()) {
    const slide = pptx.addSlide();
    addFrame(
      slide,
      `${t(document.locale, "export.document.evidence")}${
        index ? ` ${index + 1}` : ""
      }`,
      pptx.ShapeType,
    );
    group.forEach((item, itemIndex) => {
      const y = 1.3 + itemIndex * 1.72;
      slide.addText(item.title, {
        x: 0.75,
        y,
        w: 11.6,
        h: 0.24,
        fontSize: 17,
        fontFace: FONT_FACE,
        bold: true,
        color: THEME.cyan,
        fit: "shrink",
      });
      slide.addText(item.quote, {
        x: 0.75,
        y: y + 0.44,
        w: 11.6,
        h: 0.88,
        fontSize: 16,
        fontFace: FONT_FACE,
        color: "D4D4D8",
        fit: "shrink",
      });
    });
  }

  for (const [index, group] of chunks(document.connections, 5).entries()) {
    const slide = pptx.addSlide();
    addFrame(
      slide,
      `${t(document.locale, "export.document.connections")}${
        index ? ` ${index + 1}` : ""
      }`,
      pptx.ShapeType,
    );
    group.forEach((connection, itemIndex) => {
      const y = 1.3 + itemIndex * 0.9;
      slide.addText(connection.sourceTitle, {
        x: 0.72,
        y,
        w: 3.3,
        h: 0.34,
        fontSize: 16,
        fontFace: FONT_FACE,
        color: THEME.ink,
        fit: "shrink",
      });
      slide.addText("→", {
        x: 4.18,
        y,
        w: 0.3,
        h: 0.24,
        fontSize: 17,
        fontFace: FONT_FACE,
        color: THEME.lime,
      });
      slide.addText(connection.targetTitle, {
        x: 4.55,
        y,
        w: 3.3,
        h: 0.34,
        fontSize: 16,
        fontFace: FONT_FACE,
        color: THEME.ink,
        fit: "shrink",
      });
      slide.addText(connection.label, {
        x: 8.25,
        y,
        w: 3.8,
        h: 0.34,
        fontSize: 14,
        fontFace: FONT_FACE,
        color: THEME.muted,
        fit: "shrink",
      });
    });
  }

  const next = pptx.addSlide();
  addFrame(next, t(document.locale, "export.document.nextQuestions"), pptx.ShapeType);
  addBullets(next, document.nextQuestions, 0.84, 1.58, 11.2, 3.4, 20);
  next.addText(t(document.locale, "export.document.notice"), {
    x: 0.84,
    y: 6.15,
    w: 11,
    h: 0.38,
    fontSize: 8,
    fontFace: FONT_FACE,
    color: THEME.muted,
    fit: "shrink",
  });

  const output = await pptx.write({ outputType: "nodebuffer" });
  const buffer = Buffer.isBuffer(output) ? output : Buffer.from(output as ArrayBuffer);

  return {
    bytes: new Uint8Array(buffer),
    extension: "pptx",
    mimeType: PPTX_MIME,
  };
}
