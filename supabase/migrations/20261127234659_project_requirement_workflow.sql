-- Scoped, human-entered planning links. Never modifies the regulatory catalog,
-- an existing requirement's controls, or any control / evidence status.
alter table public.cybersecurity_requirements
  add column project_scope_id bigint references public.cybersecurity_projects(id) on delete restrict;

create index cybersecurity_requirements_project_scope_idx
  on public.cybersecurity_requirements(project_scope_id) where project_scope_id is not null;

create function private.guard_project_requirement_scope()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_scope bigint;
begin
  if tg_table_name = 'cybersecurity_requirements' then
    if old.project_scope_id is distinct from new.project_scope_id then
      raise exception using errcode = '23514', message = 'activation_requirement_scope';
    end if;
    return new;
  end if;

  select r.project_scope_id into v_scope
    from public.cybersecurity_requirements r where r.id = new.requirement_id;
  if not found or (v_scope is not null and v_scope <> new.project_id) then
    raise exception using errcode = '23514', message = 'activation_requirement_scope';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_project_requirement_scope() from public, anon, authenticated;

create trigger guard_project_requirement_scope
before insert or update of project_id, requirement_id on public.cybersecurity_project_requirements
for each row execute function private.guard_project_requirement_scope();

create trigger lock_project_requirement_scope
before update of project_scope_id on public.cybersecurity_requirements
for each row execute function private.guard_project_requirement_scope();

create function public.save_project_requirement(
  p_project_id bigint,
  p_requirement_id bigint,
  p_title text,
  p_scope text,
  p_coverage text,
  p_controls jsonb
) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_requirement bigint;
  v_count integer;
  v_added integer;
begin
  if v_actor is null or coalesce(private.current_user_role(), '') not in ('admin', 'cybersecurity_team') then
    raise exception using errcode = '42501', message = 'requirement_role';
  end if;

  perform 1 from public.cybersecurity_projects p
    where p.id = p_project_id and p.archived_at is null for update;
  if not found then
    raise exception using errcode = '22023', message = 'requirement_project';
  end if;

  if p_coverage is null or p_coverage not in ('full','partial','supporting')
     or p_scope is null or length(btrim(p_scope)) not between 1 and 2000
     or jsonb_typeof(p_controls) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'requirement_input';
  end if;
  v_count := jsonb_array_length(p_controls);

  if p_requirement_id is not null then
    if v_count <> 0 or nullif(btrim(p_title), '') is not null then
      raise exception using errcode = '22023', message = 'requirement_input';
    end if;
    select r.id into v_requirement from public.cybersecurity_requirements r
      where r.id = p_requirement_id and r.status = 'active' and r.project_scope_id is null;
    if not found then
      raise exception using errcode = '22023', message = 'requirement_existing';
    end if;
  else
    if p_title is null or length(btrim(p_title)) not between 1 and 160 or v_count > 24 then
      raise exception using errcode = '22023', message = 'requirement_input';
    end if;

    if exists (
      select 1 from jsonb_to_recordset(p_controls) as x(control_id bigint, framework_version text, coverage text, reason text)
      where x.control_id is null or x.framework_version is null
        or x.coverage is null or x.coverage not in ('full','partial','supporting')
        or x.reason is null or length(btrim(x.reason)) not between 1 and 700
    ) or v_count <> (select count(distinct x.control_id) from jsonb_to_recordset(p_controls) as x(control_id bigint)) then
      raise exception using errcode = '22023', message = 'requirement_controls';
    end if;

    insert into public.cybersecurity_requirements
      (requirement_code, title_ar, description_ar, project_scope_id, status, created_by)
    values ('REQ-P' || p_project_id || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
            btrim(p_title), btrim(p_scope), p_project_id, 'active', v_actor)
    returning id into v_requirement;

    insert into public.cybersecurity_requirement_controls
      (requirement_id, control_id, coverage_type, mapping_confidence, notes, created_by)
    select v_requirement, c.id, x.coverage, 'probable', btrim(x.reason), v_actor
      from jsonb_to_recordset(p_controls) as x(control_id bigint, framework_version text, coverage text, reason text)
      join public.controls c on c.id = x.control_id
      join public.frameworks f on f.id = c.framework_id and f.is_active and f.version = x.framework_version;
    get diagnostics v_added = row_count;
    if v_added <> v_count then
      raise exception using errcode = '22023', message = 'requirement_catalog';
    end if;
  end if;

  insert into public.cybersecurity_project_requirements
    (project_id, requirement_id, coverage_type, notes, created_by)
  values (p_project_id, v_requirement, p_coverage, btrim(p_scope), v_actor)
  on conflict (project_id, requirement_id) do nothing;
  if not found then
    raise exception using errcode = '23505', message = 'requirement_duplicate';
  end if;
  return v_requirement;
end;
$$;

revoke all on function public.save_project_requirement(bigint,bigint,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.save_project_requirement(bigint,bigint,text,text,text,jsonb) to authenticated;
