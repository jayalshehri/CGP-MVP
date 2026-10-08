-- Phase 1: additive portfolio fields. No project UPDATE/DELETE/INSERT.
-- Apply only to the approved Local/CGP-QA environment.
begin;

alter table public.cybersecurity_projects
  add column portfolio_priority text,
  add column execution_year smallint generated always as (
    case portfolio_priority when 'P1' then 1 when 'P2' then 2 when 'P3' then 3 end
  ) stored,
  add column work_type text,
  add column executive_owner_code text,
  add column executive_owner_other text,
  add column duration_value numeric,
  add column duration_unit text,
  add column archived_at timestamptz,
  add column archived_by uuid references auth.users(id),
  add column archive_reason text,
  alter column planned_year drop not null,
  alter column planned_quarter drop not null,
  add constraint portfolio_priority_check check (portfolio_priority in ('P1','P2','P3')),
  add constraint portfolio_work_type_check check (work_type in (
    'technical_project','managed_service','framework_agreement','internal_program',
    'policy_governance','assessment','technical_change','ongoing_activity'
  )),
  add constraint portfolio_owner_check check (executive_owner_code in ('it','cybersecurity','dmo','other')),
  add constraint portfolio_owner_other_check check (
    (executive_owner_code is not distinct from 'other'
      and executive_owner_other is not null and btrim(executive_owner_other) <> '')
    or (executive_owner_code is distinct from 'other' and executive_owner_other is null)
  ),
  add constraint portfolio_duration_check check (
    (duration_value is null and duration_unit is null)
    or (duration_value is not null and duration_value > 0 and duration_value < 'Infinity'::numeric
      and duration_unit is not null and duration_unit in ('day','week','month','year'))
  ),
  add constraint portfolio_archive_check check (
    (archived_at is null and archived_by is null and archive_reason is null)
    or (archived_at is not null and archived_by is not null
      and archive_reason is not null and btrim(archive_reason) <> '')
  );

comment on column public.cybersecurity_projects.portfolio_priority is
  'Canonical portfolio priority P1/P2/P3. NULL means not yet classified; never infer from legacy priority.';
comment on column public.cybersecurity_projects.execution_year is
  'Relative execution year 1/2/3 generated from portfolio_priority; not a calendar year.';
comment on column public.cybersecurity_projects.executive_owner_code is
  'Canonical portfolio executive owner. NULL pending approved classification; legacy executive_owner is retained.';
comment on column public.cybersecurity_projects.work_type is
  'Canonical portfolio work type. NULL pending approved classification; no inferred default.';
comment on column public.cybersecurity_projects.priority is
  'Deprecated legacy high/medium/low priority retained for Phase 2 report compatibility. New register uses portfolio_priority only.';
comment on column public.cybersecurity_projects.executive_owner is
  'Deprecated free-text owner retained unchanged. New register uses executive_owner_code and executive_owner_other.';
comment on column public.cybersecurity_projects.initiative_type is
  'Deprecated legacy classification retained unchanged; new register uses work_type only.';
comment on column public.cybersecurity_projects.planned_year is 'Deprecated calendar year; new register uses generated execution_year.';
comment on column public.cybersecurity_projects.planned_quarter is 'Deprecated; not read or written by the new portfolio register.';
comment on column public.cybersecurity_projects.planned_start_date is 'Deprecated project planning date; preserved for historical reports.';
comment on column public.cybersecurity_projects.actual_start_date is 'Deprecated in the new portfolio UI; historical value preserved.';
comment on column public.cybersecurity_projects.target_end_date is 'Deprecated project planning date; preserved for historical reports.';
comment on column public.cybersecurity_projects.actual_end_date is 'Deprecated in the new portfolio UI; historical value preserved.';
comment on column public.cybersecurity_projects.forecast_end_date is 'Deprecated project forecast date; preserved for historical reports.';
comment on column public.cybersecurity_projects.archived_at is
  'NULL = active portfolio, non-NULL = historical portfolio. Independent of execution status.';

create index cybersecurity_projects_active_portfolio_idx
  on public.cybersecurity_projects (portfolio_priority, status) where archived_at is null;
create index cybersecurity_projects_archived_idx
  on public.cybersecurity_projects (archived_at) where archived_at is not null;
create index cybersecurity_projects_archived_by_idx on public.cybersecurity_projects (archived_by) where archived_by is not null;

-- Preserve project IDs and FK histories; archival is the supported retirement mechanism.
create function private.prevent_project_hard_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Projects must be archived, not deleted' using errcode = '23514';
end;
$$;
revoke all on function private.prevent_project_hard_delete() from public, anon, authenticated;
create trigger prevent_project_hard_delete before delete on public.cybersecurity_projects
  for each row execute function private.prevent_project_hard_delete();

-- Existing project RLS policies, status constraints, dates and FK links are unchanged.
commit;
