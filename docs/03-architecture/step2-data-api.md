# Step 2 Data And API Boundary

Status: implemented locally on 2026-07-14. The SQL migration is a draft and has
not been applied to a Supabase project because the local Supabase CLI is not
installed and no remote project is connected.

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
- `exports`: PDF/HTML now and PPT later.

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

The route does not call OpenAI yet. It also does not log raw pasted text.

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

## Not Yet Done

- Migration has not been applied.
- Supabase generated types have not been pulled.
- API routes have not been tested against a real Supabase project.
- AI processing worker is not implemented.
- Search/RAG endpoints are not implemented.
- Workspace bootstrap flow is not implemented.

## Step 3 Recommendation

Connect a Supabase project, install or configure Supabase tooling, apply the
schema in a branch/local database, run advisors, then implement auth/workspace
bootstrap and make the capture panel call `POST /api/captures`.
