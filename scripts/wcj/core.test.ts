import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { formatHuman, validateWcj } from "./core.mjs";

const temporaryRoots: string[] = [];
const cliPath = path.resolve("scripts/wcj/cli.mjs");

async function fixture(overrides: Record<string, string> = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "mindgalaxy-wcj-"));
  temporaryRoots.push(root);

  const files: Record<string, string> = {
    "src/app/layout.tsx": `<html lang={locale}><body>{children}</body></html>`,
    "src/app/page.tsx": `<main><h1 className="semantic-headline">Title</h1></main>`,
    "src/app/globals.css": `
      :lang(ko) .semantic-headline { word-break: keep-all; }
      .semantic-headline { text-wrap: balance; }
      p { text-wrap: pretty; }
      button { white-space: nowrap; }
      button:focus-visible { outline: 2px solid; }
      @media (prefers-reduced-motion: reduce) { * { animation: none; } }
    `,
    "src/lib/i18n/messages.ts": `
      const ko = { "brand.sloganLine1": "a", "brand.sloganLine2": "b", "onboarding.titleLine1": "c", "onboarding.titleLine2": "d" } as const;
      const en = {} as const satisfies Record<keyof typeof ko, string>;
      export const messages = { ko, en };
    `,
    "src/components/knowledge-workspace.tsx": `
      <h2 className="semantic-headline">Title</h2>;
      rememberCapture(); changeArea("knowledge");
    `,
    "src/components/workspace-toolbar.tsx": `
      <form role="search"><input aria-label="Search" /><button type="submit">Go</button></form>;
      workspace.toolbar.searchSubmit;
    `,
    "src/features/knowledge-map/model/readiness.ts": `no_capture queued running needs_review failed completed_empty ready`,
    "src/features/knowledge-map/components/knowledge-map-readiness.tsx": `
      <section aria-busy={active}><p aria-live="polite" role="status" /></section>;
      retryAnalysis processingJobId workspace.graph.readiness.retry provisional-source-node map-readiness-pipeline;
    `,
    "src/features/knowledge-map/components/knowledge-map-client.tsx": `MindMapView GalaxyView KnowledgeMapReadiness`,
    "src/features/workspace/hooks/use-workspace-controller.ts": `
      useState<WorkspaceArea>("knowledge"); hasActiveJobs; setInterval; router.refresh; activeJobPollIntervalMs; activeStatuses;
    `,
    "src/features/search/components/search-command-panel.tsx": `idle loading success error workspace.search.progress workspace.search.analysisNotice`,
    "src/app/api/processing-jobs/[jobId]/retry/route.ts": `export async function POST() {}`,
    ...overrides,
  };

  for (const [file, source] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), source);
  }
  return root;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("WCJ validator", () => {
  it("passes a complete compliance and journey fixture", async () => {
    const result = await validateWcj({ root: await fixture() });
    expect(result.score.passed).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.rules.total).toBeGreaterThan(15);
  });

  it.each([
    ["W001", { "src/app/layout.tsx": `<html><body>{children}</body></html>` }],
    ["W002", { "src/components/workspace-toolbar.tsx": `<form role="search"><input /><button type="submit">Go</button></form>; workspace.toolbar.searchSubmit;` }],
    ["W003", { "src/app/page.tsx": `<main><h1 className="semantic-headline">Title</h1><button>Go</button></main>` }],
    ["W004", { "src/app/page.tsx": `<main><h1 className="semantic-headline">Title</h1><div role="button" onClick={() => activate()}>Go</div></main>` }],
    ["W005", { "src/app/page.tsx": `<main><h1 className="semantic-headline">Title</h1><img src="/preview.png" /></main>` }],
    ["W006", { "src/app/page.tsx": `<main><h1 className="semantic-headline">Title</h1><dialog>Confirm</dialog></main>` }],
    ["W007", { "src/app/page.tsx": `<main><h1 className="semantic-headline">Title</h1><div dangerouslySetInnerHTML={{ __html: value }} /></main>` }],
    ["W008", { "src/app/globals.css": `:lang(ko) .semantic-headline { word-break: keep-all; } .semantic-headline { text-wrap: balance; } p { text-wrap: pretty; } button { white-space: nowrap; }` }],
    ["C001", { "src/lib/i18n/messages.ts": `export const messages = { ko: {}, en: {} };` }],
    ["C002", { "src/app/page.tsx": `<main><h1 className="semantic-headline">하드코딩</h1></main>` }],
    ["C003", { "src/app/globals.css": `:lang(ko) .semantic-headline { word-break: keep-all; } .semantic-headline { text-wrap: balance; } p { text-wrap: pretty; } button:focus-visible { outline: 2px solid; } @media (prefers-reduced-motion: reduce) { * { animation: none; } }` }],
    ["C004", { "src/app/page.tsx": `<main><h1>Title</h1></main>` }],
    ["C005", { "src/app/globals.css": `:root { --foreground: #fff; } :lang(ko) .semantic-headline { word-break: keep-all; } .semantic-headline { color: #fff; text-wrap: balance; } p { text-wrap: pretty; } button { white-space: nowrap; } button:focus-visible { outline: 2px solid; } @media (prefers-reduced-motion: reduce) { * { animation: none; } }` }],
    ["J001", { "src/features/knowledge-map/model/readiness.ts": `no_capture queued running ready` }],
    ["J002", { "src/features/knowledge-map/components/knowledge-map-readiness.tsx": `<section aria-busy={active}><p aria-live="polite" role="status" /></section>; provisional-source-node map-readiness-pipeline;` }],
    ["J003", { "src/features/workspace/hooks/use-workspace-controller.ts": `useState<WorkspaceArea>("knowledge"); hasActiveJobs; activeStatuses;` }],
    ["J004", { "src/features/search/components/search-command-panel.tsx": `idle loading success error` }],
    ["J005", { "src/features/knowledge-map/components/knowledge-map-client.tsx": `MindMapView KnowledgeMapReadiness` }],
    ["J006", { "src/components/knowledge-workspace.tsx": `<h2 className="semantic-headline">Title</h2>; rememberCapture();` }],
  ] satisfies Array<[string, Record<string, string>]>) (
    "reports representative %s contract failures",
    async (ruleId, overrides) => {
      const result = await validateWcj({ root: await fixture(overrides) });
      expect(result.violations.some((item) => item.id === ruleId)).toBe(true);
    },
  );

  it("accepts a keyboard-complete custom interaction and named native dialog", async () => {
    const result = await validateWcj({
      root: await fixture({
        "src/app/page.tsx": `
          <main>
            <h1 className="semantic-headline">Title</h1>
            <div role="button" tabIndex={0} onClick={() => activate()} onKeyDown={(event) => event.key === "Enter" && activate()}>Go</div>
            <dialog aria-labelledby="confirm-title"><h2 id="confirm-title">Confirm</h2></dialog>
            <aside role="dialog" aria-modal="true" aria-label="Inspector">Panel</aside>
          </main>
        `,
      }),
    });
    expect(result.violations.filter((item) => ["W004", "W006"].includes(item.id))).toEqual([]);
  });

  it("requires both modality and an accessible name for role dialogs", async () => {
    const result = await validateWcj({
      root: await fixture({
        "src/app/page.tsx": `<main><h1 className="semantic-headline">Title</h1><aside role="dialog" aria-label="Inspector">Panel</aside></main>`,
      }),
    });
    expect(result.violations.some((item) => item.id === "W006")).toBe(true);
  });

  it("allows raw palette values in :root but rejects raw selector colors", async () => {
    const valid = await validateWcj({
      root: await fixture({
        "src/app/globals.css": `
          :root { --foreground: #fff; --glass: rgba(255, 255, 255, 0.1); }
          :lang(ko) .semantic-headline { word-break: keep-all; }
          .semantic-headline { color: var(--foreground); text-wrap: balance; }
          p { text-wrap: pretty; } button { white-space: nowrap; }
          button:focus-visible { outline: 2px solid; }
          @media (prefers-reduced-motion: reduce) { * { animation: none; } }
        `,
      }),
    });
    expect(valid.violations.some((item) => item.id === "C005")).toBe(false);

    const invalid = await validateWcj({
      root: await fixture({
        "src/app/globals.css": `
          :root { --foreground: #fff; }
          :lang(ko) .semantic-headline { word-break: keep-all; }
          .semantic-headline { color: rgb(255, 255, 255); text-wrap: balance; }
          p { text-wrap: pretty; } button { white-space: nowrap; }
          button:focus-visible { outline: 2px solid; }
          @media (prefers-reduced-motion: reduce) { * { animation: none; } }
        `,
      }),
    });
    expect(invalid.violations.some((item) => item.id === "C005")).toBe(true);
  });

  it("applies category deductions, the critical gate, and human scoring output", async () => {
    const major = await validateWcj({
      root: await fixture({
        "src/app/page.tsx": `<main><h1 className="semantic-headline">Title</h1><button>Go</button></main>`,
      }),
    });
    expect((major.score.categories as Record<string, number>).W).toBe(88);
    expect(major.score.total).toBe(95);
    expect(major.score.passed).toBe(true);
    expect(formatHuman(major)).toContain("[MAJOR] W003");

    const critical = await validateWcj({
      root: await fixture({ "src/app/layout.tsx": `<html><body>{children}</body></html>` }),
    });
    expect(critical.score.hasCritical).toBe(true);
    expect(critical.score.passed).toBe(false);
    expect(formatHuman(critical)).toContain("WCJ 1.0.0 - FAIL");
  });

  it("emits parseable JSON and CLI exit codes 0, 1, and 2", async () => {
    const passingRoot = await fixture();
    const passing = spawnSync(process.execPath, [cliPath, "--root", passingRoot, "--format", "json"], { encoding: "utf8" });
    expect(passing.status).toBe(0);
    const passingReport = JSON.parse(passing.stdout);
    expect(Object.keys(passingReport)).toEqual([
      "standard",
      "generatedAt",
      "root",
      "filesScanned",
      "rules",
      "score",
      "violations",
      "manualReview",
    ]);
    expect(passingReport.standard).toEqual({
      name: "WCJ",
      expandedName: "Web Compliance & Journey",
      version: "1.0.0",
    });
    expect(Number.isNaN(Date.parse(passingReport.generatedAt))).toBe(false);
    expect(passingReport.root).toBe(passingRoot);
    expect(passingReport.filesScanned).toBeGreaterThan(0);
    expect(passingReport.rules.passed.length + passingReport.rules.failed.length).toBe(
      passingReport.rules.total,
    );
    expect(passingReport.score).toEqual({
      categories: { W: 100, C: 100, J: 100 },
      hasCritical: false,
      passed: true,
      total: 100,
    });
    expect(passingReport.violations).toEqual([]);
    expect(passingReport.manualReview).toEqual(expect.any(Array));

    const failingRoot = await fixture({ "src/app/layout.tsx": `<html><body>{children}</body></html>` });
    const failing = spawnSync(process.execPath, [cliPath, "--root", failingRoot, "--format", "json"], { encoding: "utf8" });
    expect(failing.status).toBe(1);
    const failingReport = JSON.parse(failing.stdout);
    expect(failingReport.score.hasCritical).toBe(true);
    expect(Object.keys(failingReport.violations[0])).toEqual([
      "id",
      "category",
      "severity",
      "title",
      "file",
      "line",
      "message",
      "evidence",
    ]);

    const invalid = spawnSync(process.execPath, [cliPath, "--format", "xml"], { encoding: "utf8" });
    expect(invalid.status).toBe(2);
    expect(invalid.stderr).toContain("Unsupported format");
  });
});
