import { t } from "@/lib/i18n";
import { exportToneColor } from "@/features/export/model/document";
import type {
  ExportDocument,
  RenderedExport,
} from "@/features/export/model/schemas";

const HTML_MIME = "text/html; charset=utf-8";

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function css() {
  return `
:root{color-scheme:dark;--bg:#050506;--panel:#0b0f10;--ink:#f4f4f5;--muted:#a1a1aa;--line:rgba(255,255,255,.12);--lime:#d6ff6b;--cyan:#67e8f9}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% 10%,rgba(103,232,249,.12),transparent 28%),radial-gradient(circle at 90% 0,rgba(214,255,107,.08),transparent 25%),var(--bg);color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.58}
main{width:min(1040px,100%);margin:0 auto;padding:48px 28px 72px}.kicker{color:var(--cyan);font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}h1{max-width:820px;margin:10px 0 0;font-size:clamp(38px,7vw,72px);line-height:1.02}h2{margin:0 0 16px;font-size:23px}.subtitle{max-width:760px;color:var(--muted);font-size:15px}.hero{border-bottom:1px solid var(--line);padding-bottom:34px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:24px}.metric,.card{border:1px solid var(--line);border-radius:18px;background:rgba(11,15,16,.78);box-shadow:0 20px 60px rgba(0,0,0,.28)}.metric{padding:16px}.metric span{display:block;color:var(--muted);font-size:12px}.metric strong{display:block;margin-top:4px;color:var(--lime);font-size:28px}.section{margin-top:34px}.summary-list{display:grid;gap:10px;margin:0;padding:0;list-style:none}.summary-list li{border-left:2px solid var(--lime);padding:8px 0 8px 14px;color:#e4e4e7}.node-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.card{padding:16px}.node-top{display:flex;gap:8px;align-items:center;justify-content:space-between;color:var(--muted);font-size:12px}.tone{display:inline-flex;align-items:center;gap:6px}.tone i{width:8px;height:8px;border-radius:99px}.card h3{margin:9px 0 6px;font-size:17px}.card p,.evidence blockquote{margin:0;color:#d4d4d8}.hierarchy{display:grid;gap:8px}.branch{border-left:1px solid var(--line);padding:7px 0 7px calc(12px + var(--depth)*18px)}.branch strong{display:block}.branch span{color:var(--muted);font-size:13px}.connections{width:100%;border-collapse:collapse;overflow:hidden;border-radius:14px}.connections th,.connections td{border-bottom:1px solid var(--line);padding:10px 8px;text-align:left;vertical-align:top}.connections th{color:var(--cyan);font-size:12px;text-transform:uppercase}.next{display:flex;flex-wrap:wrap;gap:8px}.next span{border:1px solid rgba(214,255,107,.28);border-radius:999px;padding:7px 10px;color:var(--lime);font-size:13px}.notice{margin-top:28px;color:var(--muted);font-size:12px}
@media print{body{background:#fff;color:#111}main{width:100%;padding:24mm 18mm}.metric,.card{break-inside:avoid;background:#fff;box-shadow:none}.kicker,.connections th{color:#0369a1}.metric strong,.next span{color:#3f6212}.node-grid,.metrics{grid-template-columns:1fr}.hero{break-after:page}}
`;
}

function renderNodeCard(node: ExportDocument["nodes"][number]) {
  const color = exportToneColor(node.tone);

  return `<article class="card">
  <div class="node-top"><span class="tone"><i style="background:${color}"></i>${escapeHtml(
    node.eyebrow,
  )}</span><span>${escapeHtml(node.confidenceLabel ?? "")}</span></div>
  <h3>${escapeHtml(node.title)}</h3>
  <p>${escapeHtml(node.summary)}</p>
</article>`;
}

export async function renderHtmlExport(document: ExportDocument): Promise<RenderedExport> {
  const html = `<!doctype html>
<html lang="${document.locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(document.title)} · MindGalaxy</title>
  <style>${css()}</style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="kicker">MindGalaxy Export</div>
      <h1>${escapeHtml(document.summary.headline)}</h1>
      <p class="subtitle">${escapeHtml(document.subtitle)}</p>
      <div class="metrics">${document.summary.metrics
        .map(
          (metric) =>
            `<div class="metric"><span>${escapeHtml(metric.label)}</span><strong>${escapeHtml(
              metric.value,
            )}</strong></div>`,
        )
        .join("")}</div>
    </section>
    <section class="section">
      <h2>${escapeHtml(t(document.locale, "export.document.summary"))}</h2>
      <ul class="summary-list">${document.summary.bullets
        .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
        .join("")}</ul>
    </section>
    <section class="section">
      <h2>${escapeHtml(t(document.locale, "export.document.hierarchy"))}</h2>
      <div class="hierarchy">${document.hierarchy
        .map(
          (item) =>
            `<div class="branch" style="--depth:${item.depth}"><strong>${escapeHtml(
              item.title,
            )}</strong><span>${escapeHtml(item.summary)}</span></div>`,
        )
        .join("")}</div>
    </section>
    <section class="section">
      <h2>${escapeHtml(t(document.locale, "export.document.nodes"))}</h2>
      <div class="node-grid">${document.nodes.map(renderNodeCard).join("")}</div>
    </section>
    <section class="section evidence">
      <h2>${escapeHtml(t(document.locale, "export.document.evidence"))}</h2>
      ${
        document.evidence.length
          ? document.evidence
              .map(
                (item) =>
                  `<article class="card"><h3>${escapeHtml(
                    item.title,
                  )}</h3><blockquote>${escapeHtml(item.quote)}</blockquote></article>`,
              )
              .join("")
          : `<p class="subtitle">${escapeHtml(t(document.locale, "export.document.noEvidence"))}</p>`
      }
    </section>
    <section class="section">
      <h2>${escapeHtml(t(document.locale, "export.document.connections"))}</h2>
      <table class="connections"><thead><tr><th>${escapeHtml(
        t(document.locale, "export.document.connectionFrom"),
      )}</th><th>${escapeHtml(
        t(document.locale, "export.document.connectionTo"),
      )}</th><th>${escapeHtml(
        t(document.locale, "export.document.connectionLabel"),
      )}</th></tr></thead><tbody>${document.connections
        .map(
          (item) =>
            `<tr><td>${escapeHtml(item.sourceTitle)}</td><td>${escapeHtml(
              item.targetTitle,
            )}</td><td>${escapeHtml(item.label)}</td></tr>`,
        )
        .join("")}</tbody></table>
    </section>
    <section class="section">
      <h2>${escapeHtml(t(document.locale, "export.document.nextQuestions"))}</h2>
      <div class="next">${document.nextQuestions
        .map((item) => `<span>${escapeHtml(item)}</span>`)
        .join("")}</div>
    </section>
    <p class="notice">${escapeHtml(t(document.locale, "export.document.notice"))}</p>
  </main>
</body>
</html>`;

  return {
    bytes: new TextEncoder().encode(html),
    extension: "html",
    mimeType: HTML_MIME,
  };
}
