create table if not exists public.cscc_systems (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 2 and 200),
  system_category text not null,
  description text,
  asset_count integer not null default 0 check (asset_count >= 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.cscc_assessment_results (
  id bigint generated always as identity primary key,
  system_id bigint not null references public.cscc_systems(id) on delete cascade,
  control_id bigint not null references public.controls(id) on delete cascade,
  compliance_status text not null default 'not_implemented' check (compliance_status in ('implemented','partially_implemented','not_implemented','not_applicable')),
  notes text,
  corrective_action text,
  expected_compliance_date date,
  assessed_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(system_id, control_id)
);

alter table public.cscc_systems enable row level security;
alter table public.cscc_assessment_results enable row level security;
revoke all on public.cscc_systems, public.cscc_assessment_results from anon, authenticated;
grant select, insert, update, delete on public.cscc_systems to authenticated;
grant select, insert, update, delete on public.cscc_assessment_results to authenticated;

create policy cscc_systems_team_all on public.cscc_systems for all to authenticated
using ((select private.current_user_role()) in ('admin','cybersecurity_team'))
with check ((select private.current_user_role()) in ('admin','cybersecurity_team'));
create policy cscc_results_team_all on public.cscc_assessment_results for all to authenticated
using ((select private.current_user_role()) in ('admin','cybersecurity_team'))
with check ((select private.current_user_role()) in ('admin','cybersecurity_team'));

create index if not exists cscc_results_system_idx on public.cscc_assessment_results(system_id, compliance_status);
