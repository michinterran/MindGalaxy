export const WCJ_STANDARD = Object.freeze({
  name: "WCJ",
  expandedName: "Web Compliance & Journey",
  version: "1.0.0",
  target: "MindGalaxy web application",
  standards: Object.freeze([
    Object.freeze({
      name: "WHATWG HTML Living Standard",
      url: "https://html.spec.whatwg.org/multipage/",
    }),
    Object.freeze({
      name: "W3C WCAG 2.2 Level AA",
      url: "https://www.w3.org/TR/WCAG22/",
    }),
    Object.freeze({
      name: "WAI-ARIA Authoring Practices Guide",
      url: "https://www.w3.org/WAI/ARIA/apg/",
    }),
    Object.freeze({
      name: "W3C Internationalization line-breaking guidance",
      url: "https://www.w3.org/International/articles/typography/linebreak",
    }),
  ]),
  categories: Object.freeze({
    W: Object.freeze({
      label: "Web compliance",
      weight: 0.4,
      description: "Semantic HTML, accessibility, focus, and client HTML security.",
    }),
    C: Object.freeze({
      label: "Consistency",
      weight: 0.3,
      description: "Design tokens, i18n, Korean typography, and control consistency.",
    }),
    J: Object.freeze({
      label: "Journey",
      weight: 0.3,
      description: "Durable async, loading/empty/error/success, retry, search, and map identity.",
    }),
  }),
  scoring: Object.freeze({
    deductions: Object.freeze({ critical: 35, major: 12, minor: 4 }),
    minimumTotal: 90,
    minimumCategory: 80,
    criticalGate: true,
  }),
  sourceRoots: Object.freeze(["src"]),
  extensions: Object.freeze([".ts", ".tsx", ".css"]),
  exclusions: Object.freeze([
    ".test.ts",
    ".test.tsx",
    ".spec.ts",
    ".spec.tsx",
  ]),
  allowlists: Object.freeze({
    // Three.js and React Flow renderers need runtime color values rather than
    // CSS custom properties. This is an implementation constraint, not a
    // general exemption for page/component styling.
    rendererColorFiles: Object.freeze([
      "src/features/knowledge-map/components/galaxy-view.tsx",
      "src/features/knowledge-map/components/mind-map-view.tsx",
    ]),
    // Raw color values are allowed only where the shared CSS palette is
    // declared. Application selectors must consume those values through
    // custom properties (or a derivation such as color-mix()).
    cssTokenDefinitionSelectors: Object.freeze([":root"]),
  }),
  manualReview: Object.freeze([
    "Keyboard-only journey: sign-in, capture, retry, search, map, and export.",
    "Screen-reader announcements after route changes and async analysis transitions.",
    "Computed contrast at 200% zoom in default, hover, focus, disabled, and error states.",
    "Responsive layout and Korean line breaks at 320, 768, 1280, and 1920 CSS pixels.",
    "Production capture-to-map timing, queue redelivery, and stale-job recovery.",
    "Mind map and Galaxy alternatives when motion is reduced or WebGL is unavailable.",
  ]),
});

export const WCJ_RULES = Object.freeze([
  { id: "W001", category: "W", severity: "critical", title: "Document language" },
  { id: "W002", category: "W", severity: "critical", title: "Named form controls" },
  { id: "W003", category: "W", severity: "major", title: "Explicit button behavior" },
  { id: "W004", category: "W", severity: "critical", title: "Native interactive semantics" },
  { id: "W005", category: "W", severity: "major", title: "Embedded content alternatives" },
  { id: "W006", category: "W", severity: "critical", title: "Dialog name and modality" },
  { id: "W007", category: "W", severity: "critical", title: "Unsafe HTML and public secrets" },
  { id: "W008", category: "W", severity: "major", title: "Focus and reduced motion" },
  { id: "C001", category: "C", severity: "critical", title: "i18n dictionary contract" },
  { id: "C002", category: "C", severity: "major", title: "No component copy hardcoding" },
  { id: "C003", category: "C", severity: "major", title: "Korean line-break contract" },
  { id: "C004", category: "C", severity: "major", title: "Semantic headline contract" },
  { id: "C005", category: "C", severity: "major", title: "Design-token boundary" },
  { id: "J001", category: "J", severity: "critical", title: "Knowledge-map state model" },
  { id: "J002", category: "J", severity: "critical", title: "Recoverable analysis journey" },
  { id: "J003", category: "J", severity: "major", title: "Async status communication" },
  { id: "J004", category: "J", severity: "critical", title: "Explicit search journey" },
  { id: "J005", category: "J", severity: "critical", title: "Mind-map identity continuity" },
  { id: "J006", category: "J", severity: "major", title: "Capture-to-map continuity" },
]);
