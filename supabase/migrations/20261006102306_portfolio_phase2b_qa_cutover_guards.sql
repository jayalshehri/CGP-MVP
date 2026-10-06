-- Phase 2B-1, approved QA only. Schema guards; no portfolio cutover data here.
begin;
alter table public.portfolio_mapping_reviews
  add column source_error boolean not null default false,
  add constraint portfolio_source_error_check check (
    not source_error or (match_status='needs_review' and review_status='pending'
      and control_id is null and requirement_id is null
      and nullif(btrim(decision_note),'') is not null)
  );
alter table public.cybersecurity_project_controls
  add column mapping_review_id uuid unique references public.portfolio_mapping_reviews(id);
alter table public.cybersecurity_projects
  add column mapping_reference_count integer not null default 0,
  add column mapping_exact_count integer not null default 0,
  add column mapping_source_error_count integer not null default 0,
  add column mapping_completeness text generated always as (
    case when mapping_source_error_count>0 then 'source_error'
         when mapping_exact_count=0 then 'mapping_pending'
         when mapping_exact_count=mapping_reference_count then 'verified'
         else 'partially_mapped' end
  ) stored,
  add constraint portfolio_mapping_counts_check check (
    mapping_reference_count>=0 and mapping_exact_count>=0 and mapping_source_error_count>=0
    and mapping_exact_count+mapping_source_error_count<=mapping_reference_count
  );
comment on column public.cybersecurity_projects.mapping_completeness is
  'Reference reconciliation only, not implementation or compliance. Source errors take precedence; counts are derived from staging and actual approved links.';
create unique index cybersecurity_projects_active_name_uidx
  on public.cybersecurity_projects(name_ar) where archived_at is null;

drop trigger block_portfolio_import_phase1 on public.cybersecurity_projects;
drop function private.block_portfolio_import_phase1();
create function private.guard_portfolio_activation() returns trigger
language plpgsql set search_path='' as $$
declare s public.portfolio_import_projects; b public.portfolio_import_batches;
begin
  if tg_op='UPDATE' and new.import_staging_id is distinct from old.import_staging_id then
    raise exception 'Import provenance is immutable' using errcode='23514';
  end if;
  if tg_op='INSERT' and new.import_staging_id is not null then
    select * into s from public.portfolio_import_projects where id=new.import_staging_id;
    select * into b from public.portfolio_import_batches where id=s.batch_id;
    if s.id is null or b.status is distinct from 'validated' or
      row(new.name_ar,new.portfolio_priority,new.duration_value,new.duration_unit,new.work_type,new.executive_owner_code,new.executive_owner_other,new.status)
      is distinct from row(s.source_project_name,s.priority,s.duration_value,s.duration_unit,s.work_type,s.executive_owner_code,s.executive_owner_other,s.status)
      or s.work_type is null or s.executive_owner_code is null then
      raise exception 'Activation requires the validated, classified source row exactly' using errcode='23514';
    end if;
    if new.planned_year is not null or new.planned_quarter is not null or
       new.planned_start_date is not null or new.actual_start_date is not null or
       new.target_end_date is not null or new.actual_end_date is not null or
       new.forecast_end_date is not null or new.executive_owner is not null then
      raise exception 'Deprecated portfolio planning fields must remain empty on import' using errcode='23514';
    end if;
  end if;
  -- Never accept client-supplied completeness counts. Existing manual/legacy
  -- projects have no source reconciliation denominator and remain pending.
  select count(*),count(*) filter(where r.source_error),
    count(*) filter(where not r.source_error and r.match_status='exact_match' and r.review_status='approved'
      and exists(select 1 from public.cybersecurity_project_controls l
        where l.project_id=new.id and l.control_id=r.control_id and l.mapping_review_id=r.id))
    into new.mapping_reference_count,new.mapping_source_error_count,new.mapping_exact_count
    from public.portfolio_mapping_reviews r where r.staged_project_id=new.import_staging_id;
  return new;
end; $$;
revoke all on function private.guard_portfolio_activation() from public,anon,authenticated;
create trigger guard_portfolio_activation before insert or update on public.cybersecurity_projects
  for each row execute function private.guard_portfolio_activation();

create function private.guard_portfolio_exact_link() returns trigger
language plpgsql set search_path='' as $$
declare staged uuid;
begin
  select import_staging_id into staged from public.cybersecurity_projects where id=new.project_id;
  if staged is not null or new.mapping_review_id is not null then
    if not exists(select 1 from public.portfolio_mapping_reviews r
      join public.controls c on c.id=r.control_id join public.frameworks f on f.id=c.framework_id
      where r.id=new.mapping_review_id and r.staged_project_id=staged and r.control_id=new.control_id
        and r.target_type='control' and r.match_status='exact_match' and r.review_status='approved'
        and not r.source_error and f.is_active and f.code=r.source_framework and c.control_code=r.source_control_code) then
      raise exception 'Imported projects accept only approved exact control mappings' using errcode='23514';
    end if;
  end if;
  return new;
end; $$;
revoke all on function private.guard_portfolio_exact_link() from public,anon,authenticated;
create trigger guard_portfolio_exact_link before insert or update on public.cybersecurity_project_controls
  for each row execute function private.guard_portfolio_exact_link();

create function private.guard_activated_portfolio_review() returns trigger
language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.cybersecurity_project_controls where mapping_review_id=old.id)
     and (tg_op='DELETE' or to_jsonb(new) is distinct from to_jsonb(old)) then
    raise exception 'Remove the active link before changing its approved review' using errcode='23514';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function private.guard_activated_portfolio_review() from public,anon,authenticated;
create trigger guard_activated_portfolio_review before update or delete on public.portfolio_mapping_reviews
  for each row execute function private.guard_activated_portfolio_review();

create function private.refresh_portfolio_mapping_counts() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_table_name='cybersecurity_project_controls' then
    if tg_op<>'INSERT' then update public.cybersecurity_projects set mapping_exact_count=0 where id=old.project_id and import_staging_id is not null; end if;
    if tg_op<>'DELETE' then update public.cybersecurity_projects set mapping_exact_count=0 where id=new.project_id and import_staging_id is not null; end if;
  else
    if tg_op<>'INSERT' then update public.cybersecurity_projects set mapping_exact_count=0 where import_staging_id=old.staged_project_id; end if;
    if tg_op<>'DELETE' then update public.cybersecurity_projects set mapping_exact_count=0 where import_staging_id=new.staged_project_id; end if;
  end if;
  return null;
end; $$;
revoke all on function private.refresh_portfolio_mapping_counts() from public,anon,authenticated;
create trigger refresh_portfolio_mapping_counts after insert or update or delete on public.cybersecurity_project_controls
  for each row execute function private.refresh_portfolio_mapping_counts();
create trigger refresh_portfolio_mapping_counts after insert or update or delete on public.portfolio_mapping_reviews
  for each row execute function private.refresh_portfolio_mapping_counts();
comment on column public.cybersecurity_projects.import_staging_id is
  'Unique immutable provenance. Phase 2 activation requires exact validated staging data; ordinary project edits remain available.';
commit;
