-- MindGalaxy initial schema draft.
-- Status: local migration draft only. It has not been applied to a Supabase project.

create extension if not exists pgcrypto;
create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create type public.capture_source_kind as enum (
  'paste',
  'chatgpt',
  'claude',
  'gemini',
  'web',
  'file',
  'manual'
);

create type public.processing_status as enum (
  'queued',
  'running',
  'needs_review',
  'completed',
  'failed'
);

create type public.node_kind as enum (
  'idea',
  'claim',
  'entity',
  'event',
  'task',
  'question',
  'source_summary'
);

create type public.edge_kind as enum (
  'relates_to',
  'supports',
  'contradicts',
  'causes',
  'mentions',
  'contains',
  'follows',
  'derived_from'
);

create type public.context_kind as enum (
  'topic',
  'time',
  'place',
  'person',
  'organization',
  'project',
  'tag'
);

create type public.export_kind as enum ('pdf', 'html', 'pptx');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.captures (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text,
  raw_text text not null check (char_length(raw_text) > 0),
  source_kind public.capture_source_kind not null default 'paste',
  created_by uuid not null references auth.users(id) on delete cascade,
  embedding extensions.vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.capture_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  capture_id uuid not null references public.captures(id) on delete cascade,
  label text not null,
  url text,
  provider text,
  author text,
  captured_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.nodes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  capture_id uuid references public.captures(id) on delete set null,
  kind public.node_kind not null,
  title text not null,
  summary text,
  evidence_snippet text,
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  embedding extensions.vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.edges (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_node_id uuid not null references public.nodes(id) on delete cascade,
  target_node_id uuid not null references public.nodes(id) on delete cascade,
  kind public.edge_kind not null,
  label text,
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence_snippet text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (source_node_id <> target_node_id)
);

create table public.contexts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind public.context_kind not null,
  label text not null,
  normalized_value text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.node_contexts (
  node_id uuid not null references public.nodes(id) on delete cascade,
  context_id uuid not null references public.contexts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (node_id, context_id)
);

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  capture_id uuid not null references public.captures(id) on delete cascade,
  status public.processing_status not null default 'queued',
  job_type text not null default 'capture_structure',
  model text,
  prompt_version text,
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  retry_count integer not null default 0 check (retry_count >= 0),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.node_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  node_id uuid not null references public.nodes(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  title text not null,
  summary text,
  evidence_snippet text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_by_ai boolean not null default false,
  change_reason text,
  created_at timestamptz not null default now(),
  unique (node_id, revision_number)
);

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  kind public.export_kind not null,
  status public.processing_status not null default 'queued',
  file_url text,
  created_by uuid not null references auth.users(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects
  add constraint projects_id_workspace_id_key unique (id, workspace_id);

alter table public.captures
  add constraint captures_id_workspace_id_key unique (id, workspace_id),
  add constraint captures_project_workspace_fk
    foreign key (project_id, workspace_id)
    references public.projects(id, workspace_id)
    on delete set null (project_id);

alter table public.nodes
  add constraint nodes_id_workspace_id_key unique (id, workspace_id),
  add constraint nodes_project_workspace_fk
    foreign key (project_id, workspace_id)
    references public.projects(id, workspace_id)
    on delete set null (project_id),
  add constraint nodes_capture_workspace_fk
    foreign key (capture_id, workspace_id)
    references public.captures(id, workspace_id)
    on delete set null (capture_id);

alter table public.contexts
  add constraint contexts_id_workspace_id_key unique (id, workspace_id);

alter table public.capture_sources
  add constraint capture_sources_capture_workspace_fk
    foreign key (capture_id, workspace_id)
    references public.captures(id, workspace_id)
    on delete cascade;

alter table public.edges
  add constraint edges_source_node_workspace_fk
    foreign key (source_node_id, workspace_id)
    references public.nodes(id, workspace_id)
    on delete cascade,
  add constraint edges_target_node_workspace_fk
    foreign key (target_node_id, workspace_id)
    references public.nodes(id, workspace_id)
    on delete cascade;

alter table public.node_contexts
  add constraint node_contexts_node_workspace_fk
    foreign key (node_id, workspace_id)
    references public.nodes(id, workspace_id)
    on delete cascade,
  add constraint node_contexts_context_workspace_fk
    foreign key (context_id, workspace_id)
    references public.contexts(id, workspace_id)
    on delete cascade;

alter table public.processing_jobs
  add constraint processing_jobs_capture_workspace_fk
    foreign key (capture_id, workspace_id)
    references public.captures(id, workspace_id)
    on delete cascade;

alter table public.node_revisions
  add constraint node_revisions_node_workspace_fk
    foreign key (node_id, workspace_id)
    references public.nodes(id, workspace_id)
    on delete cascade;

alter table public.exports
  add constraint exports_project_workspace_fk
    foreign key (project_id, workspace_id)
    references public.projects(id, workspace_id)
    on delete set null (project_id);

create index workspaces_owner_id_idx on public.workspaces(owner_id);
create index workspace_members_user_id_idx on public.workspace_members(user_id);
create index projects_workspace_id_idx on public.projects(workspace_id);
create index captures_workspace_id_idx on public.captures(workspace_id);
create index captures_project_id_idx on public.captures(project_id);
create index captures_created_by_idx on public.captures(created_by);
create index capture_sources_capture_id_idx on public.capture_sources(capture_id);
create index nodes_workspace_id_idx on public.nodes(workspace_id);
create index nodes_capture_id_idx on public.nodes(capture_id);
create index nodes_project_id_idx on public.nodes(project_id);
create index edges_workspace_id_idx on public.edges(workspace_id);
create index edges_source_node_id_idx on public.edges(source_node_id);
create index edges_target_node_id_idx on public.edges(target_node_id);
create index contexts_workspace_kind_idx on public.contexts(workspace_id, kind);
create index node_contexts_context_id_idx on public.node_contexts(context_id);
create index processing_jobs_workspace_status_idx on public.processing_jobs(workspace_id, status);
create index processing_jobs_capture_id_idx on public.processing_jobs(capture_id);
create index node_revisions_node_id_idx on public.node_revisions(node_id);
create index exports_workspace_status_idx on public.exports(workspace_id, status);

-- Approximate vector indexes can be added after embedding volume and query pattern
-- are known, for example:
-- create index captures_embedding_hnsw_idx on public.captures using hnsw (embedding extensions.vector_cosine_ops);
-- create index nodes_embedding_hnsw_idx on public.nodes using hnsw (embedding extensions.vector_cosine_ops);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.captures enable row level security;
alter table public.capture_sources enable row level security;
alter table public.nodes enable row level security;
alter table public.edges enable row level security;
alter table public.contexts enable row level security;
alter table public.node_contexts enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.node_revisions enable row level security;
alter table public.exports enable row level security;

grant usage on schema public to authenticated;
grant select, insert, delete on public.workspaces to authenticated;
grant update (name, updated_at) on public.workspaces to authenticated;
grant select, insert, delete on public.workspace_members to authenticated;
grant update (role) on public.workspace_members to authenticated;
grant select, insert, delete on public.projects to authenticated;
grant update (name, description, updated_at) on public.projects to authenticated;
grant select, insert, delete on public.captures to authenticated;
grant update (project_id, title, metadata, updated_at) on public.captures to authenticated;
grant select, insert, delete on public.capture_sources to authenticated;
grant update (label, url, provider, author, captured_at, metadata) on public.capture_sources to authenticated;
grant select, insert, delete on public.nodes to authenticated;
grant update (kind, title, summary, evidence_snippet, confidence, metadata, updated_at) on public.nodes to authenticated;
grant select, insert, delete on public.edges to authenticated;
grant update (kind, label, confidence, evidence_snippet, metadata) on public.edges to authenticated;
grant select, insert, delete on public.contexts to authenticated;
grant update (kind, label, normalized_value, metadata) on public.contexts to authenticated;
grant select, insert, delete on public.node_contexts to authenticated;
grant select, insert on public.processing_jobs to authenticated;
grant update (
  status,
  model,
  prompt_version,
  confidence,
  retry_count,
  error_message,
  metadata,
  started_at,
  completed_at,
  updated_at
) on public.processing_jobs to authenticated;
grant select, insert on public.node_revisions to authenticated;
grant select, insert, delete on public.exports to authenticated;
grant update (status, file_url, metadata, updated_at) on public.exports to authenticated;

create policy "Workspace owners can read their workspaces"
  on public.workspaces for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "Workspace members can read workspaces"
  on public.workspaces for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspaces.id
        and wm.user_id = (select auth.uid())
    )
  );

create policy "Authenticated users can create owned workspaces"
  on public.workspaces for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Workspace owners can update their workspaces"
  on public.workspaces for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Workspace owners can delete their workspaces"
  on public.workspaces for delete
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "Members can read their own memberships"
  on public.workspace_members for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Workspace owners can manage memberships"
  on public.workspace_members for all
  to authenticated
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_members.workspace_id
        and w.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_members.workspace_id
        and w.owner_id = (select auth.uid())
    )
  );

create policy "Members can read projects"
  on public.projects for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = projects.workspace_id
        and wm.user_id = (select auth.uid())
    )
  );

create policy "Editors can create projects"
  on public.projects for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = projects.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  );

create policy "Editors can update projects"
  on public.projects for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = projects.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = projects.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  );

create policy "Owners can delete projects"
  on public.projects for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = projects.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role = 'owner'
    )
  );

create policy "Members can read captures"
  on public.captures for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = captures.workspace_id
        and wm.user_id = (select auth.uid())
    )
  );

create policy "Editors can create captures"
  on public.captures for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = captures.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  );

create policy "Editors can update captures"
  on public.captures for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = captures.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = captures.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  );

create policy "Owners can delete captures"
  on public.captures for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = captures.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role = 'owner'
    )
  );

create policy "Members can read capture sources"
  on public.capture_sources for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = capture_sources.workspace_id
        and wm.user_id = (select auth.uid())
    )
  );

create policy "Editors can manage capture sources"
  on public.capture_sources for all
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = capture_sources.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = capture_sources.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  );

create policy "Members can read graph records"
  on public.nodes for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = nodes.workspace_id
        and wm.user_id = (select auth.uid())
    )
  );

create policy "Editors can manage graph nodes"
  on public.nodes for all
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = nodes.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = nodes.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  );

create policy "Members can read graph edges"
  on public.edges for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = edges.workspace_id
        and wm.user_id = (select auth.uid())
    )
  );

create policy "Editors can manage graph edges"
  on public.edges for all
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = edges.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = edges.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  );

create policy "Members can read contexts"
  on public.contexts for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = contexts.workspace_id
        and wm.user_id = (select auth.uid())
    )
  );

create policy "Editors can manage contexts"
  on public.contexts for all
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = contexts.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = contexts.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  );

create policy "Members can read node contexts"
  on public.node_contexts for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = node_contexts.workspace_id
        and wm.user_id = (select auth.uid())
    )
  );

create policy "Editors can manage node contexts"
  on public.node_contexts for all
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = node_contexts.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = node_contexts.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  );

create policy "Members can read processing jobs"
  on public.processing_jobs for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = processing_jobs.workspace_id
        and wm.user_id = (select auth.uid())
    )
  );

create policy "Editors can create processing jobs"
  on public.processing_jobs for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = processing_jobs.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  );

create policy "Editors can update processing jobs"
  on public.processing_jobs for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = processing_jobs.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = processing_jobs.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  );

create policy "Members can read node revisions"
  on public.node_revisions for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = node_revisions.workspace_id
        and wm.user_id = (select auth.uid())
    )
  );

create policy "Editors can create node revisions"
  on public.node_revisions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = node_revisions.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
    and (changed_by = (select auth.uid()) or changed_by_ai = true)
  );

create policy "Members can read exports"
  on public.exports for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = exports.workspace_id
        and wm.user_id = (select auth.uid())
    )
  );

create policy "Editors can create exports"
  on public.exports for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = exports.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  );

create policy "Editors can update exports"
  on public.exports for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = exports.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = exports.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'editor')
    )
  );
