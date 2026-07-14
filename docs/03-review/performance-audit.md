# Performance Audit

## Scope

Reviewed likely MVP performance risks in graph rendering, search, export, worker batching, and client interaction.

## Evidence

- `npm run build` is part of the required final validation gate.
- Graph projection has deterministic unit coverage in `src/features/knowledge-map/model/projection.test.ts`.
- Export renderers have unit coverage for HTML/PDF/PPTX generation.
- Search SQL limits are bounded by `SEARCH_REGISTRY.maxLimit`.

## Current Controls

- Heavy graph renderers are dynamically imported with `ssr: false`.
- Worker batch size, lease time, retry count, and model selection are registry-controlled.
- Search clips query, snippet, evidence, context-result, citation, and answer sizes.
- Export uses deterministic server renderers and rejects empty workspace graphs.

## Risks

- Large workspaces may need pagination/windowing for capture list and graph nodes.
- React Flow and Galaxy views should be profiled with real user graphs before expanding beyond MVP scale.
- PDF/PPTX generation is server-side and should stay behind request limits if exposed to large teams.
- Search embedding calls add network latency and should be monitored separately from SQL latency.

## Recommendations

- Add authenticated Playwright flows with a seeded medium graph.
- Add timing logs around worker claim, OpenAI calls, SQL persist, search RPC, and export render.
- Introduce graph-size thresholds before enabling Galaxy by default for large workspaces.
