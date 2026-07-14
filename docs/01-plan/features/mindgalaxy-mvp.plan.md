# MindGalaxy MVP Plan

Status: approved for Step 1 implementation on 2026-07-14.

## Product Definition

MindGalaxy is a black-first personal AI knowledge repository. The user can paste ChatGPT, Claude, Gemini, or web-document content; the system preserves the original source, uses AI to structure it by time, place, topic, entity, and relation, and later retrieves it through natural-language search with source-grounded evidence.

## MVP Loop

1. Login
2. Quick paste capture
3. Raw source preservation
4. AI processing job
5. Inbox/list review
6. 2D mindmap exploration
7. Galaxy View beta exploration
8. Natural-language search with evidence snippets
9. Basic PDF/HTML export

## Scope Principles

- Build the MVP as a polished web-first Next.js product.
- Preserve source/capture records separately from AI-created nodes, edges, and contexts.
- Use graph data as the product core; tree layouts are views, not the canonical knowledge model.
- Keep Galaxy View as a beta exploration surface, not a complex 3D editor.
- Keep PPT export out of the MVP implementation, but preserve architecture for editable mindmap PPT and AI presentation PPT modes later.
- Prefer Korean-first product labels in the app shell.
- Avoid over-neon visuals. Use a restrained black command-center style with clear source-vs-AI separation.

## Agent Workstreams

- MG-03 Design Agent: black command-center UX, capture/search/mindmap/Galaxy flow, Korean-first labels.
- MG-04 Full-stack Agent: Next.js, Supabase, API, data model, AI processing pipeline.
- MG-05 Visualization Agent: React Flow 2D mindmap and Three/R3F Galaxy View.
- MG-06 QA/Security Agent: RLS, data separation, evidence grounding, mobile, errors, and recovery.

## Step 1 Acceptance Criteria

- Next.js App Router scaffold exists with TypeScript, Tailwind, ESLint, and npm.
- Core dependency set is installed.
- Supabase and OpenAI clients are lazy and build-safe when env vars are absent.
- Initial domain types and graph schema constants exist.
- Default app page is replaced by a polished app-shell mock of the product loop.
- Approved plan and architecture are captured in docs.
- `npm run lint` and `npm run build` pass.
