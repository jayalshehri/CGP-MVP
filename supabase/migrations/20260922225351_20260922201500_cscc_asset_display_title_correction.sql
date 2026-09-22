-- The official CSCC 1:2019 subdomain 2-1 is Asset Management (إدارة الأصول).
-- QA inherited two incorrect list-display aliases from Identity Management.
-- Production already has the correct aliases; this migration is a guarded
-- no-op there. Regulatory official_text_ar and all operational state remain
-- unchanged. Source: https://cdn.nca.gov.sa/ar/cscc-ar.pdf, page 16.
begin;
set local lock_timeout = '10s';
select set_config('private.catalog_maintenance', 'on', true);
select set_config('private.catalog_maintenance_reason',
  'Correct two CSCC 2-1 asset-management display aliases from official NCA subdomain heading', true);

do $cscc_titles$
declare
  cscc_id bigint;
begin
  if current_user <> 'postgres' or session_user <> 'postgres' then
    raise exception 'CSCC catalog title correction requires postgres migration session';
  end if;
  select id into strict cscc_id from public.frameworks where code = 'CSCC' and is_active;
  if (select count(*) from public.controls
      where framework_id = cscc_id and control_code in ('2-1-1-1','2-1-1-2')) <> 2
     or exists (
       select 1 from public.controls
       where framework_id = cscc_id and control_code in ('2-1-1-1','2-1-1-2')
         and title_ar not in (
           'إدارة الأصول - ' || control_code,
           'إدارة هويات الدخول والصلاحيات - ' || control_code
         )
     )
     or (select official_text_ar from public.controls
         where framework_id = cscc_id and control_code = '2-1-1-1')
        is distinct from 'الاحتفاظ بقائمة محدثة سنوياً، لجميع الأصول التابعة للأنظمة الحساسة.'
     or (select official_text_ar from public.controls
         where framework_id = cscc_id and control_code = '2-1-1-2')
        is distinct from 'تحديد مالك الأصول (Assets Owner)، وإشراكهم في دورة حياة إدارة الأصول التابعة للأنظمة الحساسة.' then
    raise exception 'CSCC 2-1 asset title/text drift requires review';
  end if;
  update public.controls
  set title_ar = 'إدارة الأصول - ' || control_code
  where framework_id = cscc_id
    and control_code in ('2-1-1-1','2-1-1-2')
    and title_ar <> 'إدارة الأصول - ' || control_code;
end
$cscc_titles$;
commit;
