-- Library organization foundation.
--
-- Domain boundaries:
--   folders        = user-controlled storage hierarchy
--   contexts(topic)= semantic classification vocabulary
--   captures.created_at = calendar source of truth (no duplicate event table)

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint folders_parent_not_self check (parent_id is null or parent_id <> id)
);

comment on table public.folders is
  'User-managed storage hierarchy. Folders do not represent semantic topics.';

alter table public.captures
  add column if not exists folder_id uuid;

comment on column public.captures.folder_id is
  'Optional user storage location. Semantic classification remains in contexts.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'folders_id_workspace_id_key'
      and conrelid = 'public.folders'::regclass
  ) then
    alter table public.folders
      add constraint folders_id_workspace_id_key unique (id, workspace_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'folders_parent_workspace_fk'
      and conrelid = 'public.folders'::regclass
  ) then
    alter table public.folders
      add constraint folders_parent_workspace_fk
      foreign key (parent_id, workspace_id)
      references public.folders(id, workspace_id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'captures_folder_workspace_fk'
      and conrelid = 'public.captures'::regclass
  ) then
    alter table public.captures
      add constraint captures_folder_workspace_fk
      foreign key (folder_id, workspace_id)
      references public.folders(id, workspace_id)
      on delete set null (folder_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'contexts_id_workspace_id_kind_key'
      and conrelid = 'public.contexts'::regclass
  ) then
    alter table public.contexts
      add constraint contexts_id_workspace_id_kind_key
      unique (id, workspace_id, kind);
  end if;
end $$;

create table if not exists public.capture_topics (
  capture_id uuid not null,
  topic_context_id uuid not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  topic_kind public.context_kind not null default 'topic',
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (capture_id, topic_context_id),
  constraint capture_topics_topic_kind_check check (topic_kind = 'topic')
);

comment on table public.capture_topics is
  'Manual capture-to-topic assignments backed by contexts(kind=topic).';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'capture_topics_capture_workspace_fk'
      and conrelid = 'public.capture_topics'::regclass
  ) then
    alter table public.capture_topics
      add constraint capture_topics_capture_workspace_fk
      foreign key (capture_id, workspace_id)
      references public.captures(id, workspace_id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'capture_topics_context_workspace_kind_fk'
      and conrelid = 'public.capture_topics'::regclass
  ) then
    alter table public.capture_topics
      add constraint capture_topics_context_workspace_kind_fk
      foreign key (topic_context_id, workspace_id, topic_kind)
      references public.contexts(id, workspace_id, kind)
      on delete cascade;
  end if;
end $$;

-- Prevent cycles when a folder is moved under one of its descendants.
create or replace function private.prevent_folder_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'FOLDER_CYCLE' using errcode = '23514';
  end if;

  if exists (
    with recursive ancestors(id, parent_id) as (
      select f.id, f.parent_id
      from public.folders f
      where f.id = new.parent_id
        and f.workspace_id = new.workspace_id

      union

      select f.id, f.parent_id
      from public.folders f
      join ancestors a on f.id = a.parent_id
      where f.workspace_id = new.workspace_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'FOLDER_CYCLE' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_folder_cycle() from public, anon, authenticated;

drop trigger if exists folders_prevent_cycle on public.folders;
create trigger folders_prevent_cycle
before insert or update of parent_id, workspace_id
on public.folders
for each row execute function private.prevent_folder_cycle();

create index if not exists folders_workspace_parent_order_idx
  on public.folders(workspace_id, parent_id, sort_order, name);

create index if not exists captures_workspace_folder_created_idx
  on public.captures(workspace_id, folder_id, created_at desc);

-- Calendar queries use captures.created_at directly.
create index if not exists captures_workspace_created_at_idx
  on public.captures(workspace_id, created_at desc);

create index if not exists capture_topics_workspace_topic_capture_idx
  on public.capture_topics(workspace_id, topic_context_id, capture_id);

create index if not exists capture_topics_assigned_by_idx
  on public.capture_topics(assigned_by)
  where assigned_by is not null;

alter table public.folders enable row level security;
alter table public.capture_topics enable row level security;

grant select, insert, delete on public.folders to authenticated;
grant update (parent_id, name, sort_order, updated_at) on public.folders to authenticated;
grant select, insert, delete on public.capture_topics to authenticated;
grant update (folder_id, updated_at) on public.captures to authenticated;
-- Analysis-owned contexts remain immutable to clients. Editors may only add
-- explicit topic vocabulary rows; all other context kinds stay worker-owned.
grant insert (
  workspace_id,
  kind,
  label,
  normalized_value,
  metadata
) on public.contexts to authenticated;

grant select, insert, update, delete on public.folders to service_role;
grant select, insert, update, delete on public.capture_topics to service_role;
grant update (folder_id, updated_at) on public.captures to service_role;

drop policy if exists "Members can read folders" on public.folders;
create policy "Members can read folders"
  on public.folders for select
  to authenticated
  using (private.is_workspace_member(workspace_id));

drop policy if exists "Editors can create folders" on public.folders;
create policy "Editors can create folders"
  on public.folders for insert
  to authenticated
  with check (
    private.is_workspace_member(workspace_id, array['owner', 'editor']::text[])
  );

drop policy if exists "Editors can update folders" on public.folders;
create policy "Editors can update folders"
  on public.folders for update
  to authenticated
  using (
    private.is_workspace_member(workspace_id, array['owner', 'editor']::text[])
  )
  with check (
    private.is_workspace_member(workspace_id, array['owner', 'editor']::text[])
  );

drop policy if exists "Editors can delete folders" on public.folders;
create policy "Editors can delete folders"
  on public.folders for delete
  to authenticated
  using (
    private.is_workspace_member(workspace_id, array['owner', 'editor']::text[])
  );

drop policy if exists "Members can read capture topics" on public.capture_topics;
create policy "Members can read capture topics"
  on public.capture_topics for select
  to authenticated
  using (private.is_workspace_member(workspace_id));

drop policy if exists "Editors can create capture topics" on public.capture_topics;
create policy "Editors can create capture topics"
  on public.capture_topics for insert
  to authenticated
  with check (
    assigned_by = (select auth.uid())
    and private.is_workspace_member(
      workspace_id,
      array['owner', 'editor']::text[]
    )
  );

drop policy if exists "Editors can delete capture topics" on public.capture_topics;
create policy "Editors can delete capture topics"
  on public.capture_topics for delete
  to authenticated
  using (
    private.is_workspace_member(workspace_id, array['owner', 'editor']::text[])
  );

drop policy if exists "Client context inserts are manual topics" on public.contexts;
create policy "Client context inserts are manual topics"
  on public.contexts as restrictive
  for insert
  to authenticated
  with check (
    kind = 'topic'
  );
