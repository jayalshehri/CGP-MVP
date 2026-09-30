-- P2-B3: restore the read-only legacy assessment boundary after broad QA grants.
-- Historical result rows and the unified assessment workflow are not changed.
begin;
set local lock_timeout = '10s';

do $gate$
begin
  if exists (
    select 1 from pg_policies p
    where p.schemaname = 'public'
      and p.tablename in ('cscc_assessment_results', 'dcc_assessment_results',
                          'tcc_assessment_results', 'osmacc_assessment_results')
      and p.policyname not in (
        'cscc_results_team_all', 'dcc_results_team_all',
        'tcc_results_team_all', 'osmacc_results_team_all',
        'cscc_results_team_read', 'dcc_results_team_read',
        'tcc_results_team_read', 'osmacc_results_team_read'
      )
  ) then
    raise exception 'Unexpected legacy assessment policy; review before promotion';
  end if;

  if not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'assessment_cycles'
      and p.policyname = 'assessment_cycle_read' and p.cmd = 'SELECT'
      and p.qual = 'private.assessment_can_read(id)'
  ) then
    raise exception 'Assessment cycle read scope changed; review before promotion';
  end if;
end
$gate$;

alter table public.cscc_assessment_results enable row level security;
alter table public.dcc_assessment_results enable row level security;
alter table public.tcc_assessment_results enable row level security;
alter table public.osmacc_assessment_results enable row level security;

drop policy if exists cscc_results_team_all on public.cscc_assessment_results;
drop policy if exists dcc_results_team_all on public.dcc_assessment_results;
drop policy if exists tcc_results_team_all on public.tcc_assessment_results;
drop policy if exists osmacc_results_team_all on public.osmacc_assessment_results;
drop policy if exists cscc_results_team_read on public.cscc_assessment_results;
drop policy if exists dcc_results_team_read on public.dcc_assessment_results;
drop policy if exists tcc_results_team_read on public.tcc_assessment_results;
drop policy if exists osmacc_results_team_read on public.osmacc_assessment_results;

create policy cscc_results_team_read on public.cscc_assessment_results
  for select to authenticated
  using ((select private.current_user_role()) in ('admin', 'cybersecurity_team'));
create policy dcc_results_team_read on public.dcc_assessment_results
  for select to authenticated
  using ((select private.current_user_role()) in ('admin', 'cybersecurity_team'));
create policy tcc_results_team_read on public.tcc_assessment_results
  for select to authenticated
  using ((select private.current_user_role()) in ('admin', 'cybersecurity_team'));
create policy osmacc_results_team_read on public.osmacc_assessment_results
  for select to authenticated
  using ((select private.current_user_role()) in ('admin', 'cybersecurity_team'));

revoke all privileges on public.cscc_assessment_results,
  public.dcc_assessment_results, public.tcc_assessment_results,
  public.osmacc_assessment_results from public, anon, authenticated;
grant select on public.cscc_assessment_results,
  public.dcc_assessment_results, public.tcc_assessment_results,
  public.osmacc_assessment_results to authenticated;

-- Restore the original column-level cycle grant. In particular, the approved
-- snapshot is not an ordinary Data API column for authenticated users.
revoke all privileges on public.assessment_cycles from public, anon, authenticated;
revoke select (approved_snapshot) on public.assessment_cycles
  from public, anon, authenticated;
grant select (
  id, framework_id, framework_version, scope_name, system_id,
  previous_cycle_id, status, assessor_id, reviewer_id, approver_id,
  due_date, next_review_date, scope_confirmed_at, scope_reason, revision,
  imported, created_by, created_at, approved_by, approved_at
) on public.assessment_cycles to authenticated;

do $verify$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cscc_assessment_results', 'dcc_assessment_results',
    'tcc_assessment_results', 'osmacc_assessment_results'
  ] loop
    if has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
       or has_table_privilege('anon', format('public.%I', table_name), 'INSERT')
       or has_table_privilege('anon', format('public.%I', table_name), 'UPDATE')
       or has_table_privilege('anon', format('public.%I', table_name), 'DELETE')
       or not has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE')
       or not has_table_privilege('service_role', format('public.%I', table_name), 'SELECT')
       or not has_table_privilege('service_role', format('public.%I', table_name), 'INSERT')
       or not has_table_privilege('service_role', format('public.%I', table_name), 'UPDATE')
       or not has_table_privilege('service_role', format('public.%I', table_name), 'DELETE')
    then
      raise exception 'Legacy assessment grants did not reach the certified state: %', table_name;
    end if;
  end loop;

  if exists (
    select 1 from pg_policies p
    where p.schemaname = 'public'
      and p.tablename in ('cscc_assessment_results', 'dcc_assessment_results',
                          'tcc_assessment_results', 'osmacc_assessment_results')
      and p.cmd <> 'SELECT'
  ) then
    raise exception 'Legacy assessment write policy remains';
  end if;

  if has_column_privilege('authenticated', 'public.assessment_cycles',
                          'approved_snapshot', 'SELECT')
     or has_column_privilege('anon', 'public.assessment_cycles',
                             'approved_snapshot', 'SELECT')
     or not has_column_privilege('authenticated', 'public.assessment_cycles',
                                 'scope_name', 'SELECT')
     or not has_column_privilege('authenticated', 'public.assessment_cycles',
                                 'approved_at', 'SELECT')
  then
    raise exception 'Assessment cycle column grants did not reach the certified state';
  end if;

  if exists (
    select 1 from pg_policies p
    where p.schemaname = 'public'
      and p.tablename in ('assessment_cycles', 'assessment_items',
                          'assessment_item_evidence', 'assessment_findings')
      and p.cmd <> 'SELECT'
  ) then
    raise exception 'Unified assessment direct-write policy detected';
  end if;
end
$verify$;

commit;
