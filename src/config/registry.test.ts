import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  JOB_SQL_PARITY_MARKER,
  SEARCH_SQL_PARITY_MARKER,
} from "@/config/registry";

describe("JOB_REGISTRY SQL parity", () => {
  it("keeps the manual retry ceiling in sync with the lifecycle migration", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260714125606_library_capture_lifecycle.sql",
      ),
      "utf8",
    );
    const marker = sql.match(/JOB_REGISTRY_PARITY:\s*(\{.*\})/);

    expect(marker?.[1]).toBeDefined();
    expect(JSON.parse(marker?.[1] ?? "{}")).toEqual(JOB_SQL_PARITY_MARKER);
    expect(sql).toContain("if v_job.retry_count >= 10 then");
  });
});

describe("SEARCH_REGISTRY SQL parity", () => {
  it("keeps the hybrid-search migration marker in sync", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260714061838_hybrid_grounded_search.sql"),
      "utf8",
    );
    const marker = sql.match(/SEARCH_REGISTRY_PARITY:\s*(\{.*\})/);

    expect(marker?.[1]).toBeDefined();
    expect(JSON.parse(marker?.[1] ?? "{}")).toEqual(SEARCH_SQL_PARITY_MARKER);
    expect(sql).not.toContain("Untitled capture");
  });
});
