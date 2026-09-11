-- Shared control catalog keeps one canonical control across regulatory frameworks.
create table if not exists public.shared_controls (
  id bigint generated always as identity primary key,
  shared_control_code text not null unique,
  title_ar text not null,
  description text,
  source_reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.shared_control_framework_mappings (
  id bigint generated always as identity primary key,
  shared_control_id bigint not null references public.shared_controls(id) on delete cascade,
  cyber_control_id bigint references public.controls(id) on delete cascade,
  data_governance_control_id bigint references public.data_governance_controls(id) on delete cascade,
  framework_code text not null,
  control_code text not null,
  control_title_ar text not null,
  relationship_type text not null check (relationship_type in ('equivalent','partial','candidate')),
  validation_status text not null default 'pending' check (validation_status in ('validated','pending','rejected')),
  source_reference text,
  created_by uuid not null default auth.uid() references public.profiles(user_id),
  created_at timestamptz not null default now(),
  constraint shared_control_mapping_exactly_one_target check ((cyber_control_id is not null and data_governance_control_id is null) or (cyber_control_id is null and data_governance_control_id is not null))
);
create unique index if not exists shared_control_cyber_target_idx on public.shared_control_framework_mappings(shared_control_id, cyber_control_id) where cyber_control_id is not null;
create unique index if not exists shared_control_data_target_idx on public.shared_control_framework_mappings(shared_control_id, data_governance_control_id) where data_governance_control_id is not null;
create index if not exists shared_control_mappings_framework_idx on public.shared_control_framework_mappings(framework_code, validation_status);

alter table public.shared_controls enable row level security;
alter table public.shared_control_framework_mappings enable row level security;
revoke all on public.shared_controls, public.shared_control_framework_mappings from anon;
grant select, insert, update, delete on public.shared_controls, public.shared_control_framework_mappings to authenticated;
create policy shared_controls_read on public.shared_controls for select to authenticated using ((select private.current_user_role()) in ('admin','cybersecurity_team','data_governance_team'));
create policy shared_controls_write on public.shared_controls for all to authenticated using ((select private.current_user_role()) = 'admin') with check ((select private.current_user_role()) = 'admin');
create policy shared_control_mappings_read on public.shared_control_framework_mappings for select to authenticated using ((select private.current_user_role()) in ('admin','cybersecurity_team','data_governance_team'));
create policy shared_control_mappings_create on public.shared_control_framework_mappings for insert to authenticated with check ((select private.current_user_role()) in ('admin','cybersecurity_team','data_governance_team') and created_by = (select auth.uid()));
create policy shared_control_mappings_manage on public.shared_control_framework_mappings for update to authenticated using ((select private.current_user_role()) = 'admin') with check ((select private.current_user_role()) = 'admin');
create policy shared_control_mappings_delete on public.shared_control_framework_mappings for delete to authenticated using ((select private.current_user_role()) = 'admin');

insert into public.shared_controls (shared_control_code, title_ar, source_reference)
select distinct 'SC-CY-' || source.id, source.title_ar, link.source_note
from public.control_framework_links link join public.controls source on source.id = link.source_control_id
on conflict (shared_control_code) do nothing;

insert into public.shared_control_framework_mappings (shared_control_id, cyber_control_id, framework_code, control_code, control_title_ar, relationship_type, validation_status, source_reference, created_by)
select shared.id, source.id, framework.code, source.control_code, source.title_ar, 'equivalent', 'validated', link.source_note, coalesce((select user_id from public.profiles where role = 'admin' and is_active limit 1), source.control_owner_id)
from public.control_framework_links link join public.controls source on source.id = link.source_control_id join public.frameworks framework on framework.id = source.framework_id join public.shared_controls shared on shared.shared_control_code = 'SC-CY-' || source.id
on conflict do nothing;

insert into public.shared_control_framework_mappings (shared_control_id, cyber_control_id, framework_code, control_code, control_title_ar, relationship_type, validation_status, source_reference, created_by)
select shared.id, target.id, framework.code, target.control_code, target.title_ar, case when link.relationship_type = 'equivalent' then 'equivalent' else 'partial' end, 'validated', link.source_note, coalesce((select user_id from public.profiles where role = 'admin' and is_active limit 1), target.control_owner_id)
from public.control_framework_links link join public.controls source on source.id = link.source_control_id join public.controls target on target.id = link.target_control_id join public.frameworks framework on framework.id = target.framework_id join public.shared_controls shared on shared.shared_control_code = 'SC-CY-' || source.id
on conflict do nothing;
