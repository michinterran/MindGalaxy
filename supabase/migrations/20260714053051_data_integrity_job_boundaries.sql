-- Step 2: Data integrity and job boundaries.
-- This migration intentionally builds on the initial schema without editing it.

alter table public.captures
  add column if not exists idempotency_key uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'captures_workspace_idempotency_key_key'
      and conrelid = 'public.captures'::regclass
  ) then
    alter table public.captures
      add constraint captures_workspace_idempotency_key_key
      unique (workspace_id, idempotency_key);
  end if;
end;
$$;

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'published', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id uuid not null references public.processing_jobs(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  status public.processing_status not null default 'queued',
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (job_id, attempt_number)
);

create index outbox_events_workspace_status_idx
  on public.outbox_events(workspace_id, status, available_at);

create index outbox_events_aggregate_idx
  on public.outbox_events(aggregate_type, aggregate_id);

create index job_attempts_workspace_job_idx
  on public.job_attempts(workspace_id, job_id);

alter table public.outbox_events enable row level security;
alter table public.job_attempts enable row level security;

revoke all on public.outbox_events from public, anon, authenticated;
revoke all on public.job_attempts from public, anon, authenticated;

grant select, insert, update, delete on public.outbox_events to service_role;
grant select, insert, update, delete on public.job_attempts to service_role;

create policy "Service role can manage outbox events"
  on public.outbox_events for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage job attempts"
  on public.job_attempts for all
  to service_role
  using (true)
  with check (true);

revoke insert, delete on public.captures from authenticated;
revoke insert, update, delete on public.capture_sources from authenticated;
revoke update (
  label,
  url,
  provider,
  author,
  captured_at,
  metadata
) on public.capture_sources from authenticated;
drop policy if exists "Editors can create captures" on public.captures;
drop policy if exists "Owners can delete captures" on public.captures;
drop policy if exists "Editors can manage capture sources" on public.capture_sources;
revoke insert, update, delete on public.nodes from authenticated;
revoke insert, update, delete on public.edges from authenticated;
revoke insert, update, delete on public.contexts from authenticated;
revoke insert, update, delete on public.node_contexts from authenticated;
revoke insert, update, delete on public.processing_jobs from authenticated;
revoke insert, update, delete on public.node_revisions from authenticated;
revoke update (
  kind,
  title,
  summary,
  evidence_snippet,
  confidence,
  metadata,
  updated_at
) on public.nodes from authenticated;
revoke update (
  kind,
  label,
  confidence,
  evidence_snippet,
  metadata
) on public.edges from authenticated;
revoke update (
  kind,
  label,
  normalized_value,
  metadata
) on public.contexts from authenticated;
revoke update (
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
) on public.processing_jobs from authenticated;

create or replace function public.create_capture_command(
  p_workspace_id uuid,
  p_request_id uuid,
  p_raw_text text,
  p_project_id uuid default null,
  p_title text default null,
  p_source_kind public.capture_source_kind default 'paste',
  p_source jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  capture_id uuid,
  workspace_id uuid,
  project_id uuid,
  title text,
  source_kind public.capture_source_kind,
  capture_created_at timestamptz,
  processing_job_id uuid,
  processing_job_status public.processing_status,
  processing_job_type text,
  processing_job_created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_capture public.captures%rowtype;
  v_job public.processing_jobs%rowtype;
  v_source_label text;
  v_source_provider text;
  v_source_author text;
  v_source_url text;
  v_source_captured_at text;
  v_source_captured_at_tz timestamptz;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception 'REQUEST_ID_REQUIRED' using errcode = '22023';
  end if;

  if p_raw_text is null or char_length(trim(p_raw_text)) = 0 then
    raise exception 'RAW_TEXT_REQUIRED' using errcode = '22023';
  end if;

  if char_length(trim(p_raw_text)) > 60000 then
    raise exception 'RAW_TEXT_TOO_LONG' using errcode = '22023';
  end if;

  if p_title is not null and char_length(trim(p_title)) > 160 then
    raise exception 'TITLE_TOO_LONG' using errcode = '22023';
  end if;

  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'METADATA_OBJECT_REQUIRED' using errcode = '22023';
  end if;

  if pg_column_size(p_metadata) > 8192 then
    raise exception 'METADATA_TOO_LARGE' using errcode = '22023';
  end if;

  if p_source is not null then
    if jsonb_typeof(p_source) <> 'object' then
      raise exception 'SOURCE_OBJECT_REQUIRED' using errcode = '22023';
    end if;

    if pg_column_size(p_source) > 8192 then
      raise exception 'SOURCE_TOO_LARGE' using errcode = '22023';
    end if;

    if p_source ? 'metadata'
      and (
        jsonb_typeof(p_source->'metadata') <> 'object'
        or pg_column_size(p_source->'metadata') > 4096
      ) then
      raise exception 'SOURCE_METADATA_INVALID' using errcode = '22023';
    end if;

    v_source_label := nullif(trim(p_source->>'label'), '');
    v_source_provider := nullif(trim(p_source->>'provider'), '');
    v_source_author := nullif(trim(p_source->>'author'), '');
    v_source_url := nullif(trim(p_source->>'url'), '');
    v_source_captured_at := nullif(trim(p_source->>'capturedAt'), '');

    if v_source_label is not null and char_length(v_source_label) > 160 then
      raise exception 'SOURCE_LABEL_TOO_LONG' using errcode = '22023';
    end if;

    if v_source_provider is not null and char_length(v_source_provider) > 80 then
      raise exception 'SOURCE_PROVIDER_TOO_LONG' using errcode = '22023';
    end if;

    if v_source_author is not null and char_length(v_source_author) > 120 then
      raise exception 'SOURCE_AUTHOR_TOO_LONG' using errcode = '22023';
    end if;

    if v_source_url is not null and char_length(v_source_url) > 2048 then
      raise exception 'SOURCE_URL_TOO_LONG' using errcode = '22023';
    end if;

    if v_source_captured_at is not null
      and v_source_captured_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
    then
      raise exception 'SOURCE_CAPTURED_AT_INVALID' using errcode = '22023';
    end if;

    if v_source_captured_at is not null then
      begin
        v_source_captured_at_tz := v_source_captured_at::timestamptz;
      exception
        when others then
          raise exception 'SOURCE_CAPTURED_AT_INVALID' using errcode = '22023';
      end;
    end if;
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = v_user_id
      and wm.role in ('owner', 'editor')
  ) then
    raise exception 'WORKSPACE_WRITE_FORBIDDEN' using errcode = '42501';
  end if;

  if p_project_id is not null and not exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.workspace_id = p_workspace_id
  ) then
    raise exception 'PROJECT_NOT_FOUND' using errcode = '23503';
  end if;

  insert into public.captures (
    workspace_id,
    project_id,
    title,
    raw_text,
    source_kind,
    created_by,
    idempotency_key,
    metadata
  )
  values (
    p_workspace_id,
    p_project_id,
    nullif(trim(p_title), ''),
    trim(p_raw_text),
    p_source_kind,
    v_user_id,
    p_request_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (workspace_id, idempotency_key)
  do update set idempotency_key = excluded.idempotency_key
  returning * into v_capture;

  if p_source is not null and not exists (
    select 1
    from public.capture_sources cs
    where cs.capture_id = v_capture.id
  ) then
    insert into public.capture_sources (
      workspace_id,
      capture_id,
      label,
      url,
      provider,
      author,
      captured_at,
      metadata
    )
    values (
      p_workspace_id,
      v_capture.id,
      coalesce(v_source_label, '붙여넣기'),
      v_source_url,
      v_source_provider,
      v_source_author,
      v_source_captured_at_tz,
      coalesce(p_source->'metadata', '{}'::jsonb)
    );
  end if;

  select *
  into v_job
  from public.processing_jobs pj
  where pj.workspace_id = p_workspace_id
    and pj.capture_id = v_capture.id
    and pj.job_type = 'capture_structure'
    and pj.prompt_version is null
  order by pj.created_at asc
  limit 1;

  if v_job.id is null then
    insert into public.processing_jobs (
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
      jsonb_build_object(
        'sourceKind', v_capture.source_kind,
        'requestId', p_request_id
      )
    )
    returning * into v_job;
  end if;

  insert into public.outbox_events (
    workspace_id,
    aggregate_type,
    aggregate_id,
    event_type,
    dedupe_key,
    payload
  )
  values (
    p_workspace_id,
    'capture',
    v_capture.id,
    'capture.created',
    'capture.created:' || p_workspace_id::text || ':' || p_request_id::text,
    jsonb_build_object(
      'captureId', v_capture.id,
      'workspaceId', p_workspace_id,
      'processingJobId', v_job.id,
      'requestId', p_request_id
    )
  )
  on conflict (dedupe_key) do nothing;

  return query
  select
    v_capture.id,
    v_capture.workspace_id,
    v_capture.project_id,
    v_capture.title,
    v_capture.source_kind,
    v_capture.created_at,
    v_job.id,
    v_job.status,
    v_job.job_type,
    v_job.created_at;
end;
$$;

revoke all on function public.create_capture_command(
  uuid,
  uuid,
  text,
  uuid,
  text,
  public.capture_source_kind,
  jsonb,
  jsonb
) from public, anon, authenticated;

grant execute on function public.create_capture_command(
  uuid,
  uuid,
  text,
  uuid,
  text,
  public.capture_source_kind,
  jsonb,
  jsonb
) to authenticated;
