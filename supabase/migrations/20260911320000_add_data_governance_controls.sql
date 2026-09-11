create table if not exists public.data_governance_controls (
 id bigint generated always as identity primary key,
 domain_id bigint not null references public.data_governance_domains(id) on delete cascade,
 control_code text not null unique,
 title_ar text not null check (char_length(btrim(title_ar)) between 3 and 240),
 description text,
 priority smallint check (priority between 1 and 3),
 implementation_status text not null default 'not_started' check (implementation_status in ('not_started','in_progress','implemented','not_applicable')),
 owner_name text,
 steward_name text,
 due_date date,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists data_governance_controls_domain_idx on public.data_governance_controls(domain_id);
alter table public.data_governance_controls enable row level security;
revoke all on public.data_governance_controls from anon;
grant select,insert,update,delete on public.data_governance_controls to authenticated;
create policy data_controls_read on public.data_governance_controls for select to authenticated using ((select private.current_user_role()) in ('admin','data_governance_team'));
create policy data_controls_write on public.data_governance_controls for all to authenticated using ((select private.current_user_role()) in ('admin','data_governance_team')) with check ((select private.current_user_role()) in ('admin','data_governance_team'));