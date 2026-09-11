-- CGP asset register aligned to NCA asset-management requirements.
create table if not exists public.assets (
  id bigint generated always as identity primary key,
  asset_code text not null unique check (char_length(btrim(asset_code)) between 2 and 80),
  name_ar text not null check (char_length(btrim(name_ar)) between 2 and 200),
  description text,
  asset_type text not null check (asset_type in ('application','server','database','network','cloud_service','endpoint','ot_system','social_account','other')),
  business_owner text not null check (char_length(btrim(business_owner)) between 2 and 200),
  technical_owner text,
  environment text not null default 'production' check (environment in ('production','staging','testing','development','other')),
  data_classification text not null default 'internal' check (data_classification in ('public','internal','confidential','restricted')),
  criticality text not null default 'medium' check (criticality in ('low','medium','high','critical')),
  status text not null default 'active' check (status in ('active','maintenance','retired','planned')),
  location text,
  last_review_date date,
  next_review_date date,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (next_review_date is null or last_review_date is null or next_review_date >= last_review_date)
);
create index if not exists assets_criticality_idx on public.assets(criticality);
create index if not exists assets_next_review_idx on public.assets(next_review_date);
alter table public.assets enable row level security;
revoke all on public.assets from anon;
grant select, insert, update, delete on public.assets to authenticated;
create policy cgp_assets_team_read on public.assets for select to authenticated using ((select private.current_user_role()) in ('admin','cybersecurity_team'));
create policy cgp_assets_team_create on public.assets for insert to authenticated with check ((select private.current_user_role()) in ('admin','cybersecurity_team') and created_by=(select auth.uid()));
create policy cgp_assets_team_update on public.assets for update to authenticated using ((select private.current_user_role()) in ('admin','cybersecurity_team')) with check ((select private.current_user_role()) in ('admin','cybersecurity_team'));
create policy cgp_assets_admin_delete on public.assets for delete to authenticated using ((select private.current_user_role())='admin');
