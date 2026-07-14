# MindGalaxy

MindGalaxy is a web-first MVP for a personal AI knowledge repository. Users paste
AI chats or web-document text, MindGalaxy preserves the raw source first, then
structures it into graph records for inbox review, 2D mindmap exploration,
Galaxy beta browsing, grounded search, and export.

## Step 1 Status

- Next.js App Router scaffold with TypeScript, Tailwind CSS, ESLint, and npm.
- Build-safe lazy helpers for Supabase browser/server clients and OpenAI.
- Initial domain types for captures, sources, nodes, edges, contexts, jobs,
  revisions, and exports.
- Static black-first app shell that shows quick capture, inbox/list, 2D map,
  Galaxy beta, search/source detail, and export readiness.
- Planning and architecture docs are under `docs/`.

## Step 2 Status

- Local Supabase migration draft added under `supabase/migrations/`.
- Initial RLS policies drafted for workspace-owned data.
- Manual database TypeScript shape added in `src/types/database.ts`.
- Capture validation and persistence boundary added.
- API route boundaries added for captures and processing jobs.
- No remote Supabase project has been modified yet.

## Step 3 Status

- Google OAuth and email magic-link entry points added.
- Supabase `/auth/callback` route exchanges OAuth codes for session cookies.
- First login automatically bootstraps a personal `MindGalaxy` workspace and
  `owner` membership.
- Quick Capture panel now posts to `POST /api/captures` when logged in.
- Auth secrets remain in Supabase Dashboard; only publishable Supabase env vars
  are stored locally.

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Environment

The app builds without environment variables. Real Supabase/OpenAI features will
activate only when these are present:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
OPENAI_API_KEY=
```

Do not use or expose a Supabase service-role key in browser code.

## Architecture Docs

- `docs/01-plan/features/mindgalaxy-mvp.plan.md`
- `docs/03-architecture/step1-architecture.md`
- `docs/03-architecture/step2-data-api.md`
- `docs/03-architecture/step3-auth-workspace.md`

## Verification

```bash
npm run lint
npm run build
```

## Next Step

Step 4 should implement the AI processing worker: take queued captures, call the
OpenAI structured extraction prompt, create nodes/edges/contexts, and surface
processing status in the app shell.
