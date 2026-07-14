# Security Audit

## Scope

Reviewed auth, env boundaries, worker access, search/export APIs, local artifacts, and dependency risk.

## Evidence

- Service-role Supabase client lives in `server-only` code.
- Worker route requires `ANALYSIS_WORKER_SECRET`.
- `.gitignore` excludes `/output/` and `/.playwright-cli/`.
- `npm audit --audit-level=moderate` currently reports 2 moderate findings in Next's bundled PostCSS.

## Controls

- Browser code receives only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and is not documented as a public env var.
- Search and export require authenticated server sessions.
- Grounded search validates citations against exact source snippets/evidence.
- Error boundary copy avoids exposing internal exception details to users.

## Risks

- Remote Supabase RLS and RPC behavior still need live verification after migrations are applied.
- Dependency audit remains non-zero because the available automated fix would force a breaking Next downgrade.
- Secret scanning in this pass is regex-based and does not replace repository-level secret scanning.

## Recommendations

- Add a deployed authenticated smoke test covering capture, worker, search, and export.
- Enable repository secret scanning and branch protection in GitHub.
- Re-check the PostCSS advisory after Next publishes a non-breaking patched release.
