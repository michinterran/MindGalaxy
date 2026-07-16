-- Keep AI-derived contexts worker-owned while allowing editors to add only
-- explicit manual topic vocabulary through the caller's RLS boundary.

drop policy if exists "Editors can manage contexts" on public.contexts;
drop policy if exists "Client context inserts are manual topics" on public.contexts;
drop policy if exists "Editors can create manual topic contexts" on public.contexts;

-- Earlier schema versions granted UPDATE at column scope. A table-level
-- REVOKE does not reliably communicate that intent, so revoke both the table
-- and the known column grants before rebuilding the narrow INSERT boundary.
revoke insert, update, delete on public.contexts from authenticated;
revoke insert (
  workspace_id,
  kind,
  label,
  normalized_value,
  metadata
) on public.contexts from authenticated;
revoke update (
  kind,
  label,
  normalized_value,
  metadata
) on public.contexts from authenticated;

grant insert (
  workspace_id,
  kind,
  label,
  normalized_value,
  metadata
) on public.contexts to authenticated;
grant select, insert, update, delete on public.contexts to service_role;

create policy "Editors can create manual topic contexts"
  on public.contexts for insert
  to authenticated
  with check (
    kind = 'topic'
    and metadata ->> 'source' = 'manual'
    and private.is_workspace_member(
      workspace_id,
      array['owner', 'editor']::text[]
    )
  );
