-- NCA Data Cybersecurity Controls (DCC-1:2022) assessment and compliance results.
create table if not exists public.dcc_assessment_results (
  id bigint generated always as identity primary key,
  control_id bigint not null references public.controls(id) on delete cascade,
  compliance_status text not null default 'not_implemented' check (compliance_status in ('implemented','partially_implemented','not_implemented','not_applicable')),
  notes text,
  corrective_action text,
  expected_compliance_date date,
  assessed_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(control_id)
);

alter table public.dcc_assessment_results enable row level security;
revoke all on public.dcc_assessment_results from anon, authenticated;
grant select, insert, update, delete on public.dcc_assessment_results to authenticated;

create policy dcc_results_team_all on public.dcc_assessment_results for all to authenticated
using ((select private.current_user_role()) in ('admin','cybersecurity_team'))
with check ((select private.current_user_role()) in ('admin','cybersecurity_team'));

create index if not exists dcc_results_control_status_idx on public.dcc_assessment_results(control_id, compliance_status);
