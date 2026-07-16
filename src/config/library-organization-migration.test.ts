import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260716054531_library_organization_foundation.sql",
  ),
  "utf8",
);
const atomicSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260716073000_atomic_capture_organization.sql",
  ),
  "utf8",
);
const contextHardeningSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260716074840_harden_manual_topic_context_permissions.sql",
  ),
  "utf8",
);

describe("library organization migration", () => {
  it("preserves captures when a folder is deleted", () => {
    const captureFolderConstraint = sql.match(
      /constraint captures_folder_workspace_fk[\s\S]*?on delete set null \(folder_id\);/,
    )?.[0];

    expect(captureFolderConstraint).toBeDefined();
    expect(captureFolderConstraint).not.toContain("on delete cascade");
  });

  it("keeps manual topic creation inside actor RLS without a definer RPC", () => {
    expect(sql).toContain('create policy "Client context inserts are manual topics"');
    expect(sql).toContain("on public.contexts as restrictive");
    expect(sql).toContain("kind = 'topic'");
    expect(sql).not.toContain("security definer");
  });

  it("applies folder and topic changes inside one restricted database function", () => {
    expect(atomicSql).toContain("create or replace function public.update_capture_organization");
    expect(atomicSql).toContain("security definer");
    expect(atomicSql).toContain("update public.captures");
    expect(atomicSql).toContain("delete from public.capture_topics");
    expect(atomicSql).toContain("insert into public.capture_topics");
    expect(atomicSql).toContain("from public, anon, authenticated");
    expect(atomicSql).toContain("to service_role");
  });

  it("keeps AI contexts immutable while allowing manual topic inserts", () => {
    expect(contextHardeningSql).toContain(
      'drop policy if exists "Editors can manage contexts" on public.contexts',
    );
    expect(contextHardeningSql).toContain(
      'drop policy if exists "Client context inserts are manual topics" on public.contexts',
    );
    expect(contextHardeningSql).toContain(
      'drop policy if exists "Editors can create manual topic contexts" on public.contexts',
    );
    expect(contextHardeningSql).toContain(
      "revoke insert, update, delete on public.contexts from authenticated",
    );
    expect(contextHardeningSql).toMatch(
      /revoke update \([\s\S]*?kind,[\s\S]*?label,[\s\S]*?normalized_value,[\s\S]*?metadata[\s\S]*?\) on public\.contexts from authenticated;/,
    );
    expect(contextHardeningSql).toContain(
      'create policy "Editors can create manual topic contexts"',
    );
    expect(contextHardeningSql).toContain("kind = 'topic'");
    expect(contextHardeningSql).toContain("metadata ->> 'source' = 'manual'");
    expect(contextHardeningSql).toContain("array['owner', 'editor']::text[]");
    expect(contextHardeningSql).not.toMatch(
      /grant\s+(?:update|delete)[\s\S]*?on public\.contexts to authenticated/,
    );
    expect(contextHardeningSql).toContain(
      "grant select, insert, update, delete on public.contexts to service_role",
    );
  });
});
