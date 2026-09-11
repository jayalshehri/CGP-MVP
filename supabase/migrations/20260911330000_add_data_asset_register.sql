create table if not exists public.data_assets (
 id bigint generated always as identity primary key,
 asset_code text not null unique,
 name_ar text not null,
 description text,
 data_owner text not null,
 data_steward text,
 classification text not null default 'internal' check (classification in ('public','internal','confidential','restricted')),
 contains_personal_data boolean not null default false,
 quality_status text not null default 'not_assessed' check (quality_status in ('not_assessed','acceptable','needs_improvement','critical')),
 sharing_status text not null default 'internal_only' check (sharing_status in ('internal_only','approved_for_sharing','restricted')),
 retention_period text,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.data_assets enable row level security;
revoke all on public.data_assets from anon;
grant select,insert,update,delete on public.data_assets to authenticated;
create policy data_assets_team on public.data_assets for all to authenticated using ((select private.current_user_role()) in ('admin','data_governance_team')) with check ((select private.current_user_role()) in ('admin','data_governance_team'));