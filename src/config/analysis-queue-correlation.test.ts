import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

describe("durable analysis queue correlation", () => {
  it("claims the processing job by its queue-correlated identifier", () => {
    const migration = readFileSync(
      join(
        projectRoot,
        "supabase/migrations/20260715033000_claim_capture_analysis_job_by_id.sql",
      ),
      "utf8",
    );

    expect(migration).toContain(
      "function public.claim_capture_analysis_job_by_id",
    );
    expect(migration).toContain("where pj.id = p_job_id");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain(
      "pj.retry_count < least(pj.max_attempts, p_max_attempts)",
    );
    expect(migration).toContain("pj.lease_expires_at < now()");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("publishes manual retries and uses only a job-correlated fallback", () => {
    const route = readFileSync(
      join(
        projectRoot,
        "src/app/api/processing-jobs/[jobId]/retry/route.ts",
      ),
      "utf8",
    );

    expect(route).toContain("dispatchCaptureAnalysis");
    expect(route).toContain("result.processingJob.id");
    expect(route).toContain("runCaptureAnalysisJob(result.processingJob.id");
    expect(route).not.toContain("runCaptureAnalysisBatch");
    expect(route).toContain('dispatch.transport === "fallback"');
  });
});
