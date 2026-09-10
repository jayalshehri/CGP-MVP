-- NCA Cybersecurity Risk Register template, adapted for CGP workflow.
create table if not exists public.cyber_risks (
  id bigint generated always as identity primary key,
  risk_code text not null unique check (char_length(btrim(risk_code)) between 1 and 50),
  risk_scope text not null check (risk_scope in ('it_assets','business_operations','people')),
  risk_owner text not null check (char_length(btrim(risk_owner)) between 2 and 200),
  identification_date date not null default current_date,
  risk_description text not null,
  risk_cause text not null,
  threat text not null,
  risk_analysis text not null,
  assessment_date date not null default current_date,
  inherent_likelihood smallint not null check (inherent_likelihood between 1 and 5),
  inherent_impact smallint not null check (inherent_impact between 1 and 5),
  inherent_score smallint generated always as (inherent_likelihood * inherent_impact) stored,
  inherent_override text check (inherent_override is null or inherent_override in ('very_low','low','medium','high','critical','not_applicable')),
  treatment_type text not null check (treatment_type in ('mitigate','avoid','transfer','accept')),
  treatment_description text not null,
  treatment_owner text not null,
  action_due_date date,
  residual_risk_description text not null,
  residual_likelihood smallint not null check (residual_likelihood between 1 and 5),
  residual_impact smallint not null check (residual_impact between 1 and 5),
  residual_score smallint generated always as (residual_likelihood * residual_impact) stored,
  next_steps text not null,
  last_assessment_date date not null default current_date,
  notes text,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (assessment_date >= identification_date),
  check (last_assessment_date >= identification_date)
);

create index if not exists cyber_risks_inherent_score_idx on public.cyber_risks(inherent_score desc);
create index if not exists cyber_risks_residual_score_idx on public.cyber_risks(residual_score desc);
create index if not exists cyber_risks_due_date_idx on public.cyber_risks(action_due_date);
create index if not exists cyber_risks_assigned_to_idx on public.cyber_risks(assigned_to);

alter table public.cyber_risks enable row level security;
revoke all on public.cyber_risks from anon, authenticated;
grant select, insert, update, delete on public.cyber_risks to authenticated;

drop policy if exists cyber_risks_read_scoped on public.cyber_risks;
drop policy if exists cyber_risks_team_insert on public.cyber_risks;
drop policy if exists cyber_risks_team_update on public.cyber_risks;
drop policy if exists cyber_risks_admin_delete on public.cyber_risks;

create policy cyber_risks_read_scoped on public.cyber_risks for select to authenticated using (
  (select private.current_user_role()) in ('admin','cybersecurity_team')
  or assigned_to = (select auth.uid())
);
create policy cyber_risks_team_insert on public.cyber_risks for insert to authenticated with check (
  (select private.current_user_role()) in ('admin','cybersecurity_team')
  and created_by = (select auth.uid())
);
create policy cyber_risks_team_update on public.cyber_risks for update to authenticated using (
  (select private.current_user_role()) in ('admin','cybersecurity_team')
) with check ((select private.current_user_role()) in ('admin','cybersecurity_team'));
create policy cyber_risks_admin_delete on public.cyber_risks for delete to authenticated using (
  (select private.current_user_role()) = 'admin'
);
