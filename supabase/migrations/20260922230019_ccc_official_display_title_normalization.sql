-- CCC 2:2024 list-display labels from the official NCA Arabic subdomain headings.
-- Source: https://cdn.nca.gov.sa/api/files/public/upload/bd85b958-45a7-4b65-8eb1-cc1361c91233_CCC-2-2024-.pdf
-- The two admitted input fingerprints are the verified Production inherited
-- labels and QA normalized labels. No regulatory requirement text, hierarchy,
-- applicability, mapping, score, or operational field is changed.
begin;
set local lock_timeout = '10s';
select set_config('private.catalog_maintenance', 'on', true);
select set_config('private.catalog_maintenance_reason',
  'Normalize CCC list-display labels to verified official NCA subdomain headings', true);

create temporary table ccc_official_display (
  subdomain_code text primary key,
  heading_ar text not null
) on commit drop;
insert into ccc_official_display values
    ('1-1','أدوار ومسؤوليات الأمن السيبراني'),
    ('1-2','إدارة مخاطر الأمن السيبراني'),
    ('1-3','الالتزام بتشريعات وتنظيمات ومعايير الأمن السيبراني'),
    ('1-4','الأمن السيبراني المتعلق بالموارد البشرية'),
    ('1-5','الأمن السيبراني ضمن إدارة التغيير'),
    ('2-1','إدارة الأصول'),
    ('2-2','إدارة هويات الدخول والصلاحيات'),
    ('2-3','حماية الأنظمة وأجهزة معالجة المعلومات'),
    ('2-4','إدارة أمن الشبكات'),
    ('2-5','أمن الأجهزة المحمولة'),
    ('2-6','حماية البيانات والمعلومات'),
    ('2-7','التشفير'),
    ('2-8','إدارة النسخ الاحتياطية'),
    ('2-9','إدارة الثغرات'),
    ('2-10','اختبار الاختراق'),
    ('2-11','إدارة سجلات الأحداث ومراقبة الأمن السيبراني'),
    ('2-12','إدارة حوادث وتهديدات الأمن السيبراني'),
    ('2-13','الأمن المادي'),
    ('2-14','حماية تطبيقات الويب'),
    ('2-15','إدارة المفاتيح'),
    ('2-16','أمن تطوير الأنظمة'),
    ('2-17','أمن وسائط التخزين'),
    ('3-1','جوانب صمود الأمن السيبراني في إدارة استمرارية الأعمال'),
    ('4-1','الأمن السيبراني المتعلق بسلسلة الإمداد والأطراف الخارجية');

do $ccc_titles$
declare
  ccc_id bigint;
  before_fingerprint text;
begin
  if current_user <> 'postgres' or session_user <> 'postgres' then
    raise exception 'CCC title normalization requires postgres migration session';
  end if;
  select id into strict ccc_id from public.frameworks where code = 'CCC' and is_active;
  select md5(string_agg(control_code||':'||title_ar,E'\n' order by control_code))
    into before_fingerprint
  from public.controls where framework_id = ccc_id;
  if (select count(*) from public.controls where framework_id = ccc_id) <> 175
     or (select count(*) from ccc_official_display) <> 24
     or before_fingerprint not in (
       'ff33fa0a368774da9d0a77eb2cf5ffd0',
       '0bc5dada1f04951c42f2656e975c3531'
     )
     or exists (
       select 1 from public.controls c
       left join ccc_official_display d
         on d.subdomain_code = split_part(c.control_code,'-',1)||'-'||split_part(c.control_code,'-',2)
       where c.framework_id = ccc_id and d.subdomain_code is null
     ) then
    raise exception 'Unreviewed CCC display-title input; stop for manual review';
  end if;
  update public.controls c
  set title_ar = d.heading_ar ||
    case when c.control_code in (
      '1-1-T-1-1','1-2-T-1','1-3-T-1',
      '1-4-T-1','2-1-T-1','3-1-T-1'
    ) then ' (المشترك)' else '' end || ' - ' || c.control_code
  from ccc_official_display d
  where c.framework_id = ccc_id
    and d.subdomain_code = split_part(c.control_code,'-',1)||'-'||split_part(c.control_code,'-',2)
    and c.title_ar is distinct from d.heading_ar ||
      case when c.control_code in (
        '1-1-T-1-1','1-2-T-1','1-3-T-1',
        '1-4-T-1','2-1-T-1','3-1-T-1'
      ) then ' (المشترك)' else '' end || ' - ' || c.control_code;
end
$ccc_titles$;
commit;
