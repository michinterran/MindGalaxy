# Step 1 Architecture

## Core Data Flow

```txt
Capture Source → AI Processing Job → Nodes / Edges / Contexts → Views / Search / Export
```

The architecture keeps raw user material and AI-generated knowledge separate:

- `captures` and `capture_sources` preserve original text and provenance.
- `nodes` represent atomic AI-created knowledge units.
- `edges` store relationships between nodes.
- `contexts` store topic, time, place, person, organization, project, and tag metadata.
- `processing_jobs` track model, prompt version, confidence, retries, status, and errors.
- `exports` track generated PDF/HTML now and PPT later.

## Recommended Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Zustand or TanStack Query for client/application state
- Supabase Auth
- Supabase Postgres
- pgvector
- Supabase RLS
- OpenAI API
- React Flow for the 2D mindmap
- Three.js / React Three Fiber / Drei for Galaxy View
- PDF/HTML export module
- Vercel deployment

## Build-Safe Runtime Pattern

External clients must not initialize at module scope with required environment variables. Step 1 uses lazy factories:

- `src/lib/supabase/client.ts` returns a browser Supabase client only when public Supabase env vars exist.
- `src/lib/supabase/server.ts` returns a server Supabase client only when public Supabase env vars exist.
- `src/lib/ai/client.ts` returns an OpenAI client only when `OPENAI_API_KEY` exists.

This lets `next build` pass before Supabase/OpenAI projects are provisioned.

## Supabase Security Direction

- Do not expose `service_role` keys to browser code.
- Use only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in public client code.
- Apply RLS from the first database migration.
- Prefer ownership/workspace predicates in RLS policies; authentication alone is not authorization.
- Keep raw source data out of logs and avoid leaking source text into error telemetry.

## View Architecture

List, 2D mindmap, Galaxy View, search, and export should be separate views over the same graph data. The canonical model should not depend on one visual layout. React Flow and Three.js/R3F should consume normalized graph records from the same application/service layer.

## Step 2 Recommendation

Proceed to database schema and API boundaries:

1. Create Supabase migration for `workspaces`, `projects`, `captures`, `capture_sources`, `nodes`, `edges`, `contexts`, `processing_jobs`, `node_revisions`, and `exports`.
2. Enable `pgvector`.
3. Add RLS policies for workspace-owned records.
4. Add capture-create and processing-job-create API routes/server actions.
5. Add a mock-to-real transition path for the current app shell.
