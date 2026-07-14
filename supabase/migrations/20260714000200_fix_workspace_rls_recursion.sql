-- Fix recursive RLS checks between workspaces and workspace_members.
--
-- The bootstrap path inserts a workspace, then inserts the first owner
-- membership. The original policies made workspaces and workspace_members
-- query each other directly, which can trigger recursive RLS evaluation.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = target_workspace_id
      and w.owner_id = auth.uid()
  );
$$;

create or replace function private.is_workspace_member(
  target_workspace_id uuid,
  allowed_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and (
        allowed_roles is null
        or wm.role = any(allowed_roles)
      )
  );
$$;

revoke all on function private.is_workspace_owner(uuid) from public;
revoke all on function private.is_workspace_member(uuid, text[]) from public;
grant execute on function private.is_workspace_owner(uuid) to authenticated;
grant execute on function private.is_workspace_member(uuid, text[]) to authenticated;

drop policy if exists "Workspace members can read workspaces" on public.workspaces;
drop policy if exists "Members can read their own memberships" on public.workspace_members;
drop policy if exists "Workspace owners can manage memberships" on public.workspace_members;

create policy "Workspace members can read workspaces"
  on public.workspaces for select
  to authenticated
  using (private.is_workspace_member(id));

create policy "Members can read their own memberships"
  on public.workspace_members for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_workspace_owner(workspace_id)
  );

create policy "Workspace owners can manage memberships"
  on public.workspace_members for all
  to authenticated
  using (private.is_workspace_owner(workspace_id))
  with check (private.is_workspace_owner(workspace_id));
