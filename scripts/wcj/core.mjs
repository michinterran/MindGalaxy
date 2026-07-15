import { promises as fs } from "node:fs";
import path from "node:path";
import { WCJ_RULES, WCJ_STANDARD } from "./config.mjs";

const ruleById = new Map(WCJ_RULES.map((rule) => [rule.id, rule]));

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function lineAt(source, index) {
  return source.slice(0, Math.max(0, index)).split("\n").length;
}

function evidence(value) {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}

async function walk(root, directory, result) {
  const absoluteDirectory = path.join(root, directory);
  let entries;
  try {
    entries = await fs.readdir(absoluteDirectory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const relative = toPosix(path.join(directory, entry.name));
    if (entry.isDirectory()) {
      await walk(root, relative, result);
      continue;
    }
    if (!WCJ_STANDARD.extensions.some((extension) => relative.endsWith(extension))) continue;
    if (WCJ_STANDARD.exclusions.some((suffix) => relative.endsWith(suffix))) continue;
    result.push(relative);
  }
}

async function loadProject(root) {
  const files = [];
  for (const sourceRoot of WCJ_STANDARD.sourceRoots) {
    await walk(root, sourceRoot, files);
  }

  const sources = new Map();
  for (const file of files.sort()) {
    sources.set(file, await fs.readFile(path.join(root, file), "utf8"));
  }

  async function read(file) {
    if (sources.has(file)) return sources.get(file);
    try {
      const source = await fs.readFile(path.join(root, file), "utf8");
      sources.set(file, source);
      return source;
    } catch {
      return "";
    }
  }

  return { files, read, sources };
}

function violation(id, file, source, index, message, matched = "") {
  const rule = ruleById.get(id);
  if (!rule) throw new Error(`Unknown WCJ rule: ${id}`);
  return {
    ...rule,
    file,
    line: lineAt(source, index),
    message,
    evidence: evidence(matched),
  };
}

function openingTags(source, tagName) {
  const matches = [];
  const startPattern = new RegExp(`<${tagName}\\b`, "g");
  let startMatch;
  while ((startMatch = startPattern.exec(source)) !== null) {
    let quote = null;
    let braces = 0;
    let cursor = startMatch.index + startMatch[0].length;
    for (; cursor < source.length; cursor += 1) {
      const character = source[cursor];
      const previous = source[cursor - 1];
      if (quote) {
        if (character === quote && previous !== "\\") quote = null;
        continue;
      }
      if (character === '"' || character === "'" || character === "`") {
        quote = character;
      } else if (character === "{") {
        braces += 1;
      } else if (character === "}") {
        braces = Math.max(0, braces - 1);
      } else if (character === ">" && braces === 0) {
        matches.push({ 0: source.slice(startMatch.index, cursor + 1), index: startMatch.index });
        startPattern.lastIndex = cursor + 1;
        break;
      }
    }
  }
  return matches;
}

function blockSpans(source, selectors) {
  const spans = [];
  for (const selector of selectors) {
    const pattern = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "g");
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const start = match.index;
      let depth = 1;
      let quote = null;
      let cursor = pattern.lastIndex;
      for (; cursor < source.length; cursor += 1) {
        const character = source[cursor];
        const previous = source[cursor - 1];
        if (quote) {
          if (character === quote && previous !== "\\") quote = null;
          continue;
        }
        if (character === '"' || character === "'") {
          quote = character;
        } else if (character === "{") {
          depth += 1;
        } else if (character === "}") {
          depth -= 1;
          if (depth === 0) {
            spans.push({ start, end: cursor + 1 });
            pattern.lastIndex = cursor + 1;
            break;
          }
        }
      }
    }
  }
  return spans;
}

function isInsideSpan(index, spans) {
  return spans.some((span) => index >= span.start && index < span.end);
}

function hasAccessibleControlName(source, match) {
  const tag = match[0];
  if (/\baria-(?:label|labelledby)\s*=/.test(tag)) return true;

  const id = tag.match(/\bid\s*=\s*["']([^"']+)["']/)?.[1];
  if (id && new RegExp(`htmlFor\\s*=\\s*["']${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(source)) {
    return true;
  }

  const before = source.slice(0, match.index);
  return before.lastIndexOf("<label") > before.lastIndexOf("</label>");
}

function includesAll(source, values) {
  return values.every((value) => source.includes(value));
}

function scanWeb(project) {
  const violations = [];
  const layout = project.sources.get("src/app/layout.tsx") ?? "";
  if (!/<html\b[\s\S]*?\blang\s*=/.test(layout)) {
    violations.push(violation("W001", "src/app/layout.tsx", layout, 0, "Root HTML must expose the active document language."));
  }

  for (const [file, source] of project.sources) {
    if (!file.endsWith(".tsx")) continue;

    for (const tagName of ["input", "textarea", "select"]) {
      for (const match of openingTags(source, tagName)) {
        if (!hasAccessibleControlName(source, match)) {
          violations.push(violation("W002", file, source, match.index, `<${tagName}> needs a programmatic label.`, match[0]));
        }
      }
    }

    for (const match of openingTags(source, "button")) {
      if (!/\btype\s*=/.test(match[0])) {
        violations.push(violation("W003", file, source, match.index, "Buttons must declare type=button or type=submit.", match[0]));
      }
    }

    for (const tagName of [
      "div", "span", "section", "article", "aside", "p", "li", "nav",
      "main", "header", "footer", "figure",
    ]) {
      for (const match of openingTags(source, tagName)) {
        if (!/\bonClick\s*=/.test(match[0])) continue;
        const hasInteractiveRole = /\brole\s*=\s*["'](?:button|link|tab|option)["']/.test(match[0]);
        const hasNaturalTabStop = /\btabIndex\s*=\s*(?:\{\s*0\s*\}|["']0["'])/.test(match[0]);
        const hasKeyboardHandler = /\bonKeyDown\s*=/.test(match[0]);
        if (!hasInteractiveRole || !hasNaturalTabStop || !hasKeyboardHandler) {
          violations.push(violation(
            "W004",
            file,
            source,
            match.index,
            `Clickable <${tagName}> must use a native control or provide role, tabIndex=0, and onKeyDown keyboard support.`,
            match[0],
          ));
        }
      }
    }
    for (const match of source.matchAll(/\btabIndex\s*=\s*\{?([1-9]\d*)\}?/g)) {
      violations.push(violation("W004", file, source, match.index, "Positive tabIndex changes the natural keyboard order.", match[0]));
    }

    for (const match of openingTags(source, "img")) {
      if (!/\balt\s*=/.test(match[0])) {
        violations.push(violation("W005", file, source, match.index, "Images require an alt attribute.", match[0]));
      }
    }
    for (const match of openingTags(source, "iframe")) {
      if (!/\btitle\s*=/.test(match[0])) {
        violations.push(violation("W005", file, source, match.index, "Iframes require a title.", match[0]));
      }
    }
    for (const match of openingTags(source, "a")) {
      if (/\btarget\s*=\s*["']_blank["']/.test(match[0]) && !/\brel\s*=\s*["'][^"']*(?:noopener|noreferrer)/.test(match[0])) {
        violations.push(violation("W005", file, source, match.index, "New-tab links require noopener or noreferrer.", match[0]));
      }
    }

    for (const tagName of ["aside", "div", "section", "article", "dialog"]) {
      for (const match of openingTags(source, tagName)) {
        const tag = match[0];
        const isNativeDialog = tagName === "dialog";
        const hasDialogRole = /\brole\s*=\s*["']dialog["']/.test(tag);
        if (!isNativeDialog && !hasDialogRole) continue;
        const hasName = /\baria-(?:label|labelledby)\s*=/.test(tag);
        const hasModalState = /\baria-modal\s*=\s*["']true["']/.test(tag);
        if (!hasName || (hasDialogRole && !hasModalState)) {
          violations.push(violation(
            "W006",
            file,
            source,
            match.index,
            isNativeDialog
              ? "Native dialogs require an accessible name."
              : "Role dialogs require aria-modal=true and an accessible name.",
            tag,
          ));
        }
      }
    }

    for (const match of source.matchAll(/dangerouslySetInnerHTML/g)) {
      violations.push(violation("W007", file, source, match.index, "Raw HTML injection is not permitted in application UI.", match[0]));
    }
  }

  for (const [file, source] of project.sources) {
    for (const match of source.matchAll(/NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PRIVATE_KEY|API_KEY)/g)) {
      violations.push(violation("W007", file, source, match.index, "Secret-like values must never use a NEXT_PUBLIC_ name.", match[0]));
    }
  }

  const css = project.sources.get("src/app/globals.css") ?? "";
  if (!css.includes(":focus-visible") || !css.includes("prefers-reduced-motion: reduce")) {
    violations.push(violation("W008", "src/app/globals.css", css, 0, "Global CSS needs visible focus and reduced-motion behavior."));
  }

  return violations;
}

function scanConsistency(project) {
  const violations = [];
  const messages = project.sources.get("src/lib/i18n/messages.ts") ?? "";
  if (!includesAll(messages, ["const ko =", "const en =", "satisfies Record<keyof typeof ko, string>", "export const messages"])) {
    violations.push(violation("C001", "src/lib/i18n/messages.ts", messages, 0, "Korean and English dictionaries must preserve compile-time key parity."));
  }

  for (const [file, source] of project.sources) {
    if (!file.endsWith(".tsx")) continue;
    for (const match of source.matchAll(/[가-힣]+/g)) {
      violations.push(violation("C002", file, source, match.index, "User-facing Korean copy belongs in the i18n dictionary.", match[0]));
    }
  }

  const css = project.sources.get("src/app/globals.css") ?? "";
  if (!includesAll(css, [":lang(ko)", "word-break: keep-all", "text-wrap: balance", "text-wrap: pretty", "white-space: nowrap"])) {
    violations.push(violation("C003", "src/app/globals.css", css, 0, "Korean editorial, body, and control line-break policies must be explicit."));
  }

  const page = project.sources.get("src/app/page.tsx") ?? "";
  const workspace = project.sources.get("src/components/knowledge-workspace.tsx") ?? "";
  if (!includesAll(messages, ["brand.sloganLine1", "brand.sloganLine2", "onboarding.titleLine1", "onboarding.titleLine2"]) ||
      !page.includes("semantic-headline") || !workspace.includes("semantic-headline")) {
    violations.push(violation("C004", "src/lib/i18n/messages.ts", messages, 0, "Approved headlines need semantic line keys and the semantic-headline style contract."));
  }

  for (const [file, source] of project.sources) {
    if (!file.endsWith(".tsx") || WCJ_STANDARD.allowlists.rendererColorFiles.includes(file)) continue;
    for (const match of source.matchAll(/(?:#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\([^)]*\))/gi)) {
      violations.push(violation("C005", file, source, match.index, "Page/component colors must come from the shared token registry.", match[0]));
    }
  }

  for (const [file, source] of project.sources) {
    if (!file.endsWith(".css")) continue;
    const tokenDefinitionSpans = blockSpans(
      source,
      WCJ_STANDARD.allowlists.cssTokenDefinitionSelectors,
    );
    for (const match of source.matchAll(/(?:#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\([^)]*\))/gi)) {
      if (isInsideSpan(match.index, tokenDefinitionSpans)) continue;
      violations.push(violation(
        "C005",
        file,
        source,
        match.index,
        "Raw CSS colors are allowed only in the shared :root token registry.",
        match[0],
      ));
    }
  }

  return violations;
}

function contractViolation(id, file, source, required, message) {
  if (includesAll(source, required)) return [];
  const missing = required.filter((value) => !source.includes(value));
  return [violation(id, file, source, 0, `${message} Missing: ${missing.join(", ")}`)];
}

function scanJourney(project) {
  const violations = [];
  const readiness = project.sources.get("src/features/knowledge-map/model/readiness.ts") ?? "";
  violations.push(...contractViolation(
    "J001",
    "src/features/knowledge-map/model/readiness.ts",
    readiness,
    ["no_capture", "queued", "running", "needs_review", "failed", "completed_empty", "ready"],
    "Knowledge-map readiness must distinguish empty, active, review, failure, and ready states.",
  ));

  const readinessView = project.sources.get("src/features/knowledge-map/components/knowledge-map-readiness.tsx") ?? "";
  const retryRoute = project.sources.get("src/app/api/processing-jobs/[jobId]/retry/route.ts") ?? "";
  if (!includesAll(readinessView, ["retryAnalysis", "workspace.graph.readiness.retry", "processingJobId"]) || !retryRoute.includes("POST")) {
    violations.push(violation("J002", "src/features/knowledge-map/components/knowledge-map-readiness.tsx", readinessView, 0, "Failed analysis must offer a durable retry backed by a POST route."));
  }

  const controller = project.sources.get("src/features/workspace/hooks/use-workspace-controller.ts") ?? "";
  if (!includesAll(controller, ["hasActiveJobs", "setInterval", "router.refresh", "activeJobPollIntervalMs"]) ||
      !includesAll(readinessView, ["aria-busy", "aria-live=\"polite\"", "role=\"status\""])) {
    violations.push(violation("J003", "src/features/workspace/hooks/use-workspace-controller.ts", controller, 0, "Long-running analysis needs polling and assistive status announcements."));
  }

  const toolbar = project.sources.get("src/components/workspace-toolbar.tsx") ?? "";
  const searchPanel = project.sources.get("src/features/search/components/search-command-panel.tsx") ?? "";
  if (!includesAll(toolbar, ["role=\"search\"", "type=\"submit\"", "workspace.toolbar.searchSubmit"]) ||
      !includesAll(searchPanel, ["idle", "loading", "success", "error", "workspace.search.progress", "workspace.search.analysisNotice"])) {
    violations.push(violation("J004", "src/components/workspace-toolbar.tsx", toolbar, 0, "Search must have an explicit submit action and visible lifecycle states."));
  }

  const mapClient = project.sources.get("src/features/knowledge-map/components/knowledge-map-client.tsx") ?? "";
  if (!includesAll(readinessView, ["provisional-source-node", "map-readiness-pipeline"]) ||
      !includesAll(mapClient, ["MindMapView", "GalaxyView", "KnowledgeMapReadiness"])) {
    violations.push(violation("J005", "src/features/knowledge-map/components/knowledge-map-client.tsx", mapClient, 0, "A saved source must remain visible while Mind Map and Galaxy become ready."));
  }

  const workspace = project.sources.get("src/components/knowledge-workspace.tsx") ?? "";
  if (!includesAll(controller, ["useState<WorkspaceArea>(\"knowledge\")", "activeStatuses"]) ||
      !includesAll(workspace, ["rememberCapture", "changeArea(\"knowledge\")"])) {
    violations.push(violation("J006", "src/components/knowledge-workspace.tsx", workspace, 0, "After capture, preserve map context and background processing visibility."));
  }

  return violations;
}

function score(violations) {
  const categories = {};
  for (const category of Object.keys(WCJ_STANDARD.categories)) {
    const categoryViolations = violations.filter((item) => item.category === category);
    const deduction = categoryViolations.reduce(
      (total, item) => total + WCJ_STANDARD.scoring.deductions[item.severity],
      0,
    );
    categories[category] = Math.max(0, 100 - deduction);
  }

  const total = Math.round(
    Object.entries(WCJ_STANDARD.categories).reduce(
      (value, [category, definition]) => value + categories[category] * definition.weight,
      0,
    ),
  );
  const hasCritical = violations.some((item) => item.severity === "critical");
  const passed =
    (!WCJ_STANDARD.scoring.criticalGate || !hasCritical) &&
    total >= WCJ_STANDARD.scoring.minimumTotal &&
    Object.values(categories).every((value) => value >= WCJ_STANDARD.scoring.minimumCategory);

  return { categories, hasCritical, passed, total };
}

export async function validateWcj({ root = process.cwd() } = {}) {
  const project = await loadProject(root);
  await Promise.all([
    "src/lib/i18n/messages.ts",
    "src/app/api/processing-jobs/[jobId]/retry/route.ts",
  ].map((file) => project.read(file)));
  const violations = [
    ...scanWeb(project),
    ...scanConsistency(project),
    ...scanJourney(project),
  ].sort((left, right) => left.id.localeCompare(right.id) || left.file.localeCompare(right.file) || left.line - right.line);
  const resultScore = score(violations);
  const failedRuleIds = new Set(violations.map((item) => item.id));

  return {
    standard: {
      name: WCJ_STANDARD.name,
      expandedName: WCJ_STANDARD.expandedName,
      version: WCJ_STANDARD.version,
    },
    generatedAt: new Date().toISOString(),
    root,
    filesScanned: project.files.length,
    rules: {
      passed: WCJ_RULES.filter((rule) => !failedRuleIds.has(rule.id)).map((rule) => rule.id),
      failed: [...failedRuleIds].sort(),
      total: WCJ_RULES.length,
    },
    score: resultScore,
    violations,
    manualReview: [...WCJ_STANDARD.manualReview],
  };
}

export function formatHuman(result) {
  const lines = [
    `WCJ ${result.standard.version} - ${result.score.passed ? "PASS" : "FAIL"}`,
    `Score ${result.score.total}/100 | W ${result.score.categories.W} | C ${result.score.categories.C} | J ${result.score.categories.J}`,
    `Rules ${result.rules.passed.length}/${result.rules.total} | Files ${result.filesScanned}`,
  ];

  if (result.violations.length) {
    lines.push("", "Violations:");
    for (const item of result.violations) {
      lines.push(`- [${item.severity.toUpperCase()}] ${item.id} ${item.file}:${item.line} - ${item.message}`);
    }
  }

  lines.push("", "Manual review remains required:");
  result.manualReview.forEach((item) => lines.push(`- ${item}`));
  return `${lines.join("\n")}\n`;
}
