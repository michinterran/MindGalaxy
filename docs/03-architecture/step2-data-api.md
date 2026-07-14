# Step 2 Data And API Boundary

Status: Step 2 was implemented locally on 2026-07-14, then extended by later
MVP steps. The original Step 2 SQL remains part of the current migration chain,
but remote migration application is still a deployment gate rather than a
completed repo-side action.

## What Step 2 Adds

- Local Supabase migration draft:
  `supabase/migrations/20260714000100_initial_mindgalaxy_schema.sql`
- Manual TypeScript database shape:
  `src/types/database.ts`
- Capture input validation:
  `src/lib/captures/schema.ts`
- Capture persistence boundary:
  `src/lib/captures/service.ts`
- API routes:
  - `POST /api/captures`
  - `GET /api/captures`
  - `GET /api/processing-jobs`

## Data Model

The schema keeps the product's source-of-truth layers separate:

- `captures`: raw pasted source text and capture metadata.
- `capture_sources`: source/provenance metadata such as provider, URL, author,
  and captured timestamp.
- `nodes`: AI-created knowledge units.
- `edges`: graph relationships between nodes.
- `contexts`: time, place, topic, person, organization, project, and tag
  contexts.
- `processing_jobs`: queued/running/completed/failed AI processing work.
- `node_revisions`: future edit/reprocess audit trail.
- `exports`: export audit metadata for HTML, PDF, and PPTX generation.

The migration includes `extensions.vector(1536)` columns on `captures` and
`nodes`, matching the intended OpenAI `text-embedding-3-small` embedding size.
Approximate vector indexes are documented but not enabled yet; they should be
added after real query volume and retrieval patterns are known.

Cross-workspace references are guarded with composite uniqueness and composite
foreign keys such as `(id, workspace_id)` and `(capture_id, workspace_id)`. This
prevents graph/source/job rows in one workspace from pointing at records in
another workspace.

## RLS Direction

Every public table has RLS enabled. Policies use workspace ownership or
membership checks with `(select auth.uid())`; they do not rely on
`TO authenticated` alone.

Authenticated grants are intentionally narrower than full table mutation grants.
Mutable provenance fields such as `captures.raw_text`, `captures.created_by`,
and `workspace_id` are not included in browser-side update grants.

The first access model is deliberately simple:

- Workspace owners own workspaces.
- `workspace_members` holds `owner`, `editor`, and `viewer` roles.
- Viewers can read workspace records.
- Editors and owners can create/update graph records.
- Owners can delete top-level project/capture records.

Before applying the migration to a real Supabase project, run Supabase advisors
and verify policy behavior with at least two users.

## API Behavior

`POST /api/captures`:

1. Validates input with Zod.
2. Requires Supabase env configuration.
3. Requires an authenticated Supabase user session.
4. Inserts the raw capture.
5. Optionally inserts a capture source.
6. Inserts a queued `processing_jobs` record.

The capture route does not call OpenAI directly. It stores the source and queues
analysis work. It also does not log raw pasted text.

`GET /api/captures` returns capture list metadata without returning `raw_text`.
Source/full-text retrieval should be added through a dedicated detail route with
explicit evidence display.

`GET /api/processing-jobs` lists queued/active/completed processing jobs for a
workspace.

## Environment

The API compiles and the app builds without env vars. Runtime API calls return
`503 SUPABASE_NOT_CONFIGURED` until these are set:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Do not expose a Supabase service-role key to browser code.

## Historical Step 2 Open Items And Current State

- Migration application: still not applied remotely from this repo. Use
  `docs/04-operations/supabase-migration-runbook.md`.
- Supabase generated types: still represented by the maintained manual
  `src/types/database.ts` shape.
- Real Supabase API verification: still a launch gate for the target project.
- AI processing worker: implemented locally at
  `POST /api/worker/analyze-captures` with server-only env requirements.
- Search/RAG endpoint: implemented locally at `POST /api/search` with hybrid
  SQL search and bounded grounded answers.
- Workspace bootstrap: implemented in the auth flow after Step 2.
- Export endpoint: implemented locally at `POST /api/exports` for HTML, PDF,
  and PPTX.

## Current Recommendation

Before production deployment, apply the migration chain in order, run the
verification SQL, configure server-only worker/export/search env vars, then run
authenticated capture, worker, search, and export smoke tests against the real
project.
