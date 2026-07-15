# MindGalaxy

MindGalaxy is a web-first MVP for a personal AI knowledge repository. Users paste AI chats, web text, or meeting notes; MindGalaxy preserves the raw source first, then structures it into graph records for inbox review, 2D mind-map exploration, Galaxy beta browsing, grounded search, and export.

## Current MVP State

- Step 1: Next.js 16 App Router scaffold, TypeScript, Tailwind CSS, ESLint, black-first app shell, initial domain model, and planning docs.
- Step 2: local Supabase schema/RLS migration drafts, workspace-owned data model, capture validation/persistence boundary, and typed database shape.
- Step 3: Google/email auth entry points, Supabase callback, automatic personal workspace bootstrap, and logged-in quick capture.
- Step 4: durable Vercel Queue capture-analysis delivery, OpenAI structured extraction prompt, embedding creation, job attempts, stalled-lease recovery, and canonical node/edge/context persistence.
- Step 5: workspace graph loader, projection model, React Flow mind map, Galaxy beta view, inspector, and list view.
- Step 6: deterministic export engine for HTML, PDF, and PPTX using one GraphSnapshot document model; sample QA artifacts are local-only under `/output/`.

Remote Supabase migrations are still unapplied from this repo. Treat the SQL files as reviewed migration drafts until the runbook is executed against the intended project.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

The app builds without environment variables. Real Supabase/OpenAI features activate only when the relevant server or browser variables are present.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
OPENAI_API_KEY=

# Server-only. Never expose in browser code or NEXT_PUBLIC_* variables.
SUPABASE_SERVICE_ROLE_KEY=
ANALYSIS_WORKER_SECRET=
```

`SUPABASE_SERVICE_ROLE_KEY` is used only by server-only worker code. `ANALYSIS_WORKER_SECRET` protects `POST /api/worker/analyze-captures`.

## Runtime Surfaces

- Capture: `POST /api/captures` stores raw source text and queues analysis.
- Queue consumer: `POST /api/queues/analyze-capture` is a Vercel-internal private push consumer configured by `vercel.json`; each message claims only its correlated processing job.
- Worker: `POST /api/worker/analyze-captures` claims queued jobs, calls OpenAI, embeds content, and persists graph data through SQL RPCs.
- Search: `POST /api/search` embeds the query, calls the hybrid SQL RPC, localizes blank capture titles, and generates bounded grounded answers.
- Export: `POST /api/exports` renders the current workspace graph to HTML, PDF, or PPTX.

## Architecture and Operations

- `docs/01-plan/features/mindgalaxy-mvp.plan.md`
- `docs/03-architecture/step1-architecture.md`
- `docs/03-architecture/step2-data-api.md`
- `docs/03-architecture/step3-auth-workspace.md`
- `docs/03-architecture/engine-architecture.md`
- `docs/04-operations/supabase-migration-runbook.md`
- `docs/03-review/review-summary.md`

## Verification

WCJ (Web Compliance & Journey) is the central web-page quality gate. It checks
MindGalaxy's semantic HTML and accessibility contracts, design/i18n/Korean
typography consistency, and the capture-to-map product journey. Its normative
basis and release thresholds are defined in
[`docs/03-review/wcj-web-compliance-journey-standard.md`](docs/03-review/wcj-web-compliance-journey-standard.md).

```bash
npm run validate:wcj       # Fast WCJ gate with a human-readable report
npm run validate:wcj:json  # CI/dashboard artifact output
npm run verify             # Lint + types + tests + WCJ + production build
git diff --check && git diff --cached --check # Unstaged + staged whitespace
```

`npm run typecheck` removes stale `.next` output, regenerates the current Next.js
route types with `next typegen`, and then runs TypeScript. This keeps repeated local
and CI verification deterministic without excluding framework-generated route types.

WCJ supplements browser and assistive-technology testing; a 100 score is not a
claim of complete WCAG conformance. Production promotion still requires the
manual keyboard, screen-reader, contrast, responsive Korean typography,
capture-to-map queue, and reduced-motion/WebGL checks printed by the validator.

## Vercel Queue Setup

Production uses Vercel OIDC automatically; no Queue API token needs to be added to the deployed project. Deploy the static `vercel.json` with the app so Vercel can create the private `capture-analysis` v2 push trigger. The static file intentionally follows the minimal schema in the official Queue documentation so Git and CLI deployments use the same validator-compatible configuration.

For local Queue delivery, use the linked project credentials:

```bash
vercel link
vercel env pull
vercel dev
```

Without local Vercel credentials, capture creation falls back to one best-effort Next.js `after()` analysis run. The bearer-protected manual worker remains available for operational recovery.

CI runs `npm ci`, tests, lint, clean Next.js route type generation and typecheck,
the mandatory WCJ gate, a whitespace check over the actual pull-request or push
commit range, and the production build.
`npm audit --audit-level=moderate` is reported
non-blocking in CI; the current local audit is documented in the Phase 8 review
summary and should not be fixed with force downgrades.
