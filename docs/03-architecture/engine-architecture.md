# MindGalaxy Engine Architecture

## Flow

```text
Capture -> Outbox/Job -> Analysis + Embedding -> Canonical Graph -> Mindmap/Galaxy/Search/Export
```

1. Capture stores raw source text first through `POST /api/captures`.
2. The capture transaction creates a queued `processing_jobs` row.
3. The capture API publishes a durable `capture.created` message to Vercel Queues. A private push consumer claims the database job with a server-only Supabase client, records attempts, calls OpenAI, creates embeddings, and persists normalized analysis.
4. Persisted nodes, edges, contexts, and capture revisions become the canonical graph.
5. Product surfaces read the canonical graph through dedicated projection and rendering layers.

## Modules

- `src/lib/captures/*`: capture schema, persistence, idempotency, and job creation.
- `src/features/analysis/*`: extraction schema, evidence matching, confidence scoring, worker claim/run/persist flow, and embedding helpers.
- `src/features/analysis/queue/*`: versioned queue contract, idempotent producer, private push consumer, and bounded retry policy.
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

Production analysis is queue-triggered:

- Topic: `capture-analysis`
- Producer: `POST /api/captures` publishes a versioned `capture.created` event after the database transaction commits.
- Consumer: `POST /api/queues/analyze-capture` is private and can only be invoked by Vercel's Queue infrastructure. Every delivery claims only its own `processingJobId` through `claim_capture_analysis_job_by_id`; it never substitutes another queued job.
- Delivery: at-least-once with an idempotency key based on the processing job ID.
- Retry: delivery backoff grows from 60 seconds up to a 300-second cap. Correlated jobs acknowledge immediately only after a terminal database result; malformed uncorrelated messages acknowledge at the 10-delivery transport ceiling.
- Recovery: the SQL claim RPC reclaims `running` jobs after their lease expires. Queue redelivery supplies the durable wake-up signal.
- Redelivery: a no-claim result is acknowledged only after the correlated job is `completed`, `needs_review`, or terminally `failed`. Queued, delayed, or actively running jobs are retried.
- Retry budgets: Queue transport deliveries have a larger budget than database analysis attempts. This preserves retries for OIDC, network, initialization, and claim failures that occur before an OpenAI/database attempt is recorded. Exhausting the non-terminal transport budget emits an operator-recovery structured error event.
- Manual retry: the lifecycle RPC requeues the same job and publishes a retry-specific idempotency key. Only Queue publication failure uses the job-id-specific `after()` fallback.
- Observability: structured JSON logs expose dispatch, claim, extract, embed, persist, retry, completion, duration, and bounded error codes without raw source text.

The manual HTTP worker remains available for operations:

- Route: `POST /api/worker/analyze-captures`
- Auth: `Authorization: Bearer $ANALYSIS_WORKER_SECRET`
- Database role: server-only Supabase service role key
- Batch controls: `JOB_REGISTRY.captureStructuring.maxBatchSize`, lease time, max attempts, and retry delay

If Queue publishing is unavailable (including an unlinked local environment), the capture request registers one best-effort Next.js `after()` run. Production reliability depends on the Queue trigger in `vercel.ts`; the fallback is not a replacement for durable delivery.

## Extension Points

- Add new capture source kinds in `src/types/domain.ts` and i18n labels.
- Add extraction fields by updating the analysis schema, SQL persistence RPC, database types, and graph snapshot model together.
- Add search ranking changes through `SEARCH_REGISTRY` first, then update the SQL parity marker and migration.
- Add export formats by implementing a renderer and registering it in `src/features/export/renderers/registry.ts`.
- Disable demo graph fallback through `FEATURE_REGISTRY.demoGraphFallback`; when false, an empty workspace renders an empty graph instead of sample data.
