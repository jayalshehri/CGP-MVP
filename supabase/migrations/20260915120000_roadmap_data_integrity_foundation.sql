begin;

alter table public.cybersecurity_projects
  add column if not exists planned_start_date date,
  add column if not exists forecast_end_date date;

comment on column public.cybersecurity_projects.framework_scope is
  'Legacy display-only field. The canonical source for target controls is cybersecurity_project_controls.';

comment on column public.cybersecurity_projects.planned_start_date is
  'Approved baseline start date used by the cybersecurity roadmap.';

comment on column public.cybersecurity_projects.forecast_end_date is
  'Current forecast completion date; compared with target_end_date for schedule variance.';

create index if not exists cybersecurity_projects_target_date_idx
  on public.cybersecurity_projects (target_end_date)
  where target_end_date is not null and status <> 'completed';

-- Migrate only explicit framework/control codes. Generic statements such as
-- "DCC — applicable controls" are intentionally ignored because they do not
-- identify a verifiable control and must be mapped by an authorised user.
with legacy_lines as (
  select
    project.id as project_id,
    upper(substring(line from '^([A-Za-z]+)')) as framework_code,
    substring(line from '^[A-Za-z]+[[:space:]]+([0-9A-Za-z-]+)') as control_code
  from public.cybersecurity_projects project
  cross join lateral regexp_split_to_table(coalesce(project.framework_scope, ''), E'\\n') as line
), resolved_links as (
  select distinct legacy.project_id, control.id as control_id
  from legacy_lines legacy
  join public.frameworks framework
    on upper(framework.code) = legacy.framework_code
  join public.controls control
    on control.framework_id = framework.id
   and control.control_code = legacy.control_code
  where legacy.control_code is not null
)
insert into public.cybersecurity_project_controls
  (project_id, control_id, relationship_type)
select project_id, control_id, 'coverage'
from resolved_links
on conflict (project_id, control_id) do nothing;

commit;
