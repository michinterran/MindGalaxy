# WCJ Web Compliance & Journey Standard

## 1. Purpose

WCJ is MindGalaxy's repository-level quality gate for web pages and critical product journeys. It prevents a page from being treated as complete when the HTML compiles but semantics, Korean typography, recovery states, or the capture-to-map journey are missing.

WCJ supplements ESLint, TypeScript, Vitest, production builds, browser testing, and human review. It does not claim browser-rendered WCAG conformance by static analysis alone.

## 2. Normative basis

- [WHATWG HTML Living Standard](https://html.spec.whatwg.org/multipage/): document language, semantic elements, interactive content, forms, embedded content, and safe authoring.
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/), target Level AA: perceivable, operable, understandable, and robust interfaces.
- [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/): named dialogs, keyboard behavior, focus management, and widget state.
- [W3C Internationalization line-breaking guidance](https://www.w3.org/International/articles/typography/linebreak): language-aware line breaking.
- MindGalaxy contracts: centralized i18n, design tokens, semantic Korean headline breaks, and `Copy -> Capture -> Structure -> Connect`.

## 3. The three gates

### W — Web compliance (40%)

- The root document exposes the active language.
- Forms and dialogs have programmatic names.
- Buttons declare behavior. A non-interactive element with click behavior must
  either become a native control or provide an interactive role, `tabIndex=0`,
  and keyboard handling.
- Images, iframes, and new-tab links have required alternatives or protections.
- Application UI does not inject arbitrary HTML or expose secret-like environment variables publicly.
- Focus visibility and reduced-motion behavior are present.

### C — Consistency (30%)

- Korean and English dictionaries preserve key parity.
- User-facing Korean strings are not embedded directly in components.
- Korean editorial headlines use approved semantic line groups; body copy uses language-aware wrapping; controls do not wrap.
- Page/component colors use shared design tokens. Raw CSS hex/rgb/hsl values are
  accepted only inside the `:root` palette declaration; normal selectors consume
  variables or token-derived `color-mix()` values. Renderer-specific runtime
  colors are narrowly documented in `scripts/wcj/config.mjs`.

### J — Journey (30%)

- Knowledge Map distinguishes: no capture, queued, running, review required, failed, completed without nodes, and ready.
- Failed analysis has a real retry endpoint and a visible retry action.
- Long-running analysis is polled and announced to assistive technology.
- Search has an explicit submit action plus idle/loading/success/error and partial-index states.
- A saved source remains visible as a provisional map node while AI structure is being built.
- The first capture returns to the map journey instead of terminating in a generic list.

## 4. Score and release gate

Each category begins at 100.

| Severity | Deduction | Meaning |
| --- | ---: | --- |
| Critical | 35 | Blocks semantics, accessibility, security, or the core product journey |
| Major | 12 | Substantial consistency or recovery defect |
| Minor | 4 | Bounded issue that does not break the core journey |

A build passes WCJ only when all conditions are true:

1. No critical violation exists.
2. Weighted total is at least 90.
3. W, C, and J are each at least 80.

Adding a baseline suppression file is intentionally unsupported. A technical exception must be narrow, explained in `scripts/wcj/config.mjs`, and limited to an implementation constraint rather than an existing defect.

## 5. Commands and output

```bash
npm run validate:wcj
npm run validate:wcj:json
npm run verify
```

- Human output shows pass/fail, total and category scores, failed locations, and remaining manual checks.
- JSON output is intended for CI artifacts and dashboards. Use `node scripts/wcj/cli.mjs --format json > wcj-report.json` when stdout must contain JSON only; npm prints its own script banner unless run in silent mode.
- Exit `0` means pass, `1` means a WCJ gate failure, and `2` means validator/configuration failure.

### JSON report contract

The JSON report has these stable top-level fields:

- `standard`: `{ name, expandedName, version }`
- `generatedAt`: ISO-8601 timestamp
- `root`: absolute directory that was scanned
- `filesScanned`: number of inspected source files
- `rules`: `{ passed, failed, total }`, where `passed` and `failed` contain rule IDs
- `score`: `{ categories: { W, C, J }, hasCritical, passed, total }`
- `violations`: array of
  `{ id, category, severity, title, file, line, message, evidence }`
- `manualReview`: array of manual checks that remain required

The automated tests assert this contract and the documented CLI exit codes.
Adding, renaming, or removing a listed report field requires a version change.

The GitHub Actions workflow runs `npm run validate:wcj` as an explicit required
step. It checks whitespace over the actual pull request (`base` to `head`) or push
(`before` to `head`) range; an initial branch push is compared with Git's empty
tree. Local `npm run verify` runs lint, type checking, tests, WCJ, and a production
build. Git diff checks remain separate so the npm verification command also works
in source archives that do not contain `.git` metadata.

## 6. Mandatory manual review

Static checks cannot prove visual or behavioral conformance. Before production promotion, reviewers must verify:

- Keyboard-only sign-in, capture, retry, search, map, and export.
- Screen-reader announcements after route and async-state changes.
- Computed contrast for default, hover, focus, disabled, and error states.
- Korean wrapping and responsive layout at 320, 768, 1280, and 1920 CSS pixels.
- Real capture-to-map latency, queue redelivery, and stale-job recovery.
- Reduced-motion and no-WebGL alternatives for Mind Map and Galaxy.

The manual checklist remains visible even when the automated score is 100.
