-- Durable capture-analysis outbox delivery and poison-message recovery.

grant usage on schema private to service_role;

alter table public.outbox_events
  add column if not exists claimed_by text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_error_code text;

create index if not exists outbox_events_analysis_dispatch_idx
  on public.outbox_events (status, available_at, lease_expires_at, created_at)
  where event_type = 'capture.created'
    and status in ('pending', 'processing');

create or replace function private.claim_analysis_outbox_events(
  p_worker_id text,
  p_limit integer default 10,
  p_lease_seconds integer default 60
)
returns table (
  event_id uuid,
  workspace_id uuid,
  aggregate_id uuid,
  event_type text,
  dedupe_key text,
  payload jsonb,
  attempts integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(p_worker_id), '') is null then
    raise exception 'OUTBOX_WORKER_ID_REQUIRED';
  end if;

  if p_limit < 1 or p_limit > 100 then
    raise exception 'OUTBOX_LIMIT_INVALID';
  end if;

  if p_lease_seconds < 15 or p_lease_seconds > 600 then
    raise exception 'OUTBOX_LEASE_INVALID';
  end if;

  return query
  with candidates as (
    select oe.id
    from public.outbox_events oe
    where oe.event_type = 'capture.created'
      and (
        (oe.status = 'pending' and oe.available_at <= now())
        or (
          oe.status = 'processing'
          and oe.lease_expires_at is not null
          and oe.lease_expires_at <= now()
        )
      )
    order by oe.available_at asc, oe.created_at asc
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.outbox_events oe
    set status = 'processing',
        attempts = oe.attempts + 1,
        claimed_by = p_worker_id,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        last_error_code = null,
        updated_at = now()
    from candidates c
    where oe.id = c.id
    returning oe.*
  )
  select
    c.id,
    c.workspace_id,
    c.aggregate_id,
    c.event_type,
    c.dedupe_key,
    c.payload,
    c.attempts,
    c.created_at
  from claimed c
  order by c.available_at asc, c.created_at asc;
end;
$$;

create or replace function private.mark_analysis_outbox_published(
  p_event_id uuid,
  p_worker_id text,
  p_message_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.outbox_events oe
  set status = 'published',
      published_at = now(),
      claimed_by = null,
      lease_expires_at = null,
      last_error_code = null,
      payload = case
        when p_message_id is null then oe.payload
        else oe.payload || jsonb_build_object('queueMessageId', p_message_id)
      end,
      updated_at = now()
  where oe.id = p_event_id
    and oe.event_type = 'capture.created'
    and oe.status = 'processing'
    and oe.claimed_by = p_worker_id;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function private.claim_analysis_outbox_event_by_job_id(
  p_processing_job_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns table (
  event_id uuid,
  workspace_id uuid,
  aggregate_id uuid,
  event_type text,
  dedupe_key text,
  payload jsonb,
  attempts integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(p_worker_id), '') is null then
    raise exception 'OUTBOX_WORKER_ID_REQUIRED';
  end if;

  if p_lease_seconds < 15 or p_lease_seconds > 600 then
    raise exception 'OUTBOX_LEASE_INVALID';
  end if;

  return query
  with candidate as (
    select oe.id
    from public.outbox_events oe
    where oe.event_type = 'capture.created'
      and oe.payload ->> 'processingJobId' = p_processing_job_id::text
      and (
        (oe.status = 'pending' and oe.available_at <= now())
        or (
          oe.status = 'processing'
          and oe.lease_expires_at is not null
          and oe.lease_expires_at <= now()
        )
      )
    for update skip locked
    limit 1
  ), claimed as (
    update public.outbox_events oe
    set status = 'processing',
        attempts = oe.attempts + 1,
        claimed_by = p_worker_id,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        last_error_code = null,
        updated_at = now()
    from candidate c
    where oe.id = c.id
    returning oe.*
  )
  select
    c.id,
    c.workspace_id,
    c.aggregate_id,
    c.event_type,
    c.dedupe_key,
    c.payload,
    c.attempts,
    c.created_at
  from claimed c;
end;
$$;

create or replace function private.fail_analysis_outbox_event(
  p_event_id uuid,
  p_worker_id text,
  p_error_code text,
  p_retry_delay_seconds integer default 60,
  p_max_attempts integer default 10
)
returns table (
  status text,
  attempts integer,
  available_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(p_error_code), '') is null then
    raise exception 'OUTBOX_ERROR_CODE_REQUIRED';
  end if;

  if p_retry_delay_seconds < 1 or p_retry_delay_seconds > 3600 then
    raise exception 'OUTBOX_RETRY_DELAY_INVALID';
  end if;

  if p_max_attempts < 1 or p_max_attempts > 100 then
    raise exception 'OUTBOX_MAX_ATTEMPTS_INVALID';
  end if;

  return query
  update public.outbox_events oe
  set status = case
        when oe.attempts >= p_max_attempts then 'failed'
        else 'pending'
      end,
      available_at = case
        when oe.attempts >= p_max_attempts then oe.available_at
        else now() + make_interval(secs => p_retry_delay_seconds)
      end,
      claimed_by = null,
      lease_expires_at = null,
      last_error_code = p_error_code,
      updated_at = now()
  where oe.id = p_event_id
    and oe.event_type = 'capture.created'
    and oe.status = 'processing'
    and oe.claimed_by = p_worker_id
  returning oe.status, oe.attempts, oe.available_at;
end;
$$;

create or replace function private.record_analysis_operator_recovery(
  p_job_id uuid,
  p_workspace_id uuid,
  p_capture_id uuid,
  p_error_code text,
  p_delivery_count integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.processing_jobs%rowtype;
begin
  select pj.*
  into v_job
  from public.processing_jobs pj
  where pj.id = p_job_id
    and pj.workspace_id = p_workspace_id
    and pj.capture_id = p_capture_id
  for update;

  if not found then
    return false;
  end if;

  if v_job.status in ('completed', 'needs_review', 'failed') then
    return true;
  end if;

  update public.processing_jobs pj
  set status = 'failed',
      error_message = p_error_code,
      completed_at = now(),
      claimed_by = null,
      lease_expires_at = null,
      last_heartbeat_at = now(),
      metadata = coalesce(pj.metadata, '{}'::jsonb) || jsonb_build_object(
        'operatorRecoveryRequired', true,
        'deliveryCount', p_delivery_count,
        'errorCode', p_error_code,
        'recordedAt', now()
      ),
      updated_at = now()
  where pj.id = p_job_id;

  update public.job_attempts ja
  set status = 'failed',
      completed_at = coalesce(ja.completed_at, now()),
      error_message = coalesce(ja.error_message, p_error_code),
      metadata = coalesce(ja.metadata, '{}'::jsonb) || jsonb_build_object(
        'operatorRecoveryRequired', true,
        'deliveryCount', p_delivery_count,
        'errorCode', p_error_code
      )
  where ja.job_id = p_job_id
    and ja.status = 'running';

  return true;
end;
$$;

create or replace function private.set_processing_job_terminal_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('completed', 'needs_review') and new.completed_at is null then
    new.completed_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists processing_jobs_terminal_completed_at
  on public.processing_jobs;

create trigger processing_jobs_terminal_completed_at
before update of status on public.processing_jobs
for each row
execute function private.set_processing_job_terminal_completed_at();

-- PostgREST exposes the public schema in the deployed project. These thin
-- wrappers keep the implementation private while allowing only service_role
-- to invoke it through supabase-js.
create or replace function public.claim_analysis_outbox_events(
  p_worker_id text,
  p_limit integer default 10,
  p_lease_seconds integer default 60
)
returns table (
  event_id uuid,
  workspace_id uuid,
  aggregate_id uuid,
  event_type text,
  dedupe_key text,
  payload jsonb,
  attempts integer,
  created_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.claim_analysis_outbox_events(
    p_worker_id,
    p_limit,
    p_lease_seconds
  );
$$;

create or replace function public.claim_analysis_outbox_event_by_job_id(
  p_processing_job_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns table (
  event_id uuid,
  workspace_id uuid,
  aggregate_id uuid,
  event_type text,
  dedupe_key text,
  payload jsonb,
  attempts integer,
  created_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.claim_analysis_outbox_event_by_job_id(
    p_processing_job_id,
    p_worker_id,
    p_lease_seconds
  );
$$;

create or replace function public.mark_analysis_outbox_published(
  p_event_id uuid,
  p_worker_id text,
  p_message_id text default null
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.mark_analysis_outbox_published(
    p_event_id,
    p_worker_id,
    p_message_id
  );
$$;

create or replace function public.fail_analysis_outbox_event(
  p_event_id uuid,
  p_worker_id text,
  p_error_code text,
  p_retry_delay_seconds integer default 60,
  p_max_attempts integer default 10
)
returns table (
  status text,
  attempts integer,
  available_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.fail_analysis_outbox_event(
    p_event_id,
    p_worker_id,
    p_error_code,
    p_retry_delay_seconds,
    p_max_attempts
  );
$$;

create or replace function public.record_analysis_operator_recovery(
  p_job_id uuid,
  p_workspace_id uuid,
  p_capture_id uuid,
  p_error_code text,
  p_delivery_count integer
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.record_analysis_operator_recovery(
    p_job_id,
    p_workspace_id,
    p_capture_id,
    p_error_code,
    p_delivery_count
  );
$$;

revoke all on function private.claim_analysis_outbox_events(text, integer, integer)
  from public, anon, authenticated;
revoke all on function private.mark_analysis_outbox_published(uuid, text, text)
  from public, anon, authenticated;
revoke all on function private.claim_analysis_outbox_event_by_job_id(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function private.fail_analysis_outbox_event(uuid, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function private.record_analysis_operator_recovery(uuid, uuid, uuid, text, integer)
  from public, anon, authenticated;
revoke all on function private.set_processing_job_terminal_completed_at()
  from public, anon, authenticated;
revoke all on function public.claim_analysis_outbox_events(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.claim_analysis_outbox_event_by_job_id(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.mark_analysis_outbox_published(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.fail_analysis_outbox_event(uuid, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.record_analysis_operator_recovery(uuid, uuid, uuid, text, integer)
  from public, anon, authenticated;

grant execute on function private.claim_analysis_outbox_events(text, integer, integer)
  to service_role;
grant execute on function private.mark_analysis_outbox_published(uuid, text, text)
  to service_role;
grant execute on function private.claim_analysis_outbox_event_by_job_id(uuid, text, integer)
  to service_role;
grant execute on function private.fail_analysis_outbox_event(uuid, text, text, integer, integer)
  to service_role;
grant execute on function private.record_analysis_operator_recovery(uuid, uuid, uuid, text, integer)
  to service_role;
grant execute on function public.claim_analysis_outbox_events(text, integer, integer)
  to service_role;
grant execute on function public.claim_analysis_outbox_event_by_job_id(uuid, text, integer)
  to service_role;
grant execute on function public.mark_analysis_outbox_published(uuid, text, text)
  to service_role;
grant execute on function public.fail_analysis_outbox_event(uuid, text, text, integer, integer)
  to service_role;
grant execute on function public.record_analysis_operator_recovery(uuid, uuid, uuid, text, integer)
  to service_role;
