-- QA-only regression-fixture isolation. NEVER include in the Production
-- promotion manifest. Excludes only the synthetic QA_SYNTH framework from
-- executive assessment summaries; all scoring formulas remain unchanged.
begin;

do $qa_gate$
begin
  if (select count(*) from public.frameworks
      where code = 'QA_SYNTH' and is_active) <> 1
     or (select count(*) from supabase_migrations.schema_migrations
         where version = '20260922000000') <> 1 then
    raise exception 'QA-only assessment isolation cannot run outside CGP-QA';
  end if;
end
$qa_gate$;

create or replace function public.cgp_assessment_summary()
returns jsonb language sql stable security invoker set search_path='' as $$
with stats as (
 select a.id,a.framework_id,f.code framework,a.framework_version,a.scope_name,a.status,a.previous_cycle_id,a.due_date,a.next_review_date,a.approved_at,
 count(i.id) filter(where i.is_scoring) total,
 count(i.id) filter(where i.is_scoring and i.compliance_status is not null) assessed,
 count(i.id) filter(where i.is_scoring and i.review_status='accepted') reviewed,
 count(i.id) filter(where i.is_scoring and i.review_status='accepted' and i.compliance_status='not_applicable' and a.status in ('approved','closed')) not_applicable,
 count(i.id) filter(where i.is_scoring and i.review_status='accepted' and i.compliance_status='implemented' and a.status in ('approved','closed')) compliant,
 count(i.id) filter(where i.is_scoring and (i.compliance_status is null or nullif(btrim(i.notes),'') is null or (i.compliance_status in ('not_implemented','partially_implemented') and (i.owner_id is null or i.expected_compliance_date is null or nullif(btrim(i.corrective_action),'') is null)))) missing_data,
 string_agg(i.control_code,',' order by i.control_code) filter(where i.is_scoring) scope_signature
 from public.assessment_cycles a join public.frameworks f on f.id=a.framework_id left join public.assessment_items i on i.cycle_id=a.id
 group by a.id,f.code
), summaries as (
 select s.*,case when s.status in ('approved','closed') then 100.0*s.compliant/nullif(s.total-s.not_applicable,0) end compliance,
 100.0*s.assessed/nullif(s.total,0) completion,
 (select count(*) from public.assessment_findings g join public.assessment_items i on i.id=g.item_id where i.cycle_id=s.id and g.status<>'closed') open_gaps,
 (select count(*) from public.assessment_findings g join public.assessment_items i on i.id=g.item_id where i.cycle_id=s.id and g.status<>'closed' and g.severity='critical') critical_gaps,
 (select count(*) from public.assessment_findings g join public.assessment_items i on i.id=g.item_id where i.cycle_id=s.id and g.status<>'closed' and g.due_date<(now() at time zone 'Asia/Riyadh')::date) overdue_actions,
 (select count(distinct l.evidence_id) from public.assessment_item_evidence l join public.assessment_items i on i.id=l.item_id join public.evidence e on e.id=l.evidence_id where i.cycle_id=s.id and e.is_current and (e.valid_until is null or e.valid_until>=(now() at time zone 'Asia/Riyadh')::date) and ((e.control_id=i.control_id and e.status in ('pending_review','under_review','submitted')) or exists(select 1 from public.evidence_control_links el where el.evidence_id=e.id and el.control_id=i.control_id and el.status in ('pending_review','under_review')))) pending_evidence,
 (select count(distinct l.evidence_id) from public.assessment_item_evidence l join public.assessment_items i on i.id=l.item_id join public.evidence e on e.id=l.evidence_id where i.cycle_id=s.id and (not e.is_current or e.valid_until<(now() at time zone 'Asia/Riyadh')::date)) evidence_needing_refresh
 from stats s
)
select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('improvement',case when p.status in ('approved','closed') and s.status in ('approved','closed') and p.scope_signature=s.scope_signature and p.framework_version=s.framework_version and p.scope_name=s.scope_name then s.compliance-p.compliance end) order by s.id desc),'[]')
from summaries s left join summaries p on p.id=s.previous_cycle_id
where s.framework <> 'QA_SYNTH';
$$;

commit;
