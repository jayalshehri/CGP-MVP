-- Separate Data Governance workspace and workflow foundation.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin','cybersecurity_team','data_governance_team','control_owner'));

create table if not exists public.data_governance_frameworks (
  id bigint generated always as identity primary key,
  framework_code text not null unique,
  name_ar text not null,
  regulator text not null,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  created_at timestamptz not null default now()
);
create table if not exists public.data_governance_domains (
  id bigint generated always as identity primary key,
  framework_id bigint not null references public.data_governance_frameworks(id) on delete cascade,
  domain_code text not null,
  name_ar text not null,
  description text,
  display_order integer not null,
  unique (framework_id, domain_code),
  unique (framework_id, display_order)
);
insert into public.data_governance_frameworks (framework_code,name_ar,regulator,status)
values ('NDMO','ضوابط إدارة البيانات الوطنية وحوكمتها وحماية البيانات الشخصية','مكتب إدارة البيانات الوطنية — سدايا','draft')
on conflict (framework_code) do nothing;
insert into public.data_governance_domains (framework_id,domain_code,name_ar,display_order)
select f.id, v.code, v.name_ar, v.position
from public.data_governance_frameworks f
cross join (values
  ('DG-01','حوكمة البيانات',1),('DG-02','البيانات الوصفية وفهرس البيانات',2),('DG-03','جودة البيانات',3),('DG-04','تخزين البيانات',4),('DG-05','إدارة المحتوى والوثائق',5),('DG-06','نمذجة وهيكلة البيانات',6),('DG-07','إدارة البيانات المرجعية والرئيسية',7),('DG-08','ذكاء الأعمال والتحليلات',8),('DG-09','تكامل البيانات ومشاركتها',9),('DG-10','تحقيق القيمة من البيانات',10),('DG-11','البيانات المفتوحة',11),('DG-12','حرية المعلومات',12),('DG-13','تصنيف البيانات',13),('DG-14','حماية البيانات الشخصية',14),('DG-15','أمن البيانات وحمايتها',15)
) as v(code,name_ar,position)
where f.framework_code='NDMO'
on conflict (framework_id,domain_code) do nothing;

create table if not exists public.data_governance_requests (
  id bigint generated always as identity primary key,
  request_code text not null unique,
  request_type text not null check (request_type in ('data_sharing','data_classification','data_quality','personal_data','open_data','information_access')),
  title_ar text not null check (char_length(btrim(title_ar)) between 3 and 240),
  description text,
  business_owner text not null check (char_length(btrim(business_owner)) between 2 and 200),
  data_steward text,
  status text not null default 'draft' check (status in ('draft','submitted','steward_review','governance_review','approved','returned','rejected')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists data_governance_requests_status_idx on public.data_governance_requests(status);
alter table public.data_governance_frameworks enable row level security;
alter table public.data_governance_domains enable row level security;
alter table public.data_governance_requests enable row level security;
revoke all on public.data_governance_frameworks, public.data_governance_domains, public.data_governance_requests from anon;
grant select on public.data_governance_frameworks, public.data_governance_domains to authenticated;
grant select,insert,update,delete on public.data_governance_requests to authenticated;
create policy data_frameworks_read on public.data_governance_frameworks for select to authenticated using ((select private.current_user_role()) in ('admin','data_governance_team'));
create policy data_domains_read on public.data_governance_domains for select to authenticated using ((select private.current_user_role()) in ('admin','data_governance_team'));
create policy data_requests_read on public.data_governance_requests for select to authenticated using ((select private.current_user_role()) in ('admin','data_governance_team'));
create policy data_requests_create on public.data_governance_requests for insert to authenticated with check ((select private.current_user_role()) in ('admin','data_governance_team') and created_by=(select auth.uid()));
create policy data_requests_update on public.data_governance_requests for update to authenticated using ((select private.current_user_role()) in ('admin','data_governance_team')) with check ((select private.current_user_role()) in ('admin','data_governance_team'));
create policy data_requests_delete on public.data_governance_requests for delete to authenticated using ((select private.current_user_role())='admin');