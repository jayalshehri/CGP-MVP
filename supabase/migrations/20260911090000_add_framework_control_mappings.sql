-- Link supplemental NCA assessments to their explicit ECC references without overwriting ECC workflow state.
create table if not exists public.control_framework_links (
  id bigint generated always as identity primary key,
  source_control_id bigint not null references public.controls(id) on delete cascade,
  target_control_id bigint not null references public.controls(id) on delete cascade,
  relationship_type text not null default 'official_reference' check (relationship_type in ('official_reference','supports','manual_mapping')),
  source_note text,
  created_at timestamptz not null default now(),
  unique (source_control_id, target_control_id)
);

alter table public.control_framework_links enable row level security;
revoke all on public.control_framework_links from anon, authenticated;
grant select on public.control_framework_links to authenticated;
create policy framework_links_team_read on public.control_framework_links for select to authenticated
using ((select private.current_user_role()) in ('admin','cybersecurity_team'));

-- The source text is the official NCA wording. Only explicit 3-part ECC references are imported.
with ecc as (
  select c.id, c.control_code from public.controls c join public.frameworks f on f.id=c.framework_id where f.code='ECC'
), source_controls as (
  select c.id, c.description_ar from public.controls c join public.frameworks f on f.id=c.framework_id
  where f.code in ('CSCC','DCC','TCC','OSMACC')
), direct_references as (
  select sc.id source_control_id, m[1] target_code
  from source_controls sc
  cross join lateral regexp_matches(
    translate(coalesce(sc.description_ar,''),'٠١٢٣٤٥٦٧٨٩','0123456789'),
    '([1-9]-[0-9]+-[0-9]+)', 'g'
  ) as m
)
insert into public.control_framework_links(source_control_id,target_control_id,relationship_type,source_note)
select dr.source_control_id,ecc.id,'official_reference','مرجع صريح مستخرج من نص الضابط الرسمي.'
from direct_references dr join ecc on ecc.control_code=dr.target_code
on conflict (source_control_id,target_control_id) do nothing;

create or replace function public.ecc_assessment_reflections(p_ecc_control_id bigint)
returns table (
  source_framework text,
  source_control_code text,
  source_control_title text,
  assessment_scope text,
  compliance_status text,
  notes text,
  corrective_action text,
  expected_compliance_date date,
  updated_at timestamptz
)
language sql stable security invoker set search_path='public' as $$
  select f.code, sc.control_code, sc.title_ar, null::text,
    d.compliance_status,d.notes,d.corrective_action,d.expected_compliance_date,d.updated_at
  from public.control_framework_links l join public.controls sc on sc.id=l.source_control_id
  join public.frameworks f on f.id=sc.framework_id join public.dcc_assessment_results d on d.control_id=sc.id
  where l.target_control_id=p_ecc_control_id and f.code='DCC'
  union all
  select f.code, sc.control_code, sc.title_ar, null::text,
    t.compliance_status,t.notes,t.corrective_action,t.expected_compliance_date,t.updated_at
  from public.control_framework_links l join public.controls sc on sc.id=l.source_control_id
  join public.frameworks f on f.id=sc.framework_id join public.tcc_assessment_results t on t.control_id=sc.id
  where l.target_control_id=p_ecc_control_id and f.code='TCC'
  union all
  select f.code, sc.control_code, sc.title_ar, null::text,
    o.compliance_status,o.notes,o.corrective_action,o.expected_compliance_date,o.updated_at
  from public.control_framework_links l join public.controls sc on sc.id=l.source_control_id
  join public.frameworks f on f.id=sc.framework_id join public.osmacc_assessment_results o on o.control_id=sc.id
  where l.target_control_id=p_ecc_control_id and f.code='OSMACC'
  union all
  select f.code, sc.control_code, sc.title_ar, s.name,
    r.compliance_status,r.notes,r.corrective_action,r.expected_compliance_date,r.updated_at
  from public.control_framework_links l join public.controls sc on sc.id=l.source_control_id
  join public.frameworks f on f.id=sc.framework_id join public.cscc_assessment_results r on r.control_id=sc.id
  join public.cscc_systems s on s.id=r.system_id
  where l.target_control_id=p_ecc_control_id and f.code='CSCC'
  order by 1,2,4 nulls first;
$$;
revoke all on function public.ecc_assessment_reflections(bigint) from public, anon;
grant execute on function public.ecc_assessment_reflections(bigint) to authenticated;
