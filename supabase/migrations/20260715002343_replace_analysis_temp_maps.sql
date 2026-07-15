-- Replace session-local temp tables with bounded in-function JSONB maps.
-- The analysis schema already caps contexts at 32 and nodes at 24, so these
-- maps remain small while avoiding session-local relation validation failures.

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
  v_context_map jsonb := '{}'::jsonb;
  v_node_map jsonb := '{}'::jsonb;
  v_context_id uuid;
  v_node_id uuid;
  v_source_node_id uuid;
  v_target_node_id uuid;
  v_capture_embedding extensions.vector(1536);
  v_node_embedding extensions.vector(1536);
  v_node_count integer := 0;
  v_edge_count integer := 0;
  v_context_count integer := 0;
  v_revision_number integer;
begin
  select processing_job_row.*
  into v_job
  from public.processing_jobs as processing_job_row
  where processing_job_row.id = p_job_id
  for update;

  if v_job.id is null then
    raise exception 'JOB_NOT_FOUND' using errcode = '22023';
  end if;

  select attempt_row.*
  into v_attempt
  from public.job_attempts as attempt_row
  where attempt_row.id = p_attempt_id
    and attempt_row.job_id = p_job_id
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

  if jsonb_typeof(p_result->'captureEmbedding') is distinct from 'array'
    or jsonb_array_length(p_result->'captureEmbedding') <> 1536
    or exists (
      select 1
      from jsonb_array_elements(p_result->'captureEmbedding') as embedding_value(value)
      where jsonb_typeof(embedding_value.value) <> 'number'
    ) then
    raise exception 'CAPTURE_EMBEDDING_INVALID' using errcode = '22023';
  end if;

  if p_review_reasons is null or jsonb_typeof(p_review_reasons) <> 'array' then
    raise exception 'REVIEW_REASONS_ARRAY_REQUIRED' using errcode = '22023';
  end if;

  if jsonb_array_length(p_result->'nodes') > 24
    or jsonb_array_length(p_result->'edges') > 48
    or jsonb_array_length(p_result->'contexts') > 32 then
    raise exception 'RESULT_TOO_LARGE' using errcode = '22023';
  end if;

  select ('[' || string_agg(embedding_value.value, ',' order by embedding_value.ordinality) || ']')::extensions.vector(1536)
  into v_capture_embedding
  from jsonb_array_elements_text(p_result->'captureEmbedding') with ordinality as embedding_value(value, ordinality);

  update public.captures as capture_row
  set embedding = v_capture_embedding,
      updated_at = now()
  where capture_row.id = v_job.capture_id
    and capture_row.workspace_id = v_job.workspace_id;

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

  delete from public.nodes as node_row
  where node_row.workspace_id = v_job.workspace_id
    and node_row.capture_id = v_job.capture_id;

  delete from public.contexts as context_row
  where context_row.workspace_id = v_job.workspace_id
    and context_row.metadata->>'captureId' = v_job.capture_id::text;

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

    v_context_client_id := v_context->>'clientContextId';
    if v_context_map ? v_context_client_id then
      raise exception 'CONTEXT_CLIENT_ID_DUPLICATE' using errcode = '22023';
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

    v_context_map := v_context_map
      || jsonb_build_object(v_context_client_id, v_context_id::text);
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

    if jsonb_typeof(v_node->'embedding') is distinct from 'array'
      or jsonb_array_length(v_node->'embedding') <> 1536
      or exists (
        select 1
        from jsonb_array_elements(v_node->'embedding') as embedding_value(value)
        where jsonb_typeof(embedding_value.value) <> 'number'
      ) then
      raise exception 'NODE_EMBEDDING_INVALID' using errcode = '22023';
    end if;

    select ('[' || string_agg(embedding_value.value, ',' order by embedding_value.ordinality) || ']')::extensions.vector(1536)
    into v_node_embedding
    from jsonb_array_elements_text(v_node->'embedding') with ordinality as embedding_value(value, ordinality);

    if v_node_map ? (v_node->>'clientNodeId') then
      raise exception 'NODE_CLIENT_ID_DUPLICATE' using errcode = '22023';
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
      embedding,
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
      v_node_embedding,
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

    v_node_map := v_node_map
      || jsonb_build_object(v_node->>'clientNodeId', v_node_id::text);

    select coalesce(max(revision_row.revision_number), 0) + 1
    into v_revision_number
    from public.node_revisions as revision_row
    where revision_row.node_id = v_node_id;

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
      if not (v_context_map ? v_context_client_id) then
        raise exception 'NODE_CONTEXT_REFERENCE_INVALID' using errcode = '22023';
      end if;
    end loop;

    insert into public.node_contexts(node_id, context_id, workspace_id)
    select
      v_node_id,
      (v_context_map ->> context_ref.client_id)::uuid,
      v_job.workspace_id
    from jsonb_array_elements_text(
      coalesce(v_node->'contextClientIds', '[]'::jsonb)
    ) as context_ref(client_id)
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

    if not (v_node_map ? (v_edge->>'sourceClientNodeId'))
      or not (v_node_map ? (v_edge->>'targetClientNodeId')) then
      raise exception 'EDGE_NODE_REFERENCE_INVALID' using errcode = '22023';
    end if;

    v_source_node_id :=
      (v_node_map ->> (v_edge->>'sourceClientNodeId'))::uuid;
    v_target_node_id :=
      (v_node_map ->> (v_edge->>'targetClientNodeId'))::uuid;

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

  v_status := case
    when p_review_required then 'needs_review'::public.processing_status
    else 'completed'::public.processing_status
  end;

  update public.job_attempts as attempt_row
  set status = v_status,
      completed_at = now(),
      metadata = attempt_row.metadata
        || jsonb_build_object(
          'confidence', p_confidence,
          'reviewRequired', p_review_required,
          'reviewReasons', coalesce(p_review_reasons, '[]'::jsonb)
        )
  where attempt_row.id = p_attempt_id;

  update public.processing_jobs as processing_job_row
  set status = v_status,
      confidence = least(greatest(coalesce(p_confidence, 0), 0), 1),
      model = p_model,
      prompt_version = p_prompt_version,
      error_message = null,
      lease_expires_at = null,
      claimed_by = null,
      last_heartbeat_at = now(),
      completed_at = case when v_status = 'completed' then now() else processing_job_row.completed_at end,
      metadata = processing_job_row.metadata
        || jsonb_build_object(
          'reviewRequired', p_review_required,
          'reviewReasons', coalesce(p_review_reasons, '[]'::jsonb),
          'nodeCount', v_node_count,
          'edgeCount', v_edge_count,
          'contextCount', v_context_count
        ),
      updated_at = now()
  where processing_job_row.id = p_job_id;

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
  on conflict on constraint outbox_events_dedupe_key_key do nothing;

  return query select p_job_id, v_status, v_node_count, v_edge_count, v_context_count;
end;
$$;

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
  select processing_job_row.*
  into v_job
  from public.processing_jobs as processing_job_row
  where processing_job_row.id = p_job_id
  for update;

  if v_job.id is null then
    raise exception 'JOB_NOT_FOUND' using errcode = '22023';
  end if;

  select attempt_row.*
  into v_attempt
  from public.job_attempts as attempt_row
  where attempt_row.id = p_attempt_id
    and attempt_row.job_id = p_job_id
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
    when v_job.retry_count >= least(v_job.max_attempts, p_max_attempts)
      then 'failed'::public.processing_status
    else 'queued'::public.processing_status
  end;
  v_next_run_at := case
    when v_status = 'queued' then now() + make_interval(secs => greatest(p_retry_delay_seconds, 1))
    else v_job.next_run_at
  end;

  update public.job_attempts as attempt_row
  set status = 'failed',
      completed_at = now(),
      error_message = left(coalesce(p_error_code, 'ANALYSIS_FAILED'), 240),
      metadata = attempt_row.metadata
        || jsonb_build_object(
          'errorCode', left(coalesce(p_error_code, 'ANALYSIS_FAILED'), 120),
          'errorMessage', left(coalesce(p_error_message, ''), 500)
        )
  where attempt_row.id = p_attempt_id
    and attempt_row.job_id = p_job_id;

  update public.processing_jobs as processing_job_row
  set status = v_status,
      error_message = left(coalesce(p_error_code, 'ANALYSIS_FAILED'), 240),
      lease_expires_at = null,
      claimed_by = null,
      next_run_at = v_next_run_at,
      updated_at = now()
  where processing_job_row.id = p_job_id
  returning processing_job_row.* into v_job;

  return query select v_job.id, v_job.status, v_job.retry_count, v_job.next_run_at;
end;
$$;

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
