-- Claim exactly the processing job referenced by a durable queue message.
-- This prevents concurrent queue deliveries from claiming each other's jobs.

create or replace function public.claim_capture_analysis_job_by_id(
  p_job_id uuid,
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
  if p_job_id is null then
    raise exception 'JOB_ID_REQUIRED' using errcode = '22023';
  end if;
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
  where pj.id = p_job_id
    and pj.job_type = 'capture_structure'
    and pj.retry_count < least(pj.max_attempts, p_max_attempts)
    and pj.next_run_at <= now()
    and (
      pj.status = 'queued'
      or (pj.status = 'running' and pj.lease_expires_at is not null
        and pj.lease_expires_at < now())
    )
  for update skip locked
  limit 1;

  if v_candidate_id is null then return; end if;

  if v_reclaimed then
    update public.job_attempts as attempt_row
    set status = 'failed', completed_at = now(), error_message = 'LEASE_EXPIRED',
        metadata = attempt_row.metadata || jsonb_build_object(
          'errorCode', 'LEASE_EXPIRED', 'error_code', 'LEASE_EXPIRED')
    where attempt_row.job_id = v_candidate_id
      and attempt_row.status = 'running';
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

  insert into public.job_attempts as attempt_row (
    workspace_id, job_id, attempt_number, status, started_at, metadata
  ) values (
    v_job.workspace_id, v_job.id, v_job.retry_count, 'running', now(),
    jsonb_build_object(
      'workerId', trim(p_worker_id),
      'model', p_model,
      'promptVersion', p_prompt_version)
  ) returning attempt_row.* into v_attempt;

  return query
  select v_job.id, v_attempt.id, v_attempt.attempt_number,
    v_job.workspace_id, c.id, c.raw_text, c.source_kind, c.title,
    p_model, p_prompt_version
  from public.captures c
  where c.id = v_job.capture_id and c.workspace_id = v_job.workspace_id;
end;
$$;

revoke all on function public.claim_capture_analysis_job_by_id(
  uuid, text, integer, text, text, integer
) from public, anon, authenticated;

grant execute on function public.claim_capture_analysis_job_by_id(
  uuid, text, integer, text, text, integer
) to service_role;
