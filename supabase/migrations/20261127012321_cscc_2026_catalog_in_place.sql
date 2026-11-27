-- Refresh the existing CSCC regulatory catalog in place. Source: the Arabic
-- CSCC-2:2026 published by the National Cybersecurity Authority, pages 12–20.
-- Retain all IDs, hierarchy, operational state, evidence, mappings, and assessment snapshots.
-- The printed code 2-1-9-3 is documented in the control UI without rekeying 2-9-1-3.
begin;
set local lock_timeout = '10s';
select set_config('private.catalog_maintenance', 'on', true);
select set_config('private.catalog_maintenance_reason',
  'Update the single active CSCC catalog to the official NCA CSCC-2:2026 source', true);

lock table public.frameworks, public.controls in share row exclusive mode;

create temporary table cscc_2026_pages (
  code text primary key,
  source_page text not null,
  hierarchy_level text not null
) on commit drop;
insert into cscc_2026_pages (code, source_page, hierarchy_level) values
  ('1-1-1', '12', 'control'),
  ('1-2-1', '12', 'control'),
  ('1-2-1-1', '12', 'sub_control'),
  ('1-2-1-2', '12', 'sub_control'),
  ('1-3-1', '12', 'control'),
  ('1-3-1-1', '12', 'sub_control'),
  ('1-3-1-2', '12', 'sub_control'),
  ('1-3-2', '12', 'control'),
  ('1-3-2-1', '12', 'sub_control'),
  ('1-3-2-2', '12', 'sub_control'),
  ('1-3-2-3', '12', 'sub_control'),
  ('1-3-2-4', '12', 'sub_control'),
  ('1-4-1', '13', 'control'),
  ('1-4-2', '13', 'control'),
  ('1-5-1', '13', 'control'),
  ('1-5-1-1', '13', 'sub_control'),
  ('1-5-1-2', '13', 'sub_control'),
  ('2-1-1', '14', 'control'),
  ('2-1-1-1', '14', 'sub_control'),
  ('2-1-1-2', '14', 'sub_control'),
  ('2-10-1', '17', 'control'),
  ('2-10-1-1', '17', 'sub_control'),
  ('2-10-1-2', '17', 'sub_control'),
  ('2-10-2', '17', 'control'),
  ('2-11-1', '17', 'control'),
  ('2-11-1-1', '17', 'sub_control'),
  ('2-11-1-2', '17', 'sub_control'),
  ('2-11-1-3', '17', 'sub_control'),
  ('2-11-1-4', '17', 'sub_control'),
  ('2-11-1-5', '17', 'sub_control'),
  ('2-11-2', '17', 'control'),
  ('2-12-1', '18', 'control'),
  ('2-12-1-1', '18', 'sub_control'),
  ('2-12-1-2', '18', 'sub_control'),
  ('2-12-2', '18', 'control'),
  ('2-13-1', '18', 'control'),
  ('2-13-2', '18', 'control'),
  ('2-13-3', '18', 'control'),
  ('2-13-3-1', '18', 'sub_control'),
  ('2-13-3-2', '18', 'sub_control'),
  ('2-13-3-3', '18', 'sub_control'),
  ('2-13-3-4', '18', 'sub_control'),
  ('2-13-4', '18', 'control'),
  ('2-2-1', '14', 'control'),
  ('2-2-1-1', '14', 'sub_control'),
  ('2-2-1-2', '14', 'sub_control'),
  ('2-2-1-3', '14', 'sub_control'),
  ('2-2-1-4', '14', 'sub_control'),
  ('2-2-1-5', '14', 'sub_control'),
  ('2-2-1-6', '14', 'sub_control'),
  ('2-2-1-7', '14', 'sub_control'),
  ('2-2-1-8', '14', 'sub_control'),
  ('2-2-2', '14', 'control'),
  ('2-3-1', '14', 'control'),
  ('2-3-1-1', '14', 'sub_control'),
  ('2-3-1-2', '15', 'sub_control'),
  ('2-3-1-3', '15', 'sub_control'),
  ('2-3-1-4', '15', 'sub_control'),
  ('2-3-1-5', '15', 'sub_control'),
  ('2-3-1-6', '15', 'sub_control'),
  ('2-3-1-7', '15', 'sub_control'),
  ('2-3-1-8', '15', 'sub_control'),
  ('2-4-1', '15', 'control'),
  ('2-4-1-1', '15', 'sub_control'),
  ('2-4-1-2', '15', 'sub_control'),
  ('2-4-1-3', '15', 'sub_control'),
  ('2-4-1-4', '15', 'sub_control'),
  ('2-4-1-5', '15', 'sub_control'),
  ('2-4-1-6', '15', 'sub_control'),
  ('2-4-1-7', '15', 'sub_control'),
  ('2-4-1-8', '15', 'sub_control'),
  ('2-4-1-9', '15', 'sub_control'),
  ('2-5-1', '15', 'control'),
  ('2-5-1-1', '16', 'sub_control'),
  ('2-5-1-2', '16', 'sub_control'),
  ('2-6-1', '16', 'control'),
  ('2-6-1-1', '16', 'sub_control'),
  ('2-6-1-2', '16', 'sub_control'),
  ('2-6-1-3', '16', 'sub_control'),
  ('2-6-1-4', '16', 'sub_control'),
  ('2-6-1-5', '16', 'sub_control'),
  ('2-7-1', '16', 'control'),
  ('2-7-1-1', '16', 'sub_control'),
  ('2-7-1-2', '16', 'sub_control'),
  ('2-7-1-3', '16', 'sub_control'),
  ('2-8-1', '16', 'control'),
  ('2-8-1-1', '16', 'sub_control'),
  ('2-8-1-2', '16', 'sub_control'),
  ('2-8-1-3', '16', 'sub_control'),
  ('2-8-2', '16', 'control'),
  ('2-9-1', '17', 'control'),
  ('2-9-1-1', '17', 'sub_control'),
  ('2-9-1-2', '17', 'sub_control'),
  ('2-9-1-3', '17', 'sub_control'),
  ('2-9-2', '17', 'control'),
  ('3-1-1', '19', 'control'),
  ('3-1-1-1', '19', 'sub_control'),
  ('3-1-1-2', '19', 'sub_control'),
  ('3-1-1-3', '19', 'sub_control'),
  ('3-1-1-4', '19', 'sub_control'),
  ('4-1-1', '20', 'control'),
  ('4-1-1-1', '20', 'sub_control'),
  ('4-1-1-2', '20', 'sub_control'),
  ('4-2-1', '20', 'control'),
  ('4-2-1-1', '20', 'sub_control');

-- Annex D changes plus exact wording/reference corrections found during the
-- reconciliation of the stored Arabic text against the current printed body.
create temporary table cscc_2026_text_changes (
  code text primary key references cscc_2026_pages(code),
  previous_text text not null,
  current_text text not null
) on commit drop;
insert into cscc_2026_text_changes (code, previous_text, current_text) values
  ('1-4-2', 'رجوعاً للضابط 1-8-2 في الضوابط الأساسية للأمن السيبراني، يجب أن تتم مراجعة تطبيق ضوابط الأمن السيبراني للأنظمة الحساسة؛ من قبل أطراف مستقلة عن الإدارة المعنية بالأمن السيبراني من داخل الجهة، مرة واحدة؛ كل ثلاث سنوات على الأقل.', 'رجوعاً للضابط 1-8-2 في الضوابط الأساسية للأمن السيبراني، يجب أن تتم مراجعة تطبيق ضوابط الأمن السيبراني للأنظمة الحساسة؛ من قبل أطراف مستقلة عن الإدارة المعنية بالأمن السيبراني، مرة واحدة؛ كل ثلاث سنوات على الأقل.'),
  ('2-1-1-2', 'تحديد مالك الأصول (Assets Owner)، وإشراكهم في دورة حياة إدارة الأصول التابعة للأنظمة الحساسة.', 'تحديد ملاك الأصول (Assets Owner)، وإشراكهم في دورة حياة إدارة الأصول، التابعة للأنظمة الحساسة.'),
  ('2-2-1-7', 'الإدارة الآمنة لحسابات الخدمات (Service Account) ما بين التطبيقات والأنظمة؛ وتعطيل الدخول البشري التفاعلي (Interactive login) من خلالها؛ فيما عدا مشرفي قواعد البيانات (Database Administrators).', 'الإدارة الآمنة لحسابات الخدمات (Service Account) ما بين التطبيقات والأنظمة؛ وتعطيل الدخول البشري التفاعلي (Interactive login) من خلالها.'),
  ('2-2-1-8', 'منع التعامل المباشر لأي مستخدم مع قواعد البيانات؛ ويتم ذلك من خلال التطبيقات فقط، وبناءً على الصلاحيات المخوّل بها؛ مع مراعاة تطبيق حلول أمنية تحد، أو تمنع من اطلاع مشرفي قواعد البيانات (Database Administrators) على البيانات المصنفة (Classified Data).', 'فيما عدا مشرفي قواعد البيانات (Database Administrators)، يمنع الوصول أو التعامل المباشر لأي مستخدم مع قواعد البيانات؛ ويتم ذلك من خلال التطبيقات فقط، وبناءً على الصلاحيات المخوّل بها؛ مع مراعاة تطبيق حلول أمنية تحد، أو تمنع من اطلاع مشرفي قواعد البيانات على البيانات المصنفة (Classified Data).'),
  ('2-2-2', 'رجوعاً للضابط 2-2-3 في الضوابط الأساسية للأمن السيبراني، يجب مراجعة هويات الدخول على الأنظمة الحساسة، مرة واحدة، كل ثلاثة أشهر، على الأقل.', 'رجوعاً للضابط 2-2-3-5 في الضوابط الأساسية للأمن السيبراني، يجب مراجعة هويات الدخول على الأنظمة الحساسة، مرة واحدة، كل ثلاثة أشهر، على الأقل.'),
  ('2-3-1-1', 'السماح فقط بقائمة محددة من ملفات التشغيل والبرامج (Whitelisting) للتطبيقات؛ للعمل على الخوادم الخاصة بالأنظمة الحساسة.', 'السماح فقط بقائمة محددة من ملفات التشغيل (Whitelisting) للتطبيقات والبرامج؛ للعمل على الخوادم الخاصة بالأنظمة الحساسة.'),
  ('2-6-1', 'بالإضافة للضوابط الفرعية ضمن الضابط 2-7-3 في الضوابط الأساسية للأمن السيبراني، يجب أن تغطي متطلبات الأمن السيبراني لحماية البيانات والمعلومات؛ بحد أدنى، ما يلي:', 'بالإضافة للضوابط ضمن المكون الفرعي 2-7 في الضوابط الأساسية للأمن السيبراني، يجب أن تغطي متطلبات الأمن السيبراني لحماية البيانات والمعلومات؛ بحد أدنى، ما يلي:'),
  ('4-2-1-1', 'أن يكون موقع استضافة الأنظمة الحساسة، أو أي جزء من مكوناتها التقنية، داخل الجهة، أو في خدمات الحوسبة السحابية، المقدمة من قبل جهات حكومية، أو شركات وطنية محققة لضوابط الحوسبة السحابية الصادرة من الهيئة مع مراعاة تصنيف البيانات المستضافة.', 'أن يكون موقع استضافة الأنظمة الحساسة في مركز بيانات خاص بالجهة أو في مركز المعلومات الوطني أو في سحابة سيادية.');

do $cscc_catalog$
declare
  target_framework public.frameworks%rowtype;
  official_pdf constant text := 'https://cdn.nca.gov.sa/api/public/cms/files/14828b9c-c1d5-4c6c-9b06-b6564f3ed17a_CSCC---2-2026-AR-.pdf';
begin
  if current_user <> 'postgres' or session_user <> 'postgres' then
    raise exception 'CSCC regulatory maintenance requires a postgres migration session';
  end if;
  select * into strict target_framework from public.frameworks where code = 'CSCC' and is_active;
  if target_framework.version is null or target_framework.version not in ('1-2019','2-2026') then
    raise exception 'Unexpected CSCC version: %', target_framework.version;
  end if;
  if (select count(*) from public.controls where framework_id = target_framework.id) <> 105
     or (select count(*) from pg_temp.cscc_2026_pages where hierarchy_level = 'control') <> 32
     or (select count(*) from pg_temp.cscc_2026_pages where hierarchy_level = 'sub_control') <> 73
     or exists (
       select 1 from pg_temp.cscc_2026_pages p
       left join public.controls c on c.framework_id = target_framework.id and c.control_code = p.code
       where c.id is null or c.hierarchy_level is distinct from p.hierarchy_level
     ) then
    raise exception 'CSCC catalog identity or hierarchy drift requires review';
  end if;
  if exists (
    select 1 from pg_temp.cscc_2026_text_changes t
    join public.controls c on c.framework_id = target_framework.id and c.control_code = t.code
    where c.official_text_ar is null or c.official_text_ar not in (t.previous_text,t.current_text)
  ) then
    raise exception 'A CSCC source text targeted for replacement has an unreviewed value';
  end if;

  update public.controls c
  set source_page = p.source_page,
      official_text_ar = coalesce(t.current_text,c.official_text_ar),
      description_ar = coalesce(t.current_text,c.description_ar)
  from pg_temp.cscc_2026_pages p
  left join pg_temp.cscc_2026_text_changes t on t.code = p.code
  where c.framework_id = target_framework.id and c.control_code = p.code
    and (c.source_page is distinct from p.source_page
      or (t.current_text is not null and (c.official_text_ar is distinct from t.current_text
        or c.description_ar is distinct from t.current_text)));

  update public.frameworks
  set version = '2-2026', source_url = official_pdf
  where id = target_framework.id
    and (version is distinct from '2-2026' or source_url is distinct from official_pdf);
end
$cscc_catalog$;
commit;
