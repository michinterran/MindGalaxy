-- Apply a capture's folder and manual topics as one transaction.
-- Only service_role may invoke this security-definer boundary; the actor id is
-- checked explicitly against workspace membership before any mutation occurs.

create or replace function public.update_capture_organization(
  p_capture_id uuid,
  p_actor_user_id uuid,
  p_folder_id_provided boolean default false,
  p_folder_id uuid default null,
  p_topic_ids uuid[] default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  select c.workspace_id
  into v_workspace_id
  from public.captures c
  where c.id = p_capture_id
  for update;

  if v_workspace_id is null then
    raise exception 'ORGANIZATION_RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = v_workspace_id
      and wm.user_id = p_actor_user_id
      and wm.role in ('owner', 'editor')
  ) then
    raise exception 'ORGANIZATION_WRITE_FORBIDDEN' using errcode = '42501';
  end if;

  if p_folder_id_provided and p_folder_id is not null and not exists (
    select 1 from public.folders f
    where f.id = p_folder_id and f.workspace_id = v_workspace_id
  ) then
    raise exception 'ORGANIZATION_RESOURCE_NOT_FOUND' using errcode = '23503';
  end if;

  if p_topic_ids is not null and exists (
    select 1
    from unnest(p_topic_ids) requested(topic_id)
    left join public.contexts c
      on c.id = requested.topic_id
     and c.workspace_id = v_workspace_id
     and c.kind = 'topic'
    where c.id is null
  ) then
    raise exception 'ORGANIZATION_RESOURCE_NOT_FOUND' using errcode = '23503';
  end if;

  if p_folder_id_provided then
    update public.captures
    set folder_id = p_folder_id, updated_at = now()
    where id = p_capture_id and workspace_id = v_workspace_id;
  end if;

  if p_topic_ids is not null then
    delete from public.capture_topics
    where capture_id = p_capture_id and workspace_id = v_workspace_id;

    insert into public.capture_topics (
      capture_id,
      topic_context_id,
      workspace_id,
      topic_kind,
      assigned_by
    )
    select
      p_capture_id,
      topic_id,
      v_workspace_id,
      'topic'::public.context_kind,
      p_actor_user_id
    from (select distinct unnest(p_topic_ids) as topic_id) requested;
  end if;

  return true;
end;
$$;

revoke all on function public.update_capture_organization(uuid, uuid, boolean, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.update_capture_organization(uuid, uuid, boolean, uuid, uuid[])
  to service_role;
