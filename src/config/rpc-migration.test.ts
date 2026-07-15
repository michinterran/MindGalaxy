import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260715001037_harden_rpc_column_qualification.sql",
);
const sql = readFileSync(migrationPath, "utf8");
const mapMigrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260715002343_replace_analysis_temp_maps.sql",
  ),
  "utf8",
);

function functionBody(name: string) {
  const match = sql.match(
    new RegExp(
      `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
    ),
  );

  expect(match?.[0], `${name} must be present in the hardening migration`).toBeDefined();
  return match?.[0] ?? "";
}

describe("RPC column-qualification migration", () => {
  it("replaces each affected RPC exactly once and preserves security boundaries", () => {
    const names = [
      "create_capture_command",
      "claim_capture_analysis_job",
      "persist_capture_analysis_result",
      "fail_capture_analysis_job",
    ];

    for (const name of names) {
      expect(
        sql.match(new RegExp(`create or replace function public\\.${name}`, "g")),
      ).toHaveLength(1);
      expect(functionBody(name)).toContain("security definer\nset search_path = ''");
    }
  });

  it("uses named constraints and qualified job relations at ambiguity boundaries", () => {
    const createCapture = functionBody("create_capture_command");
    const claimJob = functionBody("claim_capture_analysis_job");
    const persistResult = functionBody("persist_capture_analysis_result");
    const failJob = functionBody("fail_capture_analysis_job");

    expect(createCapture).toContain(
      "on conflict on constraint captures_workspace_idempotency_key_key",
    );
    expect(createCapture).not.toContain("on conflict (workspace_id, idempotency_key)");
    expect(createCapture).toContain(`insert into public.processing_jobs as processing_job_row (
      workspace_id,
      capture_id,
      status,
      job_type,
      model,
      prompt_version,
      retry_count,
      metadata
    )
    values (
      p_workspace_id,
      v_capture.id,
      'queued',
      'capture_structure',
      null,
      null,
      0,
      jsonb_build_object(`);
    expect(createCapture).not.toContain(
      "'queued',\n      'capture_structure',\n      'capture_structure',",
    );

    expect(claimJob).toContain("update public.job_attempts as attempt_row");
    expect(claimJob).toContain("where attempt_row.job_id = v_candidate_id");
    expect(claimJob).toContain(
      "pj.retry_count < least(pj.max_attempts, p_max_attempts)",
    );
    expect(claimJob).not.toContain("max_attempts = greatest");

    for (const body of [persistResult, failJob]) {
      expect(body).toContain("from public.processing_jobs as processing_job_row");
      expect(body).toContain("from public.job_attempts as attempt_row");
      expect(body).toContain("attempt_row.job_id = p_job_id");
      expect(body).not.toMatch(/from public\.job_attempts\s+where/);
    }
  });

  it("keeps browser and worker execution grants separated", () => {
    expect(sql).toContain(
      ") to authenticated;\n\nrevoke all on function public.claim_capture_analysis_job",
    );
    expect(sql).toContain(
      "grant execute on function public.claim_capture_analysis_job(text, integer, text, text, integer)\n  to service_role;",
    );
    expect(sql).toContain(
      "grant execute on function public.persist_capture_analysis_result(",
    );
    expect(sql).toContain(
      "grant execute on function public.fail_capture_analysis_job(",
    );
  });
});

function mapMigrationFunctionBody(name: string) {
  const match = mapMigrationSql.match(
    new RegExp(
      `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
    ),
  );

  expect(match?.[0], `${name} must be present in the map migration`).toBeDefined();
  return match?.[0] ?? "";
}

describe("analysis JSONB map migration", () => {
  it("removes temporary relations and preserves duplicate/reference validation", () => {
    const persistResult = mapMigrationFunctionBody(
      "persist_capture_analysis_result",
    );

    expect(mapMigrationSql).not.toContain("pg_temp");
    expect(persistResult).not.toContain("create temp table");
    expect(persistResult).not.toContain("truncate table");
    expect(persistResult).toContain("v_context_map jsonb := '{}'::jsonb");
    expect(persistResult).toContain("v_node_map jsonb := '{}'::jsonb");
    expect(persistResult).toContain("v_context_map ? v_context_client_id");
    expect(persistResult).toContain("CONTEXT_CLIENT_ID_DUPLICATE");
    expect(persistResult).toContain(
      "v_node_map ? (v_node->>'clientNodeId')",
    );
    expect(persistResult).toContain("NODE_CLIENT_ID_DUPLICATE");
    expect(persistResult).toContain(
      "if not (v_context_map ? v_context_client_id) then",
    );
    expect(persistResult).toContain(
      "(v_context_map ->> context_ref.client_id)::uuid",
    );
    expect(persistResult).toContain(
      "if not (v_node_map ? (v_edge->>'sourceClientNodeId'))",
    );
    expect(persistResult).toContain(
      "(v_node_map ->> (v_edge->>'sourceClientNodeId'))::uuid",
    );
  });

  it("casts every processing status CASE branch explicitly", () => {
    const persistResult = mapMigrationFunctionBody(
      "persist_capture_analysis_result",
    );
    const failJob = mapMigrationFunctionBody("fail_capture_analysis_job");

    expect(persistResult).toContain(
      "then 'needs_review'::public.processing_status",
    );
    expect(persistResult).toContain(
      "else 'completed'::public.processing_status",
    );
    expect(failJob).toContain("then 'failed'::public.processing_status");
    expect(failJob).toContain("else 'queued'::public.processing_status");
    expect(`${persistResult}\n${failJob}`).not.toMatch(
      /(?:then|else) '(?:needs_review|completed|failed|queued)'(?:\s|$)(?!::)/,
    );
  });
});
