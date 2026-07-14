# Architecture Review

## Scope

Reviewed whether the MVP architecture supports the intended flow:

`Capture -> Outbox/Job -> Analysis + Embedding -> Canonical Graph -> Mindmap/Galaxy/Search/Export`.

## Strengths

- Capture stores raw source text first and keeps AI processing asynchronous.
- Worker logic is separated from browser/session code and requires server-only secrets.
- Canonical graph state is loaded once and projected into UI-specific shapes.
- Search and export read from structured graph/capture data instead of scraping UI state.
- Feature toggles and model/job/search constants are centralized in `src/config/registry.ts`.

## Boundary Checks

- Browser-safe Supabase access uses publishable env vars.
- Service-role Supabase access is isolated in `src/lib/supabase/service-role.ts`.
- Worker calls require `ANALYSIS_WORKER_SECRET`.
- `FEATURE_REGISTRY.demoGraphFallback` now controls whether an empty workspace shows demo data or a true empty graph.

## Extension Guidance

- New AI extraction fields should update SQL, `src/types/database.ts`, analysis schemas, graph snapshot types, and renderer tests together.
- Ranking changes should start in `SEARCH_REGISTRY`, then update the SQL marker and migration.
- New export formats should reuse the existing document model and add renderer-specific tests.

## Remaining Risks

- Remote migration apply order is documented but not verified against a live project.
- Production scheduling for the analysis worker is not yet configured.
- Authenticated deployed smoke tests remain required before production claims.
