# MindGalaxy Engine Architecture

## Flow

```text
Capture -> Outbox/Job -> Analysis + Embedding -> Canonical Graph -> Mindmap/Galaxy/Search/Export
```

1. Capture stores raw source text first through `POST /api/captures`.
2. The capture transaction creates a queued `processing_jobs` row.
3. The worker route claims jobs with a server-only Supabase client, records attempts, calls OpenAI, creates embeddings, and persists normalized analysis.
4. Persisted nodes, edges, contexts, and capture revisions become the canonical graph.
5. Product surfaces read the canonical graph through dedicated projection and rendering layers.

## Modules

- `src/lib/captures/*`: capture schema, persistence, idempotency, and job creation.
- `src/features/analysis/*`: extraction schema, evidence matching, confidence scoring, worker claim/run/persist flow, and embedding helpers.
- `src/features/knowledge-map/*`: graph snapshot types, workspace graph loading, deterministic projection, 2D mind map, Galaxy beta, inspector, and list view.
- `src/features/search/*`: request/response schema, hybrid SQL row mapping, grounded answer validation, API client, and search panel.
- `src/features/export/*`: one document model rendered to HTML, PDF, and PPTX.
- `src/config/registry.ts`: model, job, search, feature, and SQL-parity constants.

## Algorithms and Boundaries

- Analysis uses a structured OpenAI response schema, then validates node/edge/context counts before persistence.
- Evidence is matched against the original capture so model output stays tied to source text.
- Confidence scoring combines extraction confidence, evidence coverage, and review thresholds from `JOB_REGISTRY`.
- Search combines lexical, semantic, and graph scores in SQL. Duplicated SQL constants are guarded by a machine-readable `SEARCH_REGISTRY_PARITY` marker and a unit test.
- Grounded answers are accepted only when every citation points to a top result and quotes exact snippet/evidence text.
- Export is deterministic: renderers consume a shared GraphSnapshot-derived document, not live UI state.

## Agent and Worker Model

The MVP worker is HTTP-triggered:

- Route: `POST /api/worker/analyze-captures`
- Auth: `Authorization: Bearer $ANALYSIS_WORKER_SECRET`
- Database role: server-only Supabase service role key
- Batch controls: `JOB_REGISTRY.captureStructuring.maxBatchSize`, lease time, max attempts, and retry delay

The route is safe to call from a scheduler later, but the current repo does not include a production scheduler or deployment binding.

## Extension Points

- Add new capture source kinds in `src/types/domain.ts` and i18n labels.
- Add extraction fields by updating the analysis schema, SQL persistence RPC, database types, and graph snapshot model together.
- Add search ranking changes through `SEARCH_REGISTRY` first, then update the SQL parity marker and migration.
- Add export formats by implementing a renderer and registering it in `src/features/export/renderers/registry.ts`.
- Disable demo graph fallback through `FEATURE_REGISTRY.demoGraphFallback`; when false, an empty workspace renders an empty graph instead of sample data.
