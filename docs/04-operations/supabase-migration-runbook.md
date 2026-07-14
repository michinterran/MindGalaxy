# Supabase Migration Runbook

This runbook is for applying the current local migration drafts to the intended Supabase project. Do not run it against production without an explicit deployment gate.

## Apply Order

Apply the SQL files in this exact order:

1. `supabase/migrations/20260714000100_initial_mindgalaxy_schema.sql`
2. `supabase/migrations/20260714000200_fix_workspace_rls_recursion.sql`
3. `supabase/migrations/20260714053051_data_integrity_job_boundaries.sql`
4. `supabase/migrations/20260714055018_analysis_engine_worker_boundaries.sql`
5. `supabase/migrations/20260714061838_hybrid_grounded_search.sql`

## SQL Editor Procedure

1. Open the Supabase Dashboard for the target project.
2. Go to SQL Editor.
3. Create a new query for one migration file at a time.
4. Paste the full file contents.
5. Run it and confirm success before moving to the next file.
6. Save the query with the migration filename for auditability.

Do not combine all migrations into one query during the first remote apply. Running one file at a time makes failures and rollback decisions easier to isolate.

## Verification SQL

Run these checks after all five migrations succeed:

```sql
select to_regclass('public.workspaces') as workspaces_table;
select to_regclass('public.captures') as captures_table;
select to_regclass('public.nodes') as nodes_table;
select to_regprocedure('public.claim_capture_analysis_job(text, integer, text, text, integer)') as claim_jobs_rpc;
select to_regprocedure('public.persist_capture_analysis_result(uuid, uuid, text, jsonb, text, text, numeric, boolean, jsonb)') as persist_rpc;
select to_regprocedure('public.search_workspace_knowledge(uuid, text, extensions.vector, integer)') as search_rpc;
```

Optional policy visibility check:

```sql
select schemaname, tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('workspaces', 'workspace_members', 'captures', 'processing_jobs', 'nodes', 'edges', 'contexts')
order by tablename, policyname;
```

## Worker Call Smoke

After environment variables are set in the server runtime:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `ANALYSIS_WORKER_SECRET`

Call the worker with a server-side request only:

```bash
curl -X POST "$APP_URL/api/worker/analyze-captures" \
  -H "Authorization: Bearer $ANALYSIS_WORKER_SECRET"
```

Expected safe outcomes:

- `200` with processed or empty batch information when configured.
- `401` if the bearer secret is missing or wrong.
- `503 WORKER_NOT_CONFIGURED` if OpenAI, Supabase service role, or worker secret envs are missing.

## Rollback and Warnings

- These migrations create or replace functions and add schema objects. Prepare a database backup or point-in-time recovery plan before production apply.
- Do not manually delete tables as rollback. Prefer restoring from backup or applying a reviewed reverse migration.
- The service role key must never be exposed to browser code, local screenshots, logs, or `NEXT_PUBLIC_*` env names.
- The search migration contains ranking constants duplicated at the SQL boundary. If `SEARCH_REGISTRY` changes, update the SQL marker and tests before applying a new migration.

## Production Deploy Gate

Production deploy requires all of the following:

- migrations applied and verification SQL reviewed;
- env vars configured in the deployment target;
- worker route smoke-tested with the bearer secret;
- authenticated capture, worker, search, and export smoke tests completed on the deployed URL;
- `npm test -- --run`, `npm run lint`, `npm run build`, and `git diff --check` passing on the exact source being deployed.
