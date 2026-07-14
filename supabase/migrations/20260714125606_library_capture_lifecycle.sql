-- Capture library lifecycle commands. All state changes are service-role only;
-- the functions still validate the acting user's workspace role as defense in depth.
-- JOB_REGISTRY_PARITY: {"maxManualAttempts":10}

grant select, delete on public.captures to service_role;
grant update (title, updated_at) on public.captures to service_role;
grant select on public.capture_sources to service_role;
grant select on public.workspace_members to service_role;
grant select, delete on public.nodes to service_role;
grant select, delete on public.contexts to service_role;
grant select, update on public.processing_jobs to service_role;

create or replace function public.delete_capture_lifecycle(
  p_capture_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid
)
returns table (
  deleted_capture_id uuid,
  deleted_node_count integer,
  deleted_edge_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_capture public.captures%rowtype;
  v_node_count integer := 0;
  v_edge_count integer := 0;
  v_deleted_count integer := 0;
begin
  select * into v_capture
  from public.captures
  where id = p_capture_id and workspace_id = p_workspace_id
  for update;

  if v_capture.id is null then
    raise exception 'CAPTURE_NOT_FOUND' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = p_actor_user_id
      and wm.role = 'owner'
  ) then
    raise exception 'WORKSPACE_OWNER_REQUIRED' using errcode = '42501';
  end if;

  select count(*)::integer into v_edge_count
  from public.edges e
  where e.workspace_id = p_workspace_id
    and (
      e.source_node_id in (
        select n.id from public.nodes n
        where n.workspace_id = p_workspace_id and n.capture_id = p_capture_id
      )
      or e.target_node_id in (
        select n.id from public.nodes n
        where n.workspace_id = p_workspace_id and n.capture_id = p_capture_id
      )
    );

  delete from public.nodes
  where workspace_id = p_workspace_id and capture_id = p_capture_id;
  get diagnostics v_node_count = row_count;

  -- Analysis contexts are provenance-linked through metadata rather than a
  -- capture foreign key, so the capture cascade cannot remove them.
  delete from public.contexts
  where workspace_id = p_workspace_id
    and metadata->>'captureId' = p_capture_id::text;

  delete from public.captures
  where id = p_capture_id and workspace_id = p_workspace_id;
  get diagnostics v_deleted_count = row_count;

  if v_deleted_count <> 1 then
    raise exception 'CAPTURE_DELETE_FAILED' using errcode = 'P0001';
  end if;

  return query select p_capture_id, v_node_count, v_edge_count;
end;
$$;

create or replace function public.retry_processing_job_lifecycle(
  p_job_id uuid,
  p_workspace_id uuid,
  p_actor_user_id uuid
)
returns table (
  job_id uuid,
  status public.processing_status,
  retry_count integer,
  max_attempts integer,
  next_run_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.processing_jobs%rowtype;
begin
  select * into v_job
  from public.processing_jobs
  where id = p_job_id and workspace_id = p_workspace_id
  for update;

  if v_job.id is null then
    raise exception 'PROCESSING_JOB_NOT_FOUND' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = p_actor_user_id
      and wm.role in ('owner', 'editor')
  ) then
    raise exception 'LIBRARY_WRITE_FORBIDDEN' using errcode = '42501';
  end if;

  if v_job.status not in ('failed', 'needs_review') then
    raise exception 'PROCESSING_JOB_RETRY_NOT_ALLOWED' using errcode = '22023';
  end if;

  if v_job.retry_count >= 10 then
    raise exception 'RETRY_LIMIT_REACHED' using errcode = '22023';
  end if;

  update public.processing_jobs pj
  set status = 'queued',
      max_attempts = greatest(pj.max_attempts, pj.retry_count + 1),
      next_run_at = now(),
      claimed_by = null,
      lease_expires_at = null,
      last_heartbeat_at = null,
      started_at = null,
      completed_at = null,
      error_message = null,
      confidence = null,
      updated_at = now(),
      metadata = coalesce(pj.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'manualRetryCount',
          case
            when coalesce(pj.metadata->>'manualRetryCount', '') ~ '^[0-9]+$'
              then (pj.metadata->>'manualRetryCount')::integer + 1
            else 1
          end,
          'manualRetryRequestedBy', p_actor_user_id,
          'manualRetryRequestedAt', now()
        )
  where pj.id = p_job_id and pj.workspace_id = p_workspace_id
  returning pj.* into v_job;

  return query
  select v_job.id, v_job.status, v_job.retry_count,
         v_job.max_attempts, v_job.next_run_at;
end;
$$;

revoke all on function public.delete_capture_lifecycle(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.retry_processing_job_lifecycle(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_capture_lifecycle(uuid, uuid, uuid)
  to service_role;
grant execute on function public.retry_processing_job_lifecycle(uuid, uuid, uuid)
  to service_role;

-- The original worker claim function promoted every job's max_attempts to the
-- caller cap. That made a high cap unsafe, while a low cap made manually
-- extended jobs permanently unclaimable. Keep the per-row budget authoritative
-- and use p_max_attempts only as a hard safety ceiling.
create or replace function public.claim_capture_analysis_job(
  p_worker_id text,
  p_lease_seconds integer default 120,
  p_model text default null,
  p_prompt_version text default null,
  p_max_attempts integer default 10
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

  select pj.id,
    (pj.status = 'running' and pj.lease_expires_at is not null
      and pj.lease_expires_at < now())
  into v_candidate_id, v_reclaimed
  from public.processing_jobs pj
  where pj.job_type = 'capture_structure'
    and pj.retry_count < least(pj.max_attempts, p_max_attempts)
    and pj.next_run_at <= now()
    and (
      pj.status = 'queued'
      or (pj.status = 'running' and pj.lease_expires_at is not null
        and pj.lease_expires_at < now())
    )
  order by pj.created_at asc
  for update skip locked
  limit 1;

  if v_candidate_id is null then return; end if;

  if v_reclaimed then
    update public.job_attempts
    set status = 'failed', completed_at = now(), error_message = 'LEASE_EXPIRED',
        metadata = metadata || jsonb_build_object(
          'errorCode', 'LEASE_EXPIRED', 'error_code', 'LEASE_EXPIRED')
    where job_id = v_candidate_id and status = 'running';
  end if;

  update public.processing_jobs pj
  set status = 'running',
      claimed_by = trim(p_worker_id),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      last_heartbeat_at = now(),
      started_at = coalesce(pj.started_at, now()),
      retry_count = pj.retry_count + 1,
      model = p_model,
      prompt_version = p_prompt_version,
      updated_at = now()
  where pj.id = v_candidate_id
  returning pj.* into v_job;

  if v_job.id is null then return; end if;

  insert into public.job_attempts (
    workspace_id, job_id, attempt_number, status, started_at, metadata
  ) values (
    v_job.workspace_id, v_job.id, v_job.retry_count, 'running', now(),
    jsonb_build_object(
      'workerId', trim(p_worker_id),
      'model', p_model,
      'promptVersion', p_prompt_version)
  ) returning * into v_attempt;

  return query
  select v_job.id, v_attempt.id, v_attempt.attempt_number,
    v_job.workspace_id, c.id, c.raw_text, c.source_kind, c.title,
    p_model, p_prompt_version
  from public.captures c
  where c.id = v_job.capture_id and c.workspace_id = v_job.workspace_id;
end;
$$;

revoke all on function public.claim_capture_analysis_job(text, integer, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_capture_analysis_job(text, integer, text, text, integer)
  to service_role;
