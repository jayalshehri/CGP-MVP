create table if not exists public.data_quality_assessments (
 id bigint generated always as identity primary key,
 asset_id bigint not null references public.data_assets(id) on delete cascade,
 assessment_date date not null default current_date,
 assessor_name text not null,
 completeness_score smallint not null check (completeness_score between 1 and 5),
 accuracy_score smallint not null check (accuracy_score between 1 and 5),
 consistency_score smallint not null check (consistency_score between 1 and 5),
 timeliness_score smallint not null check (timeliness_score between 1 and 5),
 notes text,
 created_at timestamptz not null default now()
);
create index if not exists data_quality_assessments_asset_idx on public.data_quality_assessments(asset_id, assessment_date desc);
alter table public.data_quality_assessments enable row level security;
revoke all on public.data_quality_assessments from anon;
grant select,insert,update,delete on public.data_quality_assessments to authenticated;
create policy data_quality_team_access on public.data_quality_assessments for all to authenticated using ((select private.current_user_role()) in ('admin','data_governance_team')) with check ((select private.current_user_role()) in ('admin','data_governance_team'));

create table if not exists public.privacy_processing_activities (
 id bigint generated always as identity primary key,
 activity_code text not null unique,
 asset_id bigint references public.data_assets(id) on delete set null,
 activity_name text not null,
 processing_purpose text not null,
 legal_basis text not null,
 data_categories text not null,
 data_subject_categories text,
 contains_sensitive_data boolean not null default false,
 retention_period text,
 recipients text,
 cross_border_transfer boolean not null default false,
 status text not null default 'draft' check (status in ('draft','under_review','approved','retired')),
 owner_name text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.privacy_processing_activities enable row level security;
revoke all on public.privacy_processing_activities from anon;
grant select,insert,update,delete on public.privacy_processing_activities to authenticated;
create policy privacy_processing_team_access on public.privacy_processing_activities for all to authenticated using ((select private.current_user_role()) in ('admin','data_governance_team')) with check ((select private.current_user_role()) in ('admin','data_governance_team'));

create table if not exists public.data_sharing_requests (
 id bigint generated always as identity primary key,
 request_code text not null unique,
 asset_id bigint references public.data_assets(id) on delete set null,
 requester_name text not null,
 recipient_entity text not null,
 sharing_purpose text not null,
 data_categories text not null,
 legal_basis text not null,
 sharing_method text,
 status text not null default 'submitted' check (status in ('draft','submitted','steward_review','governance_review','approved','rejected','closed')),
 decision_notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.data_sharing_requests enable row level security;
revoke all on public.data_sharing_requests from anon;
grant select,insert,update,delete on public.data_sharing_requests to authenticated;
create policy data_sharing_team_access on public.data_sharing_requests for all to authenticated using ((select private.current_user_role()) in ('admin','data_governance_team')) with check ((select private.current_user_role()) in ('admin','data_governance_team'));