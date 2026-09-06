create table if not exists public.third_parties (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 2 and 200),
  service text not null check (char_length(btrim(service)) between 2 and 300),
  relationship_owner text,
  data_classification text not null default 'internal' check (data_classification in ('public','internal','confidential','restricted')),
  criticality text not null default 'medium' check (criticality in ('low','medium','high','critical')),
  inherent_risk_score smallint not null default 3 check (inherent_risk_score between 1 and 5),
  control_effectiveness smallint not null default 3 check (control_effectiveness between 1 and 5),
  assessment_status text not null default 'draft' check (assessment_status in ('draft','in_review','completed','expired')),
  decision text not null default 'pending' check (decision in ('pending','approved','conditional','rejected')),
  treatment_plan text,
  next_review_date date,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists third_parties_risk_idx on public.third_parties(criticality,assessment_status,next_review_date);
alter table public.third_parties enable row level security;
revoke all on public.third_parties from anon, authenticated;
grant select, insert, update on public.third_parties to authenticated;
drop policy if exists third_parties_team_read on public.third_parties;
create policy third_parties_team_read on public.third_parties for select to authenticated using ((select private.current_user_role()) in ('admin','cybersecurity_team'));
drop policy if exists third_parties_team_insert on public.third_parties;
create policy third_parties_team_insert on public.third_parties for insert to authenticated with check ((select private.current_user_role()) in ('admin','cybersecurity_team') and created_by=(select auth.uid()));
drop policy if exists third_parties_team_update on public.third_parties;
create policy third_parties_team_update on public.third_parties for update to authenticated using ((select private.current_user_role()) in ('admin','cybersecurity_team')) with check ((select private.current_user_role()) in ('admin','cybersecurity_team'));
