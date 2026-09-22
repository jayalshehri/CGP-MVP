-- Production-only bridge before the already-applied QA ECC reconciliation.
-- QA version 20260922184730 is immutable. Production has eight references to
-- the former ECC 2-7-3 identity, while QA had none. Inactivate those exact
-- relationships and archive the old identities before that migration's
-- zero-reference guard. No successor mapping is inferred.
begin;
set local lock_timeout = '10s';
select set_config('private.catalog_maintenance', 'on', true);
select set_config('private.catalog_maintenance_reason',
  'Reviewed Production transition for eight historical OLD ECC 2-7-3 references and six official display titles', true);

lock table public.controls, public.control_framework_links,
  public.shared_control_framework_mappings in share row exclusive mode;

do $transition$
declare
  ecc_id bigint;
  archive_id bigint;
  old_171 bigint;
  old_273 bigint;
  current_274 bigint;
  fk record;
  reference_count bigint;
begin
  if current_user <> 'postgres' or session_user <> 'postgres' then
    raise exception 'Production ECC transition requires a postgres migration session';
  end if;

  select id into strict ecc_id from public.frameworks where code = 'ECC' and is_active;
  select id into old_171 from public.controls where framework_id = ecc_id and control_code = '1-7-2';
  select id into old_273 from public.controls where framework_id = ecc_id and control_code = '2-7-3';
  select id into current_274 from public.controls where framework_id = ecc_id and control_code = '2-7-4';

  if old_171 is null or old_273 is null or current_274 is null
     or (select count(*) from public.controls where framework_id = ecc_id) <> 202 then
    raise exception 'Unexpected pre-transition ECC identities or item count';
  end if;
  if (select official_text_ar from public.controls where id = old_273)
       is distinct from 'يجب أن تغطي متطلبات الأمن السيبراني لحماية بيانات ومعلومات الجهة بحد أدنى المتطلبات المذكورة في ضوابط الأمن السيبراني للبيانات الصادرة من الهيئة.'
     or (select official_text_ar from public.controls where id = current_274)
       is distinct from 'يجب مراجعة تطبيق متطلبات الأمن السيبراني لحماية بيانات ومعلومات الجهة دورياً.' then
    raise exception 'Old and current ECC 2-7-3 semantics require fresh regulatory review';
  end if;

  if (select count(*) from public.control_framework_links where target_control_id = old_273) <> 4
     or exists (
       select 1 from public.control_framework_links link
       join public.controls source on source.id = link.source_control_id
       join public.frameworks f on f.id = source.framework_id
       where link.target_control_id = old_273
         and ((f.code, source.control_code) not in
                (('DCC','2-4-1'),('CSCC','2-6-1'),('TCC','2-6-1'),('OSMACC','2-5-1'))
              or link.relationship_type <> 'official_reference'
              or link.validation_status <> 'pending')
     )
     or (select count(distinct (f.code, source.control_code))
         from public.control_framework_links link
         join public.controls source on source.id = link.source_control_id
         join public.frameworks f on f.id = source.framework_id
         where link.target_control_id = old_273) <> 4 then
    raise exception 'Unexpected old ECC 2-7-3 control-framework links';
  end if;

  if (select count(*) from public.shared_control_framework_mappings where cyber_control_id = old_273) <> 4
     or exists (
       select 1 from public.shared_control_framework_mappings mapping
       join public.shared_controls shared on shared.id = mapping.shared_control_id
       join public.controls source on shared.shared_control_code = 'SC-CY-' || source.id
       join public.frameworks f on f.id = source.framework_id
       where mapping.cyber_control_id = old_273
         and ((f.code, source.control_code) not in
                (('DCC','2-4-1'),('CSCC','2-6-1'),('TCC','2-6-1'),('OSMACC','2-5-1'))
              or mapping.framework_code <> 'ECC'
              or mapping.control_code <> '2-7-3'
              or mapping.relationship_type <> 'partial'
              or mapping.validation_status <> 'validated')
     )
     or (select count(distinct (f.code, source.control_code))
         from public.shared_control_framework_mappings mapping
         join public.shared_controls shared on shared.id = mapping.shared_control_id
         join public.controls source on shared.shared_control_code = 'SC-CY-' || source.id
         join public.frameworks f on f.id = source.framework_id
         where mapping.cyber_control_id = old_273) <> 4 then
    raise exception 'Unexpected old ECC 2-7-3 shared mappings';
  end if;

  -- All other control FKs must be zero. Existing audit events alone may still
  -- reference the old identities, because they are permanent history.
  for fk in
    select format('%I.%I', ns.nspname, rel.relname) as table_name,
           att.attname as column_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid = 'public.controls'::regclass
      and cardinality(con.conkey) = 1
      and con.conrelid <> 'public.grc_audit_events'::regclass
      and not (con.conrelid = 'public.control_framework_links'::regclass
               and att.attname = 'target_control_id')
      and not (con.conrelid = 'public.shared_control_framework_mappings'::regclass
               and att.attname = 'cyber_control_id')
  loop
    execute format('select count(*) from %s where %I = any($1)',
      fk.table_name, fk.column_name)
      into reference_count using array[old_171, old_273];
    if reference_count <> 0 then
      raise exception 'Unreviewed old ECC references: % in %.%',
        reference_count, fk.table_name, fk.column_name;
    end if;
  end loop;
  if exists (select 1 from public.control_framework_links where target_control_id = old_171)
     or exists (select 1 from public.shared_control_framework_mappings where cyber_control_id = old_171) then
    raise exception 'Unreviewed ECC 1-7-2 mapping reference';
  end if;

  -- Existing lifecycle states express an inactive relationship; append a
  -- review rationale without changing IDs, FKs, or source-side records.
  update public.control_framework_links
  set validation_status = 'rejected',
      coverage_notes = concat_ws(E'\n', nullif(coverage_notes, ''),
        'Historical OLD ECC 2-7-3 referral; current 2-7-3 is different. No automatic successor; regulatory review required.')
  where target_control_id = old_273;

  update public.shared_control_framework_mappings
  set validation_status = 'rejected',
      source_reference = concat_ws(E'\n', nullif(source_reference, ''),
        'Historical OLD ECC 2-7-3 referral; current 2-7-3 is different. No automatic successor; regulatory review required.')
  where cyber_control_id = old_273;

  insert into public.frameworks
    (code, name_ar, name_en, version, description_ar, is_active, source_url)
  values (
    'ECC_RETIRED_2_2024',
    'أرشيف ضوابط الأمن السيبراني الأساسية المستبدلة',
    'Retired ECC 2:2024 catalog identities',
    '2-2024-retired',
    'أرشيف للمعرّفات التنظيمية السابقة 1-7-2 و2-7-3؛ غير نشط ولا يستخدم في التقييمات الجديدة.',
    false,
    'https://cdn.nca.gov.sa/api/files/public/upload/e4c81aa9-a609-4823-abab-347283e29731_ECC-2-2024-AR-19092024-.pdf'
  ) returning id into archive_id;

  update public.controls set framework_id = archive_id
  where id in (old_171, old_273);
  update public.controls
  set control_code = '2-7-3',
      title_ar = regexp_replace(title_ar, '2-7-4$', '2-7-3')
  where id = current_274;

  -- Six inherited labels used former wording. These are derived display
  -- titles, not official_text_ar; the official current subdomain headings
  -- are 2-3 "حماية الأنظمة وأجهزة معالجة المعلومات" and
  -- 2-9 "إدارة النسخ الاحتياطية".
  if exists (
    select 1 from public.controls c
    where c.framework_id = ecc_id
      and c.control_code in ('2-3-1','2-3-2','2-3-4','2-9-1','2-9-2','2-9-4')
      and c.title_ar not in (
        case when c.control_code like '2-3-%'
          then 'حماية الأنظمة ومرافق معالجة المعلومات - ' || c.control_code
          else 'إدارة النسخ الاحتياطية والاستعادة - ' || c.control_code end,
        case when c.control_code like '2-3-%'
          then 'حماية الأنظمة وأجهزة معالجة المعلومات - ' || c.control_code
          else 'إدارة النسخ الاحتياطية - ' || c.control_code end
      )
  ) then
    raise exception 'Unexpected ECC display-title drift';
  end if;
  update public.controls c
  set title_ar = case when c.control_code like '2-3-%'
    then 'حماية الأنظمة وأجهزة معالجة المعلومات - ' || c.control_code
    else 'إدارة النسخ الاحتياطية - ' || c.control_code end
  where c.framework_id = ecc_id
    and c.control_code in ('2-3-1','2-3-2','2-3-4','2-9-1','2-9-2','2-9-4');

  if (select count(*) from public.controls where framework_id = ecc_id) <> 200
     or (select count(*) from public.controls where framework_id = archive_id) <> 2
     or (select count(*) from public.control_framework_links
         where target_control_id = old_273 and validation_status = 'rejected') <> 4
     or (select count(*) from public.shared_control_framework_mappings
         where cyber_control_id = old_273 and validation_status = 'rejected') <> 4 then
    raise exception 'Incomplete Production ECC reference transition';
  end if;
end
$transition$;
commit;
