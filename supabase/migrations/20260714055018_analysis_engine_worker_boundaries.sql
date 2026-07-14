-- Step 3: service-role analysis engine worker boundaries.

alter table public.processing_jobs
  add column if not exists claimed_by text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists next_run_at timestamptz not null default now(),
  add column if not exists max_attempts integer not null default 3 check (max_attempts > 0);

create index if not exists processing_jobs_analysis_claim_idx
  on public.processing_jobs(status, next_run_at, lease_expires_at, created_at)
  where job_type = 'capture_structure';

grant select, insert, update, delete on public.nodes to service_role;
grant select, insert, update, delete on public.edges to service_role;
grant select, insert, update, delete on public.contexts to service_role;
grant select, insert, update, delete on public.node_contexts to service_role;
grant select, insert, update, delete on public.node_revisions to service_role;
grant select, insert, update, delete on public.processing_jobs to service_role;
grant select, insert, update, delete on public.outbox_events to service_role;
grant select, insert, update, delete on public.job_attempts to service_role;
grant select on public.captures to service_role;

create or replace function public.claim_capture_analysis_job(
  p_worker_id text,
  p_lease_seconds integer default 120,
  p_model text default null,
  p_prompt_version text default null,
  p_max_attempts integer default 3
)
returns table (
  job_id uuid,
  attempt_id uuid,
  attempt_number integer,
  workspace_id uuid,
  capture_id uuid,
  raw_text text,
  source_kind public.capture_source_kind,
  title text,
  model text,
  prompt_version text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate_id uuid;
  v_reclaimed boolean := false;
  v_job public.processing_jobs%rowtype;
  v_attempt public.job_attempts%rowtype;
begin
  if p_worker_id is null or char_length(trim(p_worker_id)) = 0 then
    raise exception 'WORKER_ID_REQUIRED' using errcode = '22023';
  end if;

  if p_lease_seconds < 15 or p_lease_seconds > 900 then
    raise exception 'LEASE_SECONDS_INVALID' using errcode = '22023';
  end if;

  if p_max_attempts < 1 or p_max_attempts > 10 then
    raise exception 'MAX_ATTEMPTS_INVALID' using errcode = '22023';
  end if;

  select
    pj.id,
    (
      pj.status = 'running'
      and pj.lease_expires_at is not null
      and pj.lease_expires_at < now()
    )
  into v_candidate_id, v_reclaimed
  from public.processing_jobs pj
  where pj.job_type = 'capture_structure'
    and pj.retry_count < least(pj.max_attempts, p_max_attempts)
    and pj.next_run_at <= now()
    and (
      pj.status = 'queued'
      or (
        pj.status = 'running'
        and pj.lease_expires_at is not null
        and pj.lease_expires_at < now()
      )
    )
  order by pj.created_at asc
  for update skip locked
  limit 1;

  if v_candidate_id is null then
    return;
  end if;

  if v_reclaimed then
    update public.job_attempts
    set status = 'failed',
        completed_at = now(),
        error_message = 'LEASE_EXPIRED',
        metadata = metadata
          || jsonb_build_object(
            'errorCode', 'LEASE_EXPIRED',
            'error_code', 'LEASE_EXPIRED'
          )
    where job_id = v_candidate_id
      and status = 'running';
  end if;

  update public.processing_jobs pj
  set status = 'running',
      claimed_by = trim(p_worker_id),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      last_heartbeat_at = now(),
      started_at = coalesce(pj.started_at, now()),
      retry_count = pj.retry_count + 1,
      max_attempts = greatest(pj.max_attempts, p_max_attempts),
      model = p_model,
      prompt_version = p_prompt_version,
      updated_at = now()
  where pj.id = v_candidate_id
  returning pj.* into v_job;

  if v_job.id is null then
    return;
  end if;

  insert into public.job_attempts (
    workspace_id,
    job_id,
    attempt_number,
    status,
    started_at,
    metadata
  )
  values (
    v_job.workspace_id,
    v_job.id,
    v_job.retry_count,
    'running',
    now(),
    jsonb_build_object(
      'workerId', trim(p_worker_id),
      'model', p_model,
      'promptVersion', p_prompt_version
    )
  )
  returning * into v_attempt;

  return query
  select
    v_job.id,
    v_attempt.id,
    v_attempt.attempt_number,
    v_job.workspace_id,
    c.id,
    c.raw_text,
    c.source_kind,
    c.title,
    p_model,
    p_prompt_version
  from public.captures c
  where c.id = v_job.capture_id
    and c.workspace_id = v_job.workspace_id;
end;
$$;

drop function if exists public.persist_capture_analysis_result(
  uuid,
  uuid,
  jsonb,
  text,
  text,
  numeric,
  boolean,
  jsonb
);

create or replace function public.persist_capture_analysis_result(
  p_job_id uuid,
  p_attempt_id uuid,
  p_worker_id text,
  p_result jsonb,
  p_model text,
  p_prompt_version text,
  p_confidence numeric,
  p_review_required boolean default false,
  p_review_reasons jsonb default '[]'::jsonb
)
returns table (
  job_id uuid,
  status public.processing_status,
  node_count integer,
  edge_count integer,
  context_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.processing_jobs%rowtype;
  v_attempt public.job_attempts%rowtype;
  v_status public.processing_status;
  v_node jsonb;
  v_edge jsonb;
  v_context jsonb;
  v_context_client_id text;
  v_context_id uuid;
  v_node_id uuid;
  v_source_node_id uuid;
  v_target_node_id uuid;
  v_node_count integer := 0;
  v_edge_count integer := 0;
  v_context_count integer := 0;
  v_revision_number integer;
begin
  select *
  into v_job
  from public.processing_jobs
  where id = p_job_id
  for update;

  if v_job.id is null then
    raise exception 'JOB_NOT_FOUND' using errcode = '22023';
  end if;

  select *
  into v_attempt
  from public.job_attempts
  where id = p_attempt_id
    and job_id = p_job_id
  for update;

  if v_attempt.id is null
    or v_job.status <> 'running'
    or v_job.claimed_by is distinct from trim(p_worker_id)
    or v_job.lease_expires_at is null
    or v_job.lease_expires_at < now()
    or v_attempt.status <> 'running'
    or v_attempt.attempt_number <> v_job.retry_count
    or v_attempt.metadata->>'workerId' is distinct from trim(p_worker_id) then
    raise exception 'ATTEMPT_STALE' using errcode = '22023';
  end if;

  if p_result is null or jsonb_typeof(p_result) <> 'object' then
    raise exception 'RESULT_OBJECT_REQUIRED' using errcode = '22023';
  end if;

  if jsonb_typeof(p_result->'nodes') <> 'array'
    or jsonb_typeof(p_result->'edges') <> 'array'
    or jsonb_typeof(p_result->'contexts') <> 'array' then
    raise exception 'RESULT_ARRAYS_REQUIRED' using errcode = '22023';
  end if;

  if p_review_reasons is null or jsonb_typeof(p_review_reasons) <> 'array' then
    raise exception 'REVIEW_REASONS_ARRAY_REQUIRED' using errcode = '22023';
  end if;

  if jsonb_array_length(p_result->'nodes') > 24
    or jsonb_array_length(p_result->'edges') > 48
    or jsonb_array_length(p_result->'contexts') > 32 then
    raise exception 'RESULT_TOO_LARGE' using errcode = '22023';
  end if;

  create temp table if not exists pg_temp.analysis_node_map (
    client_id text primary key,
    id uuid not null
  ) on commit drop;

  create temp table if not exists pg_temp.analysis_context_map (
    client_id text primary key,
    id uuid not null
  ) on commit drop;

  truncate table pg_temp.analysis_node_map;
  truncate table pg_temp.analysis_context_map;

  delete from public.node_contexts nc
  using public.nodes n
  where nc.node_id = n.id
    and n.workspace_id = v_job.workspace_id
    and n.capture_id = v_job.capture_id;

  delete from public.edges e
  where e.workspace_id = v_job.workspace_id
    and (
      exists (
        select 1 from public.nodes n
        where n.id in (e.source_node_id, e.target_node_id)
          and n.capture_id = v_job.capture_id
          and n.workspace_id = v_job.workspace_id
      )
      or e.metadata->>'captureId' = v_job.capture_id::text
    );

  delete from public.node_revisions nr
  using public.nodes n
  where nr.node_id = n.id
    and n.workspace_id = v_job.workspace_id
    and n.capture_id = v_job.capture_id;

  delete from public.nodes
  where workspace_id = v_job.workspace_id
    and capture_id = v_job.capture_id;

  delete from public.contexts
  where workspace_id = v_job.workspace_id
    and metadata->>'captureId' = v_job.capture_id::text;

  for v_context in select * from jsonb_array_elements(p_result->'contexts')
  loop
    if jsonb_typeof(v_context) <> 'object'
      or nullif(v_context->>'clientContextId', '') is null
      or nullif(v_context->>'kind', '') is null
      or nullif(v_context->>'label', '') is null then
      raise exception 'CONTEXT_INVALID' using errcode = '22023';
    end if;

    if (v_context ? 'metadata' and jsonb_typeof(v_context->'metadata') <> 'object')
      or (v_context ? 'evidence' and jsonb_typeof(v_context->'evidence') <> 'object') then
      raise exception 'CONTEXT_JSON_OBJECT_INVALID' using errcode = '22023';
    end if;

    v_context_id := pg_catalog.gen_random_uuid();

    insert into public.contexts (
      id,
      workspace_id,
      kind,
      label,
      normalized_value,
      metadata
    )
    values (
      v_context_id,
      v_job.workspace_id,
      (v_context->>'kind')::public.context_kind,
      left(v_context->>'label', 160),
      nullif(left(coalesce(v_context->>'normalizedValue', ''), 240), ''),
      coalesce(v_context->'metadata', '{}'::jsonb)
        || jsonb_build_object(
          'captureId', v_job.capture_id,
          'model', p_model,
          'promptVersion', p_prompt_version,
          'processingJobId', p_job_id,
          'attemptId', p_attempt_id,
          'evidence', coalesce(v_context->'evidence', '{}'::jsonb)
            || jsonb_build_object(
              'captureId', v_job.capture_id,
              'model', p_model,
              'promptVersion', p_prompt_version,
              'processingJobId', p_job_id,
              'attemptId', p_attempt_id
            )
        )
    );

    insert into pg_temp.analysis_context_map(client_id, id)
    values (v_context->>'clientContextId', v_context_id);
    v_context_count := v_context_count + 1;
  end loop;

  for v_node in select * from jsonb_array_elements(p_result->'nodes')
  loop
    if jsonb_typeof(v_node) <> 'object'
      or nullif(v_node->>'clientNodeId', '') is null
      or nullif(v_node->>'kind', '') is null
      or nullif(v_node->>'title', '') is null then
      raise exception 'NODE_INVALID' using errcode = '22023';
    end if;

    if (v_node ? 'metadata' and jsonb_typeof(v_node->'metadata') <> 'object')
      or (v_node ? 'evidence' and jsonb_typeof(v_node->'evidence') <> 'object')
      or (v_node ? 'contextClientIds' and jsonb_typeof(v_node->'contextClientIds') <> 'array') then
      raise exception 'NODE_JSON_SHAPE_INVALID' using errcode = '22023';
    end if;

    v_node_id := pg_catalog.gen_random_uuid();

    insert into public.nodes (
      id,
      workspace_id,
      project_id,
      capture_id,
      kind,
      title,
      summary,
      evidence_snippet,
      confidence,
      metadata
    )
    values (
      v_node_id,
      v_job.workspace_id,
      null,
      v_job.capture_id,
      (v_node->>'kind')::public.node_kind,
      left(v_node->>'title', 180),
      nullif(left(coalesce(v_node->>'summary', ''), 800), ''),
      nullif(left(coalesce(v_node#>>'{evidence,quote}', ''), 500), ''),
      least(greatest(coalesce((v_node->>'confidence')::numeric, 0), 0), 1),
      coalesce(v_node->'metadata', '{}'::jsonb)
        || jsonb_build_object(
          'captureId', v_job.capture_id,
          'model', p_model,
          'promptVersion', p_prompt_version,
          'processingJobId', p_job_id,
          'attemptId', p_attempt_id,
          'evidence', coalesce(v_node->'evidence', '{}'::jsonb)
            || jsonb_build_object(
              'captureId', v_job.capture_id,
              'model', p_model,
              'promptVersion', p_prompt_version,
              'processingJobId', p_job_id,
              'attemptId', p_attempt_id
            )
        )
    );

    insert into pg_temp.analysis_node_map(client_id, id)
    values (v_node->>'clientNodeId', v_node_id);

    select coalesce(max(revision_number), 0) + 1
    into v_revision_number
    from public.node_revisions
    where node_id = v_node_id;

    insert into public.node_revisions (
      workspace_id,
      node_id,
      revision_number,
      title,
      summary,
      evidence_snippet,
      changed_by,
      changed_by_ai,
      change_reason
    )
    values (
      v_job.workspace_id,
      v_node_id,
      v_revision_number,
      left(v_node->>'title', 180),
      nullif(left(coalesce(v_node->>'summary', ''), 800), ''),
      nullif(left(coalesce(v_node#>>'{evidence,quote}', ''), 500), ''),
      null,
      true,
      'analysis_engine:create'
    );

    for v_context_client_id in
      select * from jsonb_array_elements_text(coalesce(v_node->'contextClientIds', '[]'::jsonb))
    loop
      if not exists (
        select 1
        from pg_temp.analysis_context_map cm
        where cm.client_id = v_context_client_id
      ) then
        raise exception 'NODE_CONTEXT_REFERENCE_INVALID' using errcode = '22023';
      end if;
    end loop;

    insert into public.node_contexts(node_id, context_id, workspace_id)
    select v_node_id, cm.id, v_job.workspace_id
    from jsonb_array_elements_text(coalesce(v_node->'contextClientIds', '[]'::jsonb)) as context_client_id
    join pg_temp.analysis_context_map cm on cm.client_id = context_client_id
    on conflict do nothing;

    v_node_count := v_node_count + 1;
  end loop;

  for v_edge in select * from jsonb_array_elements(p_result->'edges')
  loop
    if jsonb_typeof(v_edge) <> 'object'
      or nullif(v_edge->>'sourceClientNodeId', '') is null
      or nullif(v_edge->>'targetClientNodeId', '') is null
      or nullif(v_edge->>'kind', '') is null then
      raise exception 'EDGE_INVALID' using errcode = '22023';
    end if;

    if (v_edge ? 'metadata' and jsonb_typeof(v_edge->'metadata') <> 'object')
      or (v_edge ? 'evidence' and jsonb_typeof(v_edge->'evidence') <> 'object') then
      raise exception 'EDGE_JSON_OBJECT_INVALID' using errcode = '22023';
    end if;

    select id into v_source_node_id
    from pg_temp.analysis_node_map
    where client_id = v_edge->>'sourceClientNodeId';

    select id into v_target_node_id
    from pg_temp.analysis_node_map
    where client_id = v_edge->>'targetClientNodeId';

    if v_source_node_id is null or v_target_node_id is null then
      raise exception 'EDGE_NODE_REFERENCE_INVALID' using errcode = '22023';
    end if;

    insert into public.edges (
      workspace_id,
      source_node_id,
      target_node_id,
      kind,
      label,
      confidence,
      evidence_snippet,
      metadata
    )
    values (
      v_job.workspace_id,
      v_source_node_id,
      v_target_node_id,
      (v_edge->>'kind')::public.edge_kind,
      nullif(left(coalesce(v_edge->>'label', ''), 160), ''),
      least(greatest(coalesce((v_edge->>'confidence')::numeric, 0), 0), 1),
      nullif(left(coalesce(v_edge#>>'{evidence,quote}', ''), 500), ''),
      coalesce(v_edge->'metadata', '{}'::jsonb)
        || jsonb_build_object(
          'captureId', v_job.capture_id,
          'model', p_model,
          'promptVersion', p_prompt_version,
          'processingJobId', p_job_id,
          'attemptId', p_attempt_id,
          'evidence', coalesce(v_edge->'evidence', '{}'::jsonb)
            || jsonb_build_object(
              'captureId', v_job.capture_id,
              'model', p_model,
              'promptVersion', p_prompt_version,
              'processingJobId', p_job_id,
              'attemptId', p_attempt_id
            )
        )
    );

    v_edge_count := v_edge_count + 1;
  end loop;

  v_status := case when p_review_required then 'needs_review' else 'completed' end;

  update public.job_attempts
  set status = v_status,
      completed_at = now(),
      metadata = metadata
        || jsonb_build_object(
          'confidence', p_confidence,
          'reviewRequired', p_review_required,
          'reviewReasons', coalesce(p_review_reasons, '[]'::jsonb)
        )
  where id = p_attempt_id;

  update public.processing_jobs
  set status = v_status,
      confidence = least(greatest(coalesce(p_confidence, 0), 0), 1),
      model = p_model,
      prompt_version = p_prompt_version,
      error_message = null,
      lease_expires_at = null,
      claimed_by = null,
      last_heartbeat_at = now(),
      completed_at = case when v_status = 'completed' then now() else completed_at end,
      metadata = metadata
        || jsonb_build_object(
          'reviewRequired', p_review_required,
          'reviewReasons', coalesce(p_review_reasons, '[]'::jsonb),
          'nodeCount', v_node_count,
          'edgeCount', v_edge_count,
          'contextCount', v_context_count
        ),
      updated_at = now()
  where id = p_job_id;

  insert into public.outbox_events (
    workspace_id,
    aggregate_type,
    aggregate_id,
    event_type,
    dedupe_key,
    payload
  )
  values (
    v_job.workspace_id,
    'capture',
    v_job.capture_id,
    case when v_status = 'completed' then 'capture.analysis.completed' else 'capture.analysis.needs_review' end,
    'capture.analysis:' || p_job_id::text || ':' || coalesce(p_prompt_version, 'none'),
    jsonb_build_object(
      'captureId', v_job.capture_id,
      'workspaceId', v_job.workspace_id,
      'processingJobId', p_job_id,
      'attemptId', p_attempt_id,
      'status', v_status
    )
  )
  on conflict (dedupe_key) do nothing;

  return query select p_job_id, v_status, v_node_count, v_edge_count, v_context_count;
end;
$$;

drop function if exists public.fail_capture_analysis_job(
  uuid,
  uuid,
  text,
  text,
  integer,
  integer
);

create or replace function public.fail_capture_analysis_job(
  p_job_id uuid,
  p_attempt_id uuid,
  p_worker_id text,
  p_error_code text,
  p_error_message text default null,
  p_retry_delay_seconds integer default 60,
  p_max_attempts integer default 3
)
returns table (
  job_id uuid,
  status public.processing_status,
  retry_count integer,
  next_run_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.processing_jobs%rowtype;
  v_attempt public.job_attempts%rowtype;
  v_status public.processing_status;
  v_next_run_at timestamptz;
begin
  select *
  into v_job
  from public.processing_jobs
  where id = p_job_id
  for update;

  if v_job.id is null then
    raise exception 'JOB_NOT_FOUND' using errcode = '22023';
  end if;

  select *
  into v_attempt
  from public.job_attempts
  where id = p_attempt_id
    and job_id = p_job_id
  for update;

  if v_attempt.id is null
    or v_job.status <> 'running'
    or v_job.claimed_by is distinct from trim(p_worker_id)
    or v_job.lease_expires_at is null
    or v_job.lease_expires_at < now()
    or v_attempt.status <> 'running'
    or v_attempt.attempt_number <> v_job.retry_count
    or v_attempt.metadata->>'workerId' is distinct from trim(p_worker_id) then
    raise exception 'ATTEMPT_STALE' using errcode = '22023';
  end if;

  v_status := case
    when v_job.retry_count >= least(v_job.max_attempts, p_max_attempts) then 'failed'
    else 'queued'
  end;
  v_next_run_at := case
    when v_status = 'queued' then now() + make_interval(secs => greatest(p_retry_delay_seconds, 1))
    else v_job.next_run_at
  end;

  update public.job_attempts
  set status = 'failed',
      completed_at = now(),
      error_message = left(coalesce(p_error_code, 'ANALYSIS_FAILED'), 240),
      metadata = metadata
        || jsonb_build_object(
          'errorCode', left(coalesce(p_error_code, 'ANALYSIS_FAILED'), 120),
          'errorMessage', left(coalesce(p_error_message, ''), 500)
        )
  where id = p_attempt_id
    and job_id = p_job_id;

  update public.processing_jobs
  set status = v_status,
      error_message = left(coalesce(p_error_code, 'ANALYSIS_FAILED'), 240),
      lease_expires_at = null,
      claimed_by = null,
      next_run_at = v_next_run_at,
      updated_at = now()
  where id = p_job_id
  returning * into v_job;

  return query select v_job.id, v_job.status, v_job.retry_count, v_job.next_run_at;
end;
$$;

revoke all on function public.claim_capture_analysis_job(text, integer, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.persist_capture_analysis_result(
  uuid,
  uuid,
  text,
  jsonb,
  text,
  text,
  numeric,
  boolean,
  jsonb
) from public, anon, authenticated;
revoke all on function public.fail_capture_analysis_job(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.claim_capture_analysis_job(text, integer, text, text, integer)
  to service_role;
grant execute on function public.persist_capture_analysis_result(
  uuid,
  uuid,
  text,
  jsonb,
  text,
  text,
  numeric,
  boolean,
  jsonb
) to service_role;
grant execute on function public.fail_capture_analysis_job(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  integer
) to service_role;
