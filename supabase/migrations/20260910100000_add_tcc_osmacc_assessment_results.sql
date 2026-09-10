-- NCA TCC-1:2021 and OSMACC-1:2021 assessment and compliance results.
create table if not exists public.tcc_assessment_results (
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

create table if not exists public.osmacc_assessment_results (
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

alter table public.tcc_assessment_results enable row level security;
alter table public.osmacc_assessment_results enable row level security;
revoke all on public.tcc_assessment_results, public.osmacc_assessment_results from anon, authenticated;
grant select, insert, update, delete on public.tcc_assessment_results, public.osmacc_assessment_results to authenticated;

create policy tcc_results_team_all on public.tcc_assessment_results for all to authenticated
using ((select private.current_user_role()) in ('admin','cybersecurity_team'))
with check ((select private.current_user_role()) in ('admin','cybersecurity_team'));

create policy osmacc_results_team_all on public.osmacc_assessment_results for all to authenticated
using ((select private.current_user_role()) in ('admin','cybersecurity_team'))
with check ((select private.current_user_role()) in ('admin','cybersecurity_team'));

create index if not exists tcc_results_control_status_idx on public.tcc_assessment_results(control_id, compliance_status);
create index if not exists osmacc_results_control_status_idx on public.osmacc_assessment_results(control_id, compliance_status);
