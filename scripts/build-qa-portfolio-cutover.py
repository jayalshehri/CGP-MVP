"""Build guarded QA-only cutover/rollback from approved local evidence. No network."""
from pathlib import Path
import csv,json,hashlib,uuid
ROOT=Path(__file__).resolve().parents[1]
REVIEW=ROOT/'docs/portfolio-import-review'
OUT=ROOT/'backups/portfolio-qa-cutover-20261006'
def rows(p): return list(csv.DictReader(p.open(encoding='utf-8-sig')))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
backup=json.loads((OUT/'PRE_CUTOVER_BACKUP.json').read_text())
assert backup['qa_ref']=='lkozjnpfufdpzqtzdxhe'
source_sha='b0dc1bee3a082af6399067c00fbe553e7f38eb1932354f858ff417642011b329'
assert sha(ROOT/'CGP_Project_Portfolio_Analysis.xlsx')==source_sha
for name in ['IMPORT_PREVIEW_43.csv','CONTROL_MAPPING_REVIEW.csv']:
    assert sha(REVIEW/name)==sha(REVIEW/'evidence/phase2a'/name)
projects=rows(REVIEW/'IMPORT_PREVIEW_43.csv'); refs=rows(REVIEW/'CONTROL_MAPPING_REVIEW.csv')
assert len(projects)==43 and len(refs)==119
assert sum(r['Control Mapping Status']=='exact_match' for r in refs)==19
batch=str(uuid.uuid5(uuid.NAMESPACE_URL,'cgp-qa-portfolio:'+source_sha))
payload=[]
for n,p in enumerate(projects,1):
    stage=str(uuid.uuid5(uuid.UUID(batch),p['Source Sheet']+':'+p['Source Row']))
    mappings=[]
    for r in refs:
        if r['Source Row']!=p['Source Row']:continue
        exact=r['Control Mapping Status']=='exact_match'
        mappings.append({'id':str(uuid.uuid5(uuid.UUID(stage),r['Source Reference'])),
          'source_reference':r['Source Reference'],'source_framework':r['Framework'],
          'source_control_code':r['Control Code'] or None,'control_id':int(r['QA Control ID']) if exact else None,
          'match_status':'exact_match' if exact else 'needs_review','source_error':not bool(r['Control Code']),
          'decision_note':'Operator-approved Phase 2A.1 exact framework/code evidence' if exact else
            ('source_error: missing control code; needs_source_correction' if not r['Control Code'] else 'Phase 2A.1: no deterministic mapping; needs_review'),
          'raw_span':r['Raw Source Span'],'span_start':int(r['Source Span Start']),'span_end':int(r['Source Span End'])})
    payload.append({'stage_id':stage,'project_code':f'PF43-{n:03d}','source_sheet':p['Source Sheet'],'source_row':int(p['Source Row']),
      'name':p['Project Name'],'priority':p['Priority'],'duration_value':float(p['Duration Value']),'duration_unit':p['Duration Unit'],
      'work_type':p['Work Type'],'executive_owner_code':p['Executive Owner'],'executive_owner_other':p['Executive Owner Other'] or None,
      'raw_references':p['Control references'],'mappings':mappings})
(OUT/'APPROVED_PAYLOAD.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
old_ids=','.join(str(x['id']) for x in backup['projects'])
fp=backup['fingerprints']
prefix=f'''-- QA ONLY: lkozjnpfufdpzqtzdxhe. Execute via the explicitly scoped QA connector.
begin;
set local lock_timeout='10s';
set local statement_timeout='90s';
lock table public.cybersecurity_projects, public.cybersecurity_project_requirements,
 public.cybersecurity_project_controls, public.portfolio_import_batches,
 public.portfolio_import_projects, public.portfolio_mapping_reviews in share row exclusive mode;
create temporary table cutover_before_audit on commit drop as select * from public.grc_audit_events;
create temporary table cutover_before_projects on commit drop as select * from public.cybersecurity_projects;
create temporary table cutover_result(result jsonb) on commit drop;
do $cutover$
declare payload jsonb := $payload${json.dumps(payload,ensure_ascii=False)}$payload$::jsonb;
  p jsonb; r jsonb; actor uuid; batch uuid := '{batch}'; project_id_new bigint;
begin
  if current_user<>'postgres' or session_user<>'postgres' then raise exception 'Wrong execution identity'; end if;
  if (select count(*) from supabase_migrations.schema_migrations)<>32
     or not exists(select 1 from supabase_migrations.schema_migrations where name='portfolio_phase2b_qa_cutover_guards')
     then raise exception 'Unexpected QA ledger'; end if;
  select user_id into strict actor from public.profiles where role='admin' and is_active order by user_id limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  if exists(select 1 from public.portfolio_import_batches where id=batch) then
    -- A replay makes zero business-row writes and verifies the complete postimage below.
    if not exists(select 1 from public.portfolio_import_batches where id=batch and source_sha256='{source_sha}' and status='validated') then
      raise exception 'Batch identity or status differs';
    end if;
  else
    if (select count(*) from public.cybersecurity_projects)<>32
      or exists(select 1 from public.cybersecurity_projects where archived_at is not null or import_staging_id is not null)
      or (select count(*) from public.cybersecurity_project_requirements)<>58
      or exists(select 1 from public.cybersecurity_project_controls)
      or exists(select 1 from public.portfolio_import_batches)
      or exists(select 1 from public.portfolio_import_projects)
      or exists(select 1 from public.portfolio_mapping_reviews) then raise exception 'QA preimage counts differ'; end if;
    if (select md5(jsonb_agg(to_jsonb(t)-array['mapping_reference_count','mapping_exact_count','mapping_source_error_count','mapping_completeness'] order by id)::text) from public.cybersecurity_projects t)<>'{fp['projects']}' then raise exception 'Project preimage drift'; end if;
    insert into public.portfolio_import_batches(id,source_filename,source_sha256,status,created_by)
      values(batch,'CGP_Project_Portfolio_Analysis.xlsx','{source_sha}','validated',actor);
    for p in select value from jsonb_array_elements(payload) loop
      insert into public.portfolio_import_projects(id,batch_id,source_sheet,source_row,source_project_name,priority,
        duration_value,duration_unit,work_type,executive_owner_code,executive_owner_other,source_payload,created_by)
      values((p->>'stage_id')::uuid,batch,p->>'source_sheet',(p->>'source_row')::integer,p->>'name',p->>'priority',
        (p->>'duration_value')::numeric,p->>'duration_unit',p->>'work_type',p->>'executive_owner_code',p->>'executive_owner_other',p,actor);
      for r in select value from jsonb_array_elements(p->'mappings') loop
        if r->>'match_status'='exact_match' and not exists(select 1 from public.controls c join public.frameworks f on f.id=c.framework_id
          where c.id=(r->>'control_id')::bigint and c.control_code=r->>'source_control_code' and f.code=r->>'source_framework' and f.is_active)
          then raise exception 'Approved exact catalog identity drift'; end if;
        insert into public.portfolio_mapping_reviews(id,staged_project_id,source_reference,source_framework,source_control_code,
          control_id,match_status,review_status,decision_note,source_error,created_by)
        values((r->>'id')::uuid,(p->>'stage_id')::uuid,r->>'source_reference',r->>'source_framework',r->>'source_control_code',
          (r->>'control_id')::bigint,r->>'match_status',case when r->>'match_status'='exact_match' then 'approved' else 'pending' end,
          r->>'decision_note',(r->>'source_error')::boolean,actor);
      end loop;
    end loop;
    -- Status and every historical relationship are deliberately untouched.
    update public.cybersecurity_projects set archived_at=now(),archived_by=actor,
      archive_reason='Approved QA Phase 2B-1 portfolio cutover; source SHA256 {source_sha}'
      where id in ({old_ids});
    for p in select value from jsonb_array_elements(payload) loop
      insert into public.cybersecurity_projects(project_code,name_ar,portfolio_priority,duration_value,duration_unit,
        work_type,executive_owner_code,executive_owner_other,status,import_staging_id,created_by)
      values(p->>'project_code',p->>'name',p->>'priority',(p->>'duration_value')::numeric,p->>'duration_unit',
        p->>'work_type',p->>'executive_owner_code',p->>'executive_owner_other','planned',(p->>'stage_id')::uuid,actor)
      returning id into project_id_new;
      insert into public.cybersecurity_project_controls(project_id,control_id,mapping_review_id,notes,created_by)
      select project_id_new,m.control_id,m.id,'Approved Phase 2A.1 exact source mapping; no inferred coverage completeness',actor
      from public.portfolio_mapping_reviews m where m.staged_project_id=(p->>'stage_id')::uuid
        and m.match_status='exact_match' and m.review_status='approved' and not m.source_error;
    end loop;
  end if;
  if (select count(*) from public.cybersecurity_projects where id in ({old_ids}) and archived_at is not null)<>32
     or (select count(*) from public.cybersecurity_projects where archived_at is null)<>43
     or (select count(*) from public.cybersecurity_projects)<>75 then raise exception 'Cutover counts failed'; end if;
  if (select count(*) from public.cybersecurity_projects where archived_at is null and portfolio_priority='P1')<>18
     or (select count(*) from public.cybersecurity_projects where archived_at is null and portfolio_priority='P2')<>16
     or (select count(*) from public.cybersecurity_projects where archived_at is null and portfolio_priority='P3')<>9 then raise exception 'Priority distribution failed'; end if;
  if exists(select name_ar from public.cybersecurity_projects where archived_at is null group by name_ar having count(*)>1) then raise exception 'Duplicate active name'; end if;
  for p in select value from jsonb_array_elements(payload) loop
    if not exists(select 1 from public.cybersecurity_projects c where c.import_staging_id=(p->>'stage_id')::uuid
      and c.name_ar=p->>'name' and c.project_code=p->>'project_code' and c.portfolio_priority=p->>'priority'
      and c.execution_year=substring(p->>'priority' from 2)::integer and c.duration_value=(p->>'duration_value')::numeric
      and c.duration_unit=p->>'duration_unit' and c.work_type=p->>'work_type' and c.executive_owner_code=p->>'executive_owner_code'
      and c.executive_owner_other is not distinct from p->>'executive_owner_other' and c.status='planned' and c.archived_at is null
      and c.planned_year is null and c.planned_quarter is null and c.planned_start_date is null and c.actual_start_date is null
      and c.target_end_date is null and c.actual_end_date is null and c.forecast_end_date is null and c.executive_owner is null
      and c.mapping_reference_count=jsonb_array_length(p->'mappings')
      and c.mapping_exact_count=(select count(*) from jsonb_array_elements(p->'mappings') m where m->>'match_status'='exact_match')
      and c.mapping_source_error_count=(select count(*) from jsonb_array_elements(p->'mappings') m where (m->>'source_error')::boolean))
      then raise exception 'Imported project differs from approved row %',p->>'source_row'; end if;
  end loop;
  if (select count(*) from public.cybersecurity_project_controls)<>19
    or (select count(distinct control_id) from public.cybersecurity_project_controls)<>17
    or (select count(*) from public.portfolio_mapping_reviews where match_status='needs_review' and not source_error)<>99
    or (select count(*) from public.portfolio_mapping_reviews where source_error)<>1
    or (select count(*) from public.portfolio_mapping_reviews)<>119
    or (select count(*) from public.portfolio_import_projects where batch_id=batch)<>43 then raise exception 'Mapping totals failed'; end if;
  if exists(select 1 from public.cybersecurity_project_controls l left join public.portfolio_mapping_reviews r on r.id=l.mapping_review_id
    left join public.cybersecurity_projects p on p.id=l.project_id left join public.controls c on c.id=l.control_id
    where r.id is null or p.id is null or c.id is null or r.match_status<>'exact_match' or r.review_status<>'approved'
      or r.source_error or p.import_staging_id<>r.staged_project_id or l.control_id<>r.control_id)
    or exists(select 1 from public.portfolio_mapping_reviews where match_status='needs_review' and (review_status<>'pending' or control_id is not null))
    then raise exception 'Unapproved or orphan mapping'; end if;
  if exists(select 1 from public.portfolio_mapping_reviews r left join public.portfolio_import_projects s on s.id=r.staged_project_id where s.id is null)
    or exists(select 1 from public.portfolio_import_projects s left join public.portfolio_import_batches b on b.id=s.batch_id where b.id is null)
    then raise exception 'Orphan staging row'; end if;
  if (select md5(jsonb_agg(to_jsonb(t) order by id)::text) from public.cybersecurity_project_requirements t)<>'{fp['project_requirements']}'
     or (select count(*) from public.cybersecurity_project_requirements)<>58 then raise exception 'Historical relationships changed'; end if;
  if (select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from public.cybersecurity_project_gap_treatments t)<>'{fp['gap_treatments']}'
    or (select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from public.assessment_findings t where project_id is not null)<>'{fp['findings']}' then raise exception 'Historical references changed'; end if;
  if exists(select 1 from cutover_before_projects old left join public.cybersecurity_projects current_project on current_project.id=old.id
    where current_project.id is null or (to_jsonb(current_project)-array['archived_at','archived_by','archive_reason']) is distinct from
    (to_jsonb(old)-array['archived_at','archived_by','archive_reason'])) then raise exception 'Historical project data changed beyond archival'; end if;
  if exists(select 1 from cutover_before_audit old left join public.grc_audit_events a on a.id=old.id
    where a.id is null or to_jsonb(a) is distinct from to_jsonb(old)) then raise exception 'Historical audit changed'; end if;
  insert into cutover_result values(jsonb_build_object('precommit','PASS','old_archived',32,'new_active',43,
    'historical_relationships',58,'exact_occurrences',19,'unique_exact',17,'needs_review_occurrences',99,'source_errors',1,
    'duplicates',0,'orphans',0,'batch_id',batch));
end; $cutover$;
select * from cutover_result;
'''
(OUT/'CUTOVER_DRY_RUN.sql').write_text(prefix+'rollback;\n')
(OUT/'CUTOVER_COMMIT.sql').write_text(prefix+'commit;\n')
# Operational rollback preserves all new IDs/audit as an archived cancelled import.
restore=f'''-- QA ONLY. Reverses portfolio visibility without deleting projects/history.
-- Does not reset sequences or erase cutover audit. Keep the schema guards.
begin;
lock table public.cybersecurity_projects, public.portfolio_import_batches in share row exclusive mode;
do $restore$
declare actor uuid;
begin
  if current_user<>'postgres' or session_user<>'postgres' then raise exception 'Wrong execution identity'; end if;
  if (select count(*) from public.cybersecurity_projects where archived_at is null)<>43
     or (select count(*) from public.cybersecurity_projects where id in ({old_ids}) and archived_at is not null)<>32
     or (select count(*) from public.cybersecurity_projects p join public.portfolio_import_projects s on s.id=p.import_staging_id where s.batch_id='{batch}' and p.archived_at is null)<>43
     or (select md5(jsonb_agg((to_jsonb(t)-array['mapping_reference_count','mapping_exact_count','mapping_source_error_count','mapping_completeness'])||jsonb_build_object('archived_at',null,'archived_by',null,'archive_reason',null) order by id)::text) from public.cybersecurity_projects t where id in ({old_ids}))<>'{fp['projects']}'
     or (select md5(jsonb_agg(to_jsonb(t) order by id)::text) from public.cybersecurity_project_requirements t)<>'{fp['project_requirements']}'
     then raise exception 'Rollback guard mismatch; investigate, do not broaden'; end if;
  select user_id into strict actor from public.profiles where role='admin' and is_active order by user_id limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  update public.cybersecurity_projects p set archived_at=now(),archived_by=actor,archive_reason='QA Phase 2B-1 rollback: retain imported IDs and audit'
    from public.portfolio_import_projects s where s.id=p.import_staging_id and s.batch_id='{batch}';
  update public.cybersecurity_projects set archived_at=null,archived_by=null,archive_reason=null where id in ({old_ids});
  update public.portfolio_import_batches set status='cancelled' where id='{batch}';
  if (select count(*) from public.cybersecurity_projects where archived_at is null)<>32
     or (select count(*) from public.cybersecurity_project_requirements)<>58 then raise exception 'Rollback postcondition failed'; end if;
end; $restore$;
select 'PASS: original 32 active; imported 43 retained archived; history preserved' as rollback_result;
'''
(OUT/'RESTORE_OLD_PORTFOLIO.sql').write_text(restore+'commit;\n')
(OUT/'RESTORE_DRILL.sql').write_text(restore+'rollback;\n')
print(json.dumps({'batch':batch,'projects':len(payload),'references':sum(len(p['mappings']) for p in payload),'backup_sha256':sha(OUT/'PRE_CUTOVER_BACKUP.json')},indent=2))
