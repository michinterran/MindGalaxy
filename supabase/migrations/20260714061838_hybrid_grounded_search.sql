-- Step 4: Hybrid grounded search MVP.
-- SEARCH_REGISTRY_PARITY: {"maxLimit":20,"queryMaxChars":500,"snippetMaxChars":500,"embeddingDimensions":1536,"semanticCandidateThreshold":0.2,"weights":{"lexical":0.45,"semantic":0.45,"graph":0.1}}
-- These constants are duplicated intentionally at the SQL boundary because
-- Postgres functions cannot import TypeScript SEARCH_REGISTRY at runtime.

alter table public.nodes
  add column if not exists search_document tsvector generated always as (
    to_tsvector(
      'simple'::regconfig,
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(evidence_snippet, '')
    )
  ) stored;

alter table public.captures
  add column if not exists search_document tsvector generated always as (
    to_tsvector(
      'simple'::regconfig,
      coalesce(title, '') || ' ' ||
      coalesce(raw_text, '')
    )
  ) stored;

create index if not exists nodes_search_document_gin_idx
  on public.nodes using gin(search_document);

create index if not exists captures_search_document_gin_idx
  on public.captures using gin(search_document);

create or replace function public.search_workspace_knowledge(
  p_workspace_id uuid,
  p_query text,
  p_query_embedding extensions.vector(1536) default null,
  p_limit integer default 10
)
returns table (
  result_id text,
  source_type text,
  title text,
  snippet text,
  evidence text,
  node_kind public.node_kind,
  capture_id uuid,
  lexical_score double precision,
  semantic_score double precision,
  graph_score double precision,
  final_score double precision
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_query text := trim(coalesce(p_query, ''));
  v_limit integer := coalesce(p_limit, 10);
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if p_workspace_id is null then
    raise exception 'WORKSPACE_REQUIRED' using errcode = '22023';
  end if;

  if char_length(v_query) < 2 or char_length(v_query) > 500 then
    raise exception 'QUERY_LENGTH_INVALID' using errcode = '22023';
  end if;

  if v_limit < 1 or v_limit > 20 then
    raise exception 'LIMIT_INVALID' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = v_user_id
  ) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;

  return query
  with query_terms as (
    select websearch_to_tsquery('simple'::regconfig, v_query) as tsq
  ),
  node_candidates as (
    select
      'node:' || n.id::text as result_id,
      'node'::text as source_type,
      n.title,
      left(coalesce(nullif(n.summary, ''), nullif(n.evidence_snippet, ''), n.title), 500) as snippet,
      left(coalesce(n.evidence_snippet, ''), 500) as evidence,
      n.kind as node_kind,
      n.capture_id,
      least(1::double precision, coalesce(ts_rank_cd(n.search_document, qt.tsq), 0)::double precision) as lexical_score,
      case
        when p_query_embedding is null or n.embedding is null then 0::double precision
        else greatest(0::double precision, least(1::double precision, 1::double precision - (n.embedding OPERATOR(extensions.<=>) p_query_embedding)))
      end as semantic_score,
      least(
        1::double precision,
        (
          select count(*)::double precision / 6::double precision
          from public.edges e
          where e.workspace_id = n.workspace_id
            and (e.source_node_id = n.id or e.target_node_id = n.id)
        )
      ) as graph_score
    from public.nodes n
    cross join query_terms qt
    where n.workspace_id = p_workspace_id
      and (
        n.search_document @@ qt.tsq
        or (
          p_query_embedding is not null
          and n.embedding is not null
          and greatest(0::double precision, 1::double precision - (n.embedding OPERATOR(extensions.<=>) p_query_embedding)) > 0.20
        )
      )
  ),
  capture_candidates as (
    select
      'capture:' || c.id::text as result_id,
      'capture'::text as source_type,
      coalesce(c.title, '') as title,
      left(c.raw_text, 500) as snippet,
      null::text as evidence,
      null::public.node_kind as node_kind,
      c.id as capture_id,
      least(1::double precision, coalesce(ts_rank_cd(c.search_document, qt.tsq), 0)::double precision) as lexical_score,
      case
        when p_query_embedding is null or c.embedding is null then 0::double precision
        else greatest(0::double precision, least(1::double precision, 1::double precision - (c.embedding OPERATOR(extensions.<=>) p_query_embedding)))
      end as semantic_score,
      least(
        1::double precision,
        (
          select count(*)::double precision / 8::double precision
          from public.nodes n
          where n.workspace_id = c.workspace_id
            and n.capture_id = c.id
        )
      ) as graph_score
    from public.captures c
    cross join query_terms qt
    where c.workspace_id = p_workspace_id
      and (
        c.search_document @@ qt.tsq
        or (
          p_query_embedding is not null
          and c.embedding is not null
          and greatest(0::double precision, 1::double precision - (c.embedding OPERATOR(extensions.<=>) p_query_embedding)) > 0.20
        )
      )
  ),
  unified as (
    select * from node_candidates
    union all
    select * from capture_candidates
  )
  select
    u.result_id,
    u.source_type,
    u.title,
    u.snippet,
    nullif(u.evidence, '') as evidence,
    u.node_kind,
    u.capture_id,
    u.lexical_score,
    u.semantic_score,
    u.graph_score,
    (
      u.lexical_score * 0.45::double precision +
      u.semantic_score * 0.45::double precision +
      u.graph_score * 0.10::double precision
    ) as final_score
  from unified u
  order by final_score desc, lexical_score desc, semantic_score desc, result_id asc
  limit v_limit;
end;
$$;

revoke all on function public.search_workspace_knowledge(
  uuid,
  text,
  extensions.vector,
  integer
) from public, anon, authenticated;

grant execute on function public.search_workspace_knowledge(
  uuid,
  text,
  extensions.vector,
  integer
) to authenticated;

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
  v_capture_embedding extensions.vector(1536);
  v_node_embedding extensions.vector(1536);
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

  update public.captures
  set embedding = v_capture_embedding,
      updated_at = now()
  where id = v_job.capture_id
    and workspace_id = v_job.workspace_id;

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
