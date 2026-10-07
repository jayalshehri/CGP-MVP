"""Build the Production portfolio preflight/cutover package from the approved QA payload. No network.

Generates files only; it never connects to a database. Nothing QA-specific is
carried into Production: control ids are re-resolved at execution time from
(framework code, control code); staging/review UUIDs are derived in a
Production namespace; project ids come from Production identity; the acting
user is a Production admin resolved (or passed) at execution time. The approved
payload holds real project names and is NOT tracked in Git: pass it explicitly
and keep --out-dir outside version control.
"""
from pathlib import Path
import argparse,csv,json,hashlib,sys,uuid
ROOT=Path(__file__).resolve().parents[1]
PROD_REF='ahfindosbawqfvhbcplq'
QA_PAYLOAD_SHA='d12770fcb9aa4f0d293513163dbaaddd28d032378ec02e91c9ea6d6c8dcf7073'
QA_SOURCE_SHA='b0dc1bee3a082af6399067c00fbe553e7f38eb1932354f858ff417642011b329'
MIGRATIONS=['20261006095402','20261006095409','20261006102306','20261007185235']
cli=argparse.ArgumentParser(description=__doc__.splitlines()[0])
cli.add_argument('--approved-payload',type=Path,required=True,help='QA APPROVED_PAYLOAD.json (untracked)')
cli.add_argument('--expected-payload-sha',default=QA_PAYLOAD_SHA)
cli.add_argument('--source-sha',default=QA_SOURCE_SHA,help='SHA-256 of the approved source workbook')
cli.add_argument('--out-dir',type=Path,required=True)
cli.add_argument('--operator-user-id',default='',help='Production admin user id; empty = first active admin by user_id')
cli.add_argument('--expected-projects',type=int,default=43)
cli.add_argument('--expected-priorities',default='18,16,9')
cli.add_argument('--expected-references',type=int,default=119)
cli.add_argument('--expected-exact',type=int,default=19,help='exact occurrences that must resolve in Production to COMMIT')
cli.add_argument('--expected-source-errors',type=int,default=1)
cli.add_argument('--old-projects',type=int,default=42)
cli.add_argument('--old-project-requirements',type=int,default=58)
cli.add_argument('--old-project-controls',type=int,default=35)
cli.add_argument('--old-gap-treatments',type=int,default=11)
cli.add_argument('--old-findings',type=int,default=0)
cli.add_argument('--preimage',type=Path,default=None,help='optional JSON of md5 fingerprints from the read-only preflight to pin')
args=cli.parse_args()
if not args.approved_payload.is_file(): sys.exit(f'Missing approved payload: {args.approved_payload}')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
if sha(args.approved_payload)!=args.expected_payload_sha: sys.exit('Approved payload SHA-256 differs from the approved QA payload')
if args.operator_user_id: uuid.UUID(args.operator_user_id)
qa=json.loads(args.approved_payload.read_text())
p1,p2,p3=(int(x) for x in args.expected_priorities.split(','))
refs=[m for p in qa for m in p['mappings']]
assert len(qa)==args.expected_projects and len(refs)==args.expected_references
assert [sum(p['priority']==k for p in qa) for k in ('P1','P2','P3')]==[p1,p2,p3]
assert sum(m['match_status']=='exact_match' for m in refs)==args.expected_exact
assert sum(bool(m['source_error']) for m in refs)==args.expected_source_errors
assert len({p['name'] for p in qa})==len(qa) and len({p['project_code'] for p in qa})==len(qa)
for p in qa:
    exact=[(m['source_framework'],m['source_control_code']) for m in p['mappings'] if m['match_status']=='exact_match']
    assert len(exact)==len(set(exact)),'duplicate exact control within one project'
    for m in p['mappings']:
        assert not (m['source_error'] and m['match_status']=='exact_match')
        if m['match_status']=='exact_match': assert m['source_framework'] and m['source_control_code']

# Production identities: new namespace, no QA ids (control_id/stage ids/users dropped).
batch=str(uuid.uuid5(uuid.NAMESPACE_URL,'cgp-production-portfolio:'+args.source_sha))
payload=[]
for p in qa:
    stage=str(uuid.uuid5(uuid.UUID(batch),f"{p['source_sheet']}:{p['source_row']}"))
    payload.append({'stage_id':stage,'project_code':p['project_code'],'source_sheet':p['source_sheet'],'source_row':p['source_row'],
      'name':p['name'],'priority':p['priority'],'duration_value':p['duration_value'],'duration_unit':p['duration_unit'],
      'work_type':p['work_type'],'executive_owner_code':p['executive_owner_code'],'executive_owner_other':p['executive_owner_other'],
      'raw_references':p['raw_references'],
      'mappings':[{'id':str(uuid.uuid5(uuid.UUID(stage),m['source_reference'])),'source_reference':m['source_reference'],
        'source_framework':m['source_framework'],'source_control_code':m['source_control_code'],
        'candidate':'exact_match' if m['match_status']=='exact_match' else 'needs_review','source_error':bool(m['source_error']),
        'decision_note':m['decision_note'],'raw_span':m['raw_span'],'span_start':m['span_start'],'span_end':m['span_end']} for m in p['mappings']]})
text=json.dumps(payload,ensure_ascii=False)
assert '"control_id"' not in text and '"id": -' not in text
OUT=args.out_dir; OUT.mkdir(parents=True,exist_ok=True)
(OUT/'PROD_PAYLOAD.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
q=lambda s:"'"+str(s).replace("'","''")+"'"
pre=json.loads(args.preimage.read_text()) if args.preimage else {}
pin=lambda key,expr:(f"\n  if ({expr})<>{q(pre[key])} then raise exception 'Preimage drift: {key}'; end if;" if key in pre else '')
exact_pairs=sorted({(m['source_framework'],m['source_control_code']) for p in payload for m in p['mappings'] if m['candidate']=='exact_match'})
reason=f'Approved Production portfolio cutover; source SHA256 {args.source_sha}'
operator=q(args.operator_user_id) if args.operator_user_id else 'null'

# ---------------------------------------------------------------- preflight
names=",\n  ".join(f"({p['source_row']},{q(p['name'])},{q(p['priority'])},{q(p['project_code'])})" for p in payload)
pairs=",\n  ".join(f"({q(f)},{q(c)})" for f,c in exact_pairs)
preflight=f"""-- CGP PRODUCTION ({PROD_REF}) READ-ONLY preflight for the portfolio release.
-- Generated by scripts/build-prod-portfolio-cutover.py. READ ONLY transaction, ends in ROLLBACK.
-- Columns created by the release are read through to_jsonb(row) so this runs on the pre-release schema.
-- Every row of the final GATE result must be pass=true before migration 20261006095402.
begin transaction read only;
set local statement_timeout = '60s';

-- 1) Environment and ledger
select current_database() as db, current_user as executing_role, now() as checked_at,
  (select count(*) from supabase_migrations.schema_migrations) as ledger_rows,
  (select max(version) from supabase_migrations.schema_migrations) as ledger_head;
select v.version, v.expected, m.version is not null as applied, m.name from (values
  ('20260926142039','RC present'),('20260926160317','RC present'),('20260926163224','RC present'),
  ('20260926220727','RC present'),('20260928004709','RC present'),
  ('20260922000000','QA-only: must be absent'),('20260922040000','QA-only: must be absent'),
  ('20261006095402','release: absent'),('20261006095409','release: absent'),
  ('20261006102306','release: absent'),('20261007185235','release: absent')
) v(version,expected) left join supabase_migrations.schema_migrations m on m.version=v.version order by 1;

-- 2) Current projects, statuses, relationships
select status, count(*) from public.cybersecurity_projects group by 1 order by 1;
select 'projects' as item, count(*) as n from public.cybersecurity_projects
union all select 'project_requirements', count(*) from public.cybersecurity_project_requirements
union all select 'project_controls (direct)', count(*) from public.cybersecurity_project_controls
union all select 'gap_treatments', count(*) from public.cybersecurity_project_gap_treatments
union all select 'assessment_findings with project', count(*) from public.assessment_findings where project_id is not null
union all select 'grc_audit_events (projects)', count(*) from public.grc_audit_events where entity_type like 'cybersecurity_project%';
-- Fingerprints to record now and pin with --preimage (order is stable by primary key).
select 'projects' as fingerprint, md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.cybersecurity_projects t
union all select 'project_requirements', md5(coalesce(jsonb_agg(to_jsonb(t) order by t.project_id,t.requirement_id)::text,'[]')) from public.cybersecurity_project_requirements t
union all select 'project_controls', md5(coalesce(jsonb_agg(to_jsonb(t) order by t.project_id,t.control_id)::text,'[]')) from public.cybersecurity_project_controls t
union all select 'gap_treatments', md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.cybersecurity_project_gap_treatments t
union all select 'findings', md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.assessment_findings t where t.project_id is not null
union all select 'project_audit_events', md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.grc_audit_events t where t.entity_type like 'cybersecurity_project%';

-- 3) FK dependencies on projects; triggers and RLS on release tables
select conrelid::regclass as referencing_table, conname, confdeltype as on_delete from pg_constraint
where confrelid='public.cybersecurity_projects'::regclass and contype='f' order by 1,2;
select c.relname, t.tgname, pg_get_triggerdef(t.oid) as def from pg_trigger t join pg_class c on c.oid=t.tgrelid
where not t.tgisinternal and c.relnamespace='public'::regnamespace
  and c.relname in ('cybersecurity_projects','cybersecurity_project_controls','cybersecurity_project_requirements','grc_audit_events') order by 1,2;
select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls from pg_class c
where c.relnamespace='public'::regnamespace and c.relname in ('cybersecurity_projects','cybersecurity_project_controls','cybersecurity_project_requirements','grc_audit_events') order by 1;
select tablename, policyname, permissive, cmd, roles from pg_policies where schemaname='public'
  and tablename in ('cybersecurity_projects','cybersecurity_project_controls','cybersecurity_project_requirements','grc_audit_events') order by 1,2;

-- 4) Activity: long-running transactions and locks on release tables
select pid, usename, application_name, state, now()-xact_start as xact_age, left(query,120) as query
from pg_stat_activity where xact_start is not null and pid<>pg_backend_pid() and now()-xact_start>interval '1 minute' order by xact_start;
select l.pid, c.relname, l.mode, l.granted from pg_locks l join pg_class c on c.oid=l.relation
where l.pid<>pg_backend_pid() and c.relname in ('cybersecurity_projects','cybersecurity_project_controls','cybersecurity_project_requirements',
  'cybersecurity_project_gap_treatments','assessment_findings','grc_audit_events','controls','frameworks') order by 2,1;

-- 5) Exact catalog resolution by (framework code, control code); QA control ids are never used.
with exact(framework_code, control_code) as (values
  {pairs}
)
select e.framework_code, e.control_code, count(c.id) as production_matches, bool_and(f.is_active) as framework_active, min(c.id) as production_control_id
from exact e left join public.frameworks f on f.code=e.framework_code
left join public.controls c on c.framework_id=f.id and c.control_code=e.control_code
group by 1,2 order by 1,2;

-- 6) GATE (all rows must pass)
with approved(source_row, name, priority, project_code) as (values
  {names}
), exact(framework_code, control_code) as (values
  {pairs}
), resolved as (
  select e.*, (select count(*) from public.controls c join public.frameworks f on f.id=c.framework_id
    where f.is_active and f.code=e.framework_code and c.control_code=e.control_code) as matches from exact e
), cols(name) as (values ('planned_start_date'),('actual_start_date'),('target_end_date'),('actual_end_date'),('forecast_end_date'),
  ('initiative_type'),('priority'),('executive_owner'),('planned_year'),('planned_quarter'),('created_by'))
select gate, pass, detail from (values
 ('identity is postgres', current_user='postgres', current_user::text),
 ('5 RC migrations applied', (select count(*) from supabase_migrations.schema_migrations where version in ('20260926142039','20260926160317','20260926163224','20260926220727','20260928004709'))=5, ''),
 ('QA-only versions absent', not exists(select 1 from supabase_migrations.schema_migrations where version in ('20260922000000','20260922040000')), ''),
 ('4 release migrations not yet applied', not exists(select 1 from supabase_migrations.schema_migrations where version in ({','.join(q(v) for v in MIGRATIONS)})), ''),
 ('release tables absent', to_regclass('public.portfolio_import_batches') is null and to_regclass('public.portfolio_import_projects') is null and to_regclass('public.portfolio_mapping_reviews') is null, ''),
 ('release columns absent', not exists(select 1 from information_schema.columns where table_schema='public' and table_name='cybersecurity_projects'
   and column_name in ('portfolio_priority','archived_at','import_staging_id','mapping_completeness')), ''),
 ('release functions absent', to_regprocedure('private.prevent_project_hard_delete()') is null and to_regprocedure('private.guard_portfolio_activation()') is null
   and to_regprocedure('private.stamp_portfolio_creator()') is null and to_regprocedure('private.stamp_project_archive()') is null, ''),
 ('release audit policies absent', not exists(select 1 from pg_policies where tablename='grc_audit_events' and policyname like 'portfolio_audit_events%'), ''),
 ('prerequisite functions present', to_regprocedure('private.current_user_role()') is not null and to_regprocedure('private.grc_audit()') is not null and to_regprocedure('auth.uid()') is not null, ''),
 ('prerequisite tables present', to_regclass('public.controls') is not null and to_regclass('public.frameworks') is not null and to_regclass('public.cybersecurity_requirements') is not null and to_regclass('auth.users') is not null, ''),
 ('columns referenced by 95402 exist', (select count(*) from information_schema.columns c join cols on cols.name=c.column_name where c.table_schema='public' and c.table_name='cybersecurity_projects')=11, ''),
 ('projects = {args.old_projects}', (select count(*) from public.cybersecurity_projects)={args.old_projects}, (select count(*) from public.cybersecurity_projects)::text),
 ('project_requirements = {args.old_project_requirements}', (select count(*) from public.cybersecurity_project_requirements)={args.old_project_requirements}, (select count(*) from public.cybersecurity_project_requirements)::text),
 ('project_controls = {args.old_project_controls}', (select count(*) from public.cybersecurity_project_controls)={args.old_project_controls}, (select count(*) from public.cybersecurity_project_controls)::text),
 ('gap_treatments = {args.old_gap_treatments}', (select count(*) from public.cybersecurity_project_gap_treatments)={args.old_gap_treatments}, (select count(*) from public.cybersecurity_project_gap_treatments)::text),
 ('findings linked = {args.old_findings}', (select count(*) from public.assessment_findings where project_id is not null)={args.old_findings}, (select count(*) from public.assessment_findings where project_id is not null)::text),
 ('orphans = 0', (select count(*) from public.cybersecurity_project_requirements r left join public.cybersecurity_projects p on p.id=r.project_id where p.id is null)
   +(select count(*) from public.cybersecurity_project_controls r left join public.cybersecurity_projects p on p.id=r.project_id where p.id is null)
   +(select count(*) from public.cybersecurity_project_gap_treatments r left join public.cybersecurity_projects p on p.id=r.project_id where p.id is null)
   +(select count(*) from public.assessment_findings r left join public.cybersecurity_projects p on p.id=r.project_id where r.project_id is not null and p.id is null)
   +(select count(*) from public.cybersecurity_project_controls r left join public.controls c on c.id=r.control_id where c.id is null)=0, ''),
 ('no duplicate names among current projects (95402/102306 active-name index)', not exists(select 1 from public.cybersecurity_projects group by name_ar having count(*)>1), ''),
 ('{len(payload)} approved names, P1/P2/P3 = {p1}/{p2}/{p3}', (select count(*) from approved)={len(payload)} and (select count(distinct name) from approved)={len(payload)}
   and (select count(*) filter (where priority='P1')||'/'||count(*) filter (where priority='P2')||'/'||count(*) filter (where priority='P3') from approved)='{p1}/{p2}/{p3}', ''),
 ('approved names: exact collisions with current projects = 0', not exists(select 1 from approved a join public.cybersecurity_projects p on p.name_ar=a.name),
   (select count(*) from approved a join public.cybersecurity_projects p on p.name_ar=a.name)::text),
 ('approved project codes unused', not exists(select 1 from approved a join public.cybersecurity_projects p on p.project_code=a.project_code), ''),
 ('exact pairs resolve to exactly one active control', not exists(select 1 from resolved where matches<>1),
   (select count(*) filter (where matches=1)||' of '||count(*) from resolved)),
 ('an active admin profile exists (cutover actor)', exists(select 1 from public.profiles where role='admin' and is_active{(' and user_id='+operator+'::uuid') if args.operator_user_id else ''}), ''),
 ('no transaction older than 5 minutes', not exists(select 1 from pg_stat_activity where xact_start is not null and pid<>pg_backend_pid() and now()-xact_start>interval '5 minutes'), ''),
 ('no ungranted locks on release tables', not exists(select 1 from pg_locks l join pg_class c on c.oid=l.relation where not l.granted
   and c.relname in ('cybersecurity_projects','cybersecurity_project_controls','cybersecurity_project_requirements','grc_audit_events')), '')
) g(gate, pass, detail);

rollback;
"""
(OUT/'production-readonly-portfolio-gap.sql').write_text(preflight)

# ---------------------------------------------------------------- cutover
def cutover(enforce:bool)->str:
    return f"""-- PRODUCTION ONLY ({PROD_REF}). Portfolio data cutover: staging, mapping review,
-- archive of every pre-release project, import of the approved {len(payload)}, exact control links.
-- Requires migrations 20261006095402, 20261006095409 and 20261006102306 (102306 replaces
-- the Phase 1 activation block, adds source_error / mapping_review_id / active-name index).
-- One transaction. No QA ids: controls resolve by (framework code, control code).
-- {'COMMIT: refuses unless all '+str(args.expected_exact)+' exact references resolve in Production.' if enforce else 'DRY RUN: reports resolution and ends in ROLLBACK.'}
begin;
set local lock_timeout='10s';
set local statement_timeout='120s';
lock table public.cybersecurity_projects, public.cybersecurity_project_requirements, public.cybersecurity_project_controls,
 public.cybersecurity_project_gap_treatments, public.portfolio_import_batches, public.portfolio_import_projects,
 public.portfolio_mapping_reviews in share row exclusive mode;
create temporary table cutover_before_projects on commit drop as select * from public.cybersecurity_projects;
create temporary table cutover_before_links on commit drop as select * from public.cybersecurity_project_controls;
create temporary table cutover_before_requirements on commit drop as select * from public.cybersecurity_project_requirements;
create temporary table cutover_before_treatments on commit drop as select * from public.cybersecurity_project_gap_treatments;
create temporary table cutover_before_findings on commit drop as select * from public.assessment_findings where project_id is not null;
create temporary table cutover_before_audit on commit drop as select id, md5(to_jsonb(a)::text) as h from public.grc_audit_events a;
create temporary table cutover_result(result jsonb) on commit drop;
do $cutover$
declare payload jsonb := $payload${text}$payload$::jsonb;
  p jsonb; r jsonb; actor uuid; batch uuid := '{batch}'; new_id bigint; resolved bigint; matches integer; n integer;
  enforce_exact boolean := {'true' if enforce else 'false'}; exact_ok integer := 0; downgraded jsonb := '[]'::jsonb;
begin
  if current_user<>'postgres' or session_user<>'postgres' then raise exception 'Wrong execution identity'; end if;
  if (select count(*) from supabase_migrations.schema_migrations where version in ('20261006095402','20261006095409','20261006102306'))<>3
     or to_regprocedure('private.guard_portfolio_activation()') is null
     or exists(select 1 from pg_trigger where tgname='block_portfolio_import_phase1')
     then raise exception 'Schema prerequisites (95402, 95409, 102306) are not complete'; end if;
  select user_id into strict actor from public.profiles where role='admin' and is_active
    and ({operator}::uuid is null or user_id={operator}::uuid) order by user_id limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  if exists(select 1 from public.portfolio_import_batches where id=batch) then
    -- Replay: zero business-row writes; the postimage below is verified again.
    if not exists(select 1 from public.portfolio_import_batches where id=batch and source_sha256='{args.source_sha}' and status='validated') then
      raise exception 'Batch identity or status differs'; end if;
  else
    if (select count(*) from public.cybersecurity_projects)<>{args.old_projects}
      or exists(select 1 from public.cybersecurity_projects where archived_at is not null or import_staging_id is not null)
      or (select count(*) from public.cybersecurity_project_requirements)<>{args.old_project_requirements}
      or (select count(*) from public.cybersecurity_project_controls)<>{args.old_project_controls}
      or exists(select 1 from public.cybersecurity_project_controls where mapping_review_id is not null)
      or (select count(*) from public.cybersecurity_project_gap_treatments)<>{args.old_gap_treatments}
      or (select count(*) from public.assessment_findings where project_id is not null)<>{args.old_findings}
      or exists(select 1 from public.portfolio_import_batches) or exists(select 1 from public.portfolio_import_projects)
      or exists(select 1 from public.portfolio_mapping_reviews)
      or exists(select 1 from public.cybersecurity_projects where project_code in (select value->>'project_code' from jsonb_array_elements(payload)))
      or exists(select 1 from public.cybersecurity_projects where name_ar in (select value->>'name' from jsonb_array_elements(payload)))
      then raise exception 'Production preimage differs from the approved preflight'; end if;{pin('projects',"select md5(coalesce(jsonb_agg(to_jsonb(t)-array['portfolio_priority','execution_year','work_type','executive_owner_code','executive_owner_other','duration_value','duration_unit','archived_at','archived_by','archive_reason','import_staging_id','mapping_reference_count','mapping_exact_count','mapping_source_error_count','mapping_completeness'] order by t.id)::text,'[]')) from public.cybersecurity_projects t")}{pin('project_requirements',"select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.project_id,t.requirement_id)::text,'[]')) from public.cybersecurity_project_requirements t")}{pin('project_controls',"select md5(coalesce(jsonb_agg(to_jsonb(t)-'mapping_review_id' order by t.project_id,t.control_id)::text,'[]')) from public.cybersecurity_project_controls t")}
    insert into public.portfolio_import_batches(id,source_filename,source_sha256,status,created_by)
      values(batch,'CGP_Project_Portfolio_Analysis.xlsx','{args.source_sha}','validated',actor);
    for p in select value from jsonb_array_elements(payload) loop
      insert into public.portfolio_import_projects(id,batch_id,source_sheet,source_row,source_project_name,priority,
        duration_value,duration_unit,work_type,executive_owner_code,executive_owner_other,source_payload,created_by)
      values((p->>'stage_id')::uuid,batch,p->>'source_sheet',(p->>'source_row')::integer,p->>'name',p->>'priority',
        (p->>'duration_value')::numeric,p->>'duration_unit',p->>'work_type',p->>'executive_owner_code',p->>'executive_owner_other',p,actor);
      for r in select value from jsonb_array_elements(p->'mappings') loop
        resolved := null; matches := 0;
        if r->>'candidate'='exact_match' then
          select count(*),min(c.id) into matches,resolved from public.controls c join public.frameworks f on f.id=c.framework_id
            where f.is_active and f.code=r->>'source_framework' and c.control_code=r->>'source_control_code';
          if matches=1 then exact_ok := exact_ok+1;
          else resolved := null; downgraded := downgraded||jsonb_build_object('project_code',p->>'project_code','reference',r->>'source_reference','matches',matches);
          end if;
        end if;
        insert into public.portfolio_mapping_reviews(id,staged_project_id,source_reference,source_framework,source_control_code,
          control_id,match_status,review_status,decision_note,source_error,created_by)
        values((r->>'id')::uuid,(p->>'stage_id')::uuid,r->>'source_reference',r->>'source_framework',r->>'source_control_code',
          resolved,case when resolved is not null then 'exact_match' else 'needs_review' end,
          case when resolved is not null then 'approved' else 'pending' end,
          case when resolved is not null then 'Approved exact framework/control code; resolved in the Production catalog'
               when r->>'candidate'='exact_match' then 'Production catalog did not resolve this code exactly; needs_review'
               else r->>'decision_note' end,
          (r->>'source_error')::boolean,actor);
      end loop;
    end loop;
    if enforce_exact and exact_ok<>{args.expected_exact} then
      raise exception 'Only % of {args.expected_exact} exact references resolve in Production: %',exact_ok,downgraded; end if;
    -- Every pre-release project is archived. Status and every relationship stay on it.
    update public.cybersecurity_projects set archived_at=now(),archived_by=actor,archive_reason={q(reason)}
      where archived_at is null and import_staging_id is null;
    get diagnostics n = row_count;
    if n<>{args.old_projects} then raise exception 'Archived % projects, expected {args.old_projects}',n; end if;
    for p in select value from jsonb_array_elements(payload) loop
      insert into public.cybersecurity_projects(project_code,name_ar,portfolio_priority,duration_value,duration_unit,
        work_type,executive_owner_code,executive_owner_other,status,import_staging_id,created_by)
      values(p->>'project_code',p->>'name',p->>'priority',(p->>'duration_value')::numeric,p->>'duration_unit',
        p->>'work_type',p->>'executive_owner_code',p->>'executive_owner_other','planned',(p->>'stage_id')::uuid,actor)
      returning id into new_id;
      insert into public.cybersecurity_project_controls(project_id,control_id,mapping_review_id,notes,created_by)
      select new_id,m.control_id,m.id,'Approved exact source mapping (framework + control code); no inferred coverage completeness',actor
      from public.portfolio_mapping_reviews m where m.staged_project_id=(p->>'stage_id')::uuid
        and m.match_status='exact_match' and m.review_status='approved' and not m.source_error;
    end loop;
  end if;
  select count(*) into exact_ok from public.portfolio_mapping_reviews where match_status='exact_match' and review_status='approved';
  if (select count(*) from public.cybersecurity_projects p join cutover_before_projects b on b.id=p.id where p.archived_at is not null and p.archive_reason={q(reason)})<>{args.old_projects}
     or (select count(*) from public.cybersecurity_projects where archived_at is null)<>{len(payload)}
     or (select count(*) from public.cybersecurity_projects)<>{args.old_projects+len(payload)} then raise exception 'Cutover counts failed'; end if;
  if (select count(*) from public.cybersecurity_projects where archived_at is null and portfolio_priority='P1')<>{p1}
     or (select count(*) from public.cybersecurity_projects where archived_at is null and portfolio_priority='P2')<>{p2}
     or (select count(*) from public.cybersecurity_projects where archived_at is null and portfolio_priority='P3')<>{p3} then raise exception 'Priority distribution failed'; end if;
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
      and c.mapping_exact_count=(select count(*) from public.portfolio_mapping_reviews m where m.staged_project_id=c.import_staging_id and m.match_status='exact_match' and m.review_status='approved')
      and c.mapping_source_error_count=(select count(*) from jsonb_array_elements(p->'mappings') m where (m->>'source_error')::boolean))
      then raise exception 'Imported project differs from approved row %',p->>'source_row'; end if;
  end loop;
  if (select count(*) from public.cybersecurity_project_controls where mapping_review_id is not null)<>exact_ok
    or (select count(*) from public.cybersecurity_project_controls)<>{args.old_project_controls}+exact_ok
    or (select count(*) from public.portfolio_mapping_reviews where source_error)<>{args.expected_source_errors}
    or (select count(*) from public.portfolio_mapping_reviews where source_error and (match_status<>'needs_review' or review_status<>'pending'))<>0
    or (select count(*) from public.portfolio_mapping_reviews where match_status='needs_review' and not source_error)<>{args.expected_references-args.expected_exact-args.expected_source_errors}+({args.expected_exact}-exact_ok)
    or (select count(*) from public.portfolio_mapping_reviews)<>{args.expected_references}
    or (select count(*) from public.portfolio_import_projects where batch_id=batch)<>{len(payload)} then raise exception 'Mapping totals failed'; end if;
  if exists(select 1 from public.cybersecurity_project_controls l left join public.portfolio_mapping_reviews r on r.id=l.mapping_review_id
    left join public.cybersecurity_projects p on p.id=l.project_id left join public.controls c on c.id=l.control_id
    where l.mapping_review_id is not null and (r.id is null or p.id is null or c.id is null or r.match_status<>'exact_match' or r.review_status<>'approved'
      or r.source_error or p.import_staging_id<>r.staged_project_id or l.control_id<>r.control_id))
    or exists(select 1 from public.portfolio_mapping_reviews where match_status='needs_review' and (review_status<>'pending' or control_id is not null))
    then raise exception 'Unapproved or orphan mapping'; end if;
  if exists(select 1 from public.portfolio_mapping_reviews r left join public.portfolio_import_projects s on s.id=r.staged_project_id where s.id is null)
    or exists(select 1 from public.portfolio_import_projects s left join public.portfolio_import_batches b on b.id=s.batch_id where b.id is null)
    then raise exception 'Orphan staging row'; end if;
  -- Historical rows: identical apart from archival (and the release's derived/default columns).
  if exists(select 1 from cutover_before_projects b left join public.cybersecurity_projects c on c.id=b.id
    where c.id is null or (to_jsonb(c)-array['archived_at','archived_by','archive_reason','updated_at','mapping_reference_count','mapping_exact_count','mapping_source_error_count','mapping_completeness'])
      is distinct from (to_jsonb(b)-array['archived_at','archived_by','archive_reason','updated_at','mapping_reference_count','mapping_exact_count','mapping_source_error_count','mapping_completeness']))
    then raise exception 'Historical project data changed beyond archival'; end if;
  if exists(select 1 from cutover_before_links b left join public.cybersecurity_project_controls c on c.project_id=b.project_id and c.control_id=b.control_id
      where c.project_id is null or to_jsonb(c) is distinct from to_jsonb(b))
    or exists(select 1 from cutover_before_requirements b left join public.cybersecurity_project_requirements c on c.project_id=b.project_id and c.requirement_id=b.requirement_id
      where c.project_id is null or to_jsonb(c) is distinct from to_jsonb(b))
    or (select count(*) from public.cybersecurity_project_requirements)<>{args.old_project_requirements}
    or exists(select 1 from cutover_before_treatments b left join public.cybersecurity_project_gap_treatments c on c.id=b.id where c.id is null or to_jsonb(c) is distinct from to_jsonb(b))
    or (select count(*) from public.cybersecurity_project_gap_treatments)<>{args.old_gap_treatments}
    or exists(select 1 from cutover_before_findings b left join public.assessment_findings c on c.id=b.id where c.id is null or to_jsonb(c) is distinct from to_jsonb(b))
    or (select count(*) from public.assessment_findings where project_id is not null)<>{args.old_findings}
    then raise exception 'Historical relationships changed'; end if;
  if exists(select 1 from cutover_before_audit b left join public.grc_audit_events a on a.id=b.id where a.id is null or md5(to_jsonb(a)::text)<>b.h)
    then raise exception 'Historical audit changed'; end if;
  insert into cutover_result values(jsonb_build_object('precommit','PASS','mode',{q('COMMIT' if enforce else 'DRY_RUN')},'actor',actor,'batch_id',batch,
    'old_archived',{args.old_projects},'new_active',{len(payload)},
    'priorities',jsonb_build_object('P1',{p1},'P2',{p2},'P3',{p3}),
    'mapping_reviews',(select count(*) from public.portfolio_mapping_reviews),
    'exact_resolved_approved',exact_ok,'exact_expected',{args.expected_exact},'exact_downgraded_to_needs_review',downgraded,
    'needs_review_pending',(select count(*) from public.portfolio_mapping_reviews where match_status='needs_review' and not source_error),
    'source_errors',(select count(*) from public.portfolio_mapping_reviews where source_error),
    'new_control_links',(select count(*) from public.cybersecurity_project_controls where mapping_review_id is not null),
    'historical',jsonb_build_object('project_requirements',{args.old_project_requirements},'direct_links',{args.old_project_controls},'gap_treatments',{args.old_gap_treatments},'findings',{args.old_findings}),
    'duplicates',0,'orphans',0));
end; $cutover$;
select * from cutover_result;
"""
(OUT/'PROD_CUTOVER_DRY_RUN.sql').write_text(cutover(False)+'rollback;\n')
(OUT/'PROD_CUTOVER_COMMIT.sql').write_text(cutover(True)+'commit;\n')

# ---------------------------------------------------------------- forward recovery (data)
restore=f"""-- PRODUCTION ONLY ({PROD_REF}). Forward recovery for the data cutover: the pre-release
-- projects become active again; the imported {len(payload)} stay (archived) with their ids,
-- links and audit; the batch is cancelled. Nothing is deleted. Schema is kept.
begin;
set local lock_timeout='10s';
lock table public.cybersecurity_projects, public.portfolio_import_batches in share row exclusive mode;
do $restore$
declare actor uuid; n integer;
begin
  if current_user<>'postgres' or session_user<>'postgres' then raise exception 'Wrong execution identity'; end if;
  if (select count(*) from public.cybersecurity_projects p join public.portfolio_import_projects s on s.id=p.import_staging_id
        where s.batch_id='{batch}' and p.archived_at is null)<>{len(payload)}
     or (select count(*) from public.cybersecurity_projects where import_staging_id is null and archive_reason={q(reason)})<>{args.old_projects}
     or (select count(*) from public.cybersecurity_project_requirements)<>{args.old_project_requirements}
     then raise exception 'Recovery guard mismatch; investigate, do not broaden'; end if;
  select user_id into strict actor from public.profiles where role='admin' and is_active
    and ({operator}::uuid is null or user_id={operator}::uuid) order by user_id limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  -- Imported first: the active-name index then admits the restored projects.
  update public.cybersecurity_projects p set archived_at=now(),archived_by=actor,archive_reason='Production portfolio cutover recovery: imported projects retained, archived'
    from public.portfolio_import_projects s where s.id=p.import_staging_id and s.batch_id='{batch}' and p.archived_at is null;
  update public.cybersecurity_projects set archived_at=null,archived_by=null,archive_reason=null
    where import_staging_id is null and archive_reason={q(reason)};
  get diagnostics n = row_count;
  update public.portfolio_import_batches set status='cancelled' where id='{batch}';
  if n<>{args.old_projects} or (select count(*) from public.cybersecurity_projects where archived_at is null)<>{args.old_projects}
     or (select count(*) from public.cybersecurity_project_requirements)<>{args.old_project_requirements}
     or (select count(*) from public.cybersecurity_project_controls where mapping_review_id is null)<>{args.old_project_controls}
     then raise exception 'Recovery postcondition failed'; end if;
end; $restore$;
select 'PASS: {args.old_projects} pre-release projects active; imported {len(payload)} retained archived; history preserved' as recovery_result;
"""
(OUT/'PROD_RESTORE_DRILL.sql').write_text(restore+'rollback;\n')
(OUT/'PROD_RESTORE_OLD_PORTFOLIO.sql').write_text(restore+'commit;\n')

# ---------------------------------------------------------------- post-check (read only)
postcheck=f"""-- PRODUCTION ({PROD_REF}) READ-ONLY post-check after the cutover and 20261007185235.
begin transaction read only;
select gate, pass, detail from (values
 ('4 release migrations in ledger', (select count(*) from supabase_migrations.schema_migrations where version in ({','.join(q(v) for v in MIGRATIONS)}))=4, ''),
 ('Phase 1 block trigger removed', not exists(select 1 from pg_trigger where tgname='block_portfolio_import_phase1'), ''),
 ('guards present', (select count(*) from pg_trigger where tgname in ('prevent_project_hard_delete','guard_portfolio_activation','guard_portfolio_exact_link','guard_activated_portfolio_review','guard_portfolio_staging_review','guard_portfolio_source','guard_portfolio_batch'))=7, ''),
 ('hardening triggers present', (select count(*) from pg_trigger where tgname='stamp_portfolio_creator')=4 and (select count(*) from pg_trigger where tgname='stamp_project_archive')=1, ''),
 ('audit policies present', (select count(*) from pg_policies where tablename='grc_audit_events' and policyname in ('portfolio_audit_events_team','portfolio_audit_events_restrict'))=2
   and (select permissive from pg_policies where tablename='grc_audit_events' and policyname='portfolio_audit_events_restrict')='RESTRICTIVE', ''),
 ('staging RLS on', (select bool_and(relrowsecurity) from pg_class where oid in ('public.portfolio_import_batches'::regclass,'public.portfolio_import_projects'::regclass,'public.portfolio_mapping_reviews'::regclass)), ''),
 ('active = {len(payload)}', (select count(*) from public.cybersecurity_projects where archived_at is null)={len(payload)}, (select count(*) from public.cybersecurity_projects where archived_at is null)::text),
 ('archived pre-release = {args.old_projects}', (select count(*) from public.cybersecurity_projects where archived_at is not null and import_staging_id is null)={args.old_projects}, ''),
 ('P1/P2/P3 = {p1}/{p2}/{p3}', (select count(*) filter (where portfolio_priority='P1')||'/'||count(*) filter (where portfolio_priority='P2')||'/'||count(*) filter (where portfolio_priority='P3') from public.cybersecurity_projects where archived_at is null)='{p1}/{p2}/{p3}', ''),
 ('pre-release statuses preserved', true, (select string_agg(status||'='||n,', ' order by status) from (select status,count(*) n from public.cybersecurity_projects where import_staging_id is null group by 1) s)),
 ('historical relationships', (select count(*) from public.cybersecurity_project_requirements)={args.old_project_requirements}
   and (select count(*) from public.cybersecurity_project_controls where mapping_review_id is null)={args.old_project_controls}
   and (select count(*) from public.cybersecurity_project_gap_treatments)={args.old_gap_treatments}, ''),
 ('approved exact links only', (select count(*) from public.cybersecurity_project_controls where mapping_review_id is not null)
   =(select count(*) from public.portfolio_mapping_reviews where match_status='exact_match' and review_status='approved'),
   (select count(*) from public.cybersecurity_project_controls where mapping_review_id is not null)::text),
 ('mapping reviews = {args.expected_references}; source_error = {args.expected_source_errors}', (select count(*) from public.portfolio_mapping_reviews)={args.expected_references}
   and (select count(*) from public.portfolio_mapping_reviews where source_error)={args.expected_source_errors}, ''),
 ('orphans = 0', (select count(*) from public.cybersecurity_project_requirements r left join public.cybersecurity_projects p on p.id=r.project_id where p.id is null)
   +(select count(*) from public.cybersecurity_project_controls r left join public.cybersecurity_projects p on p.id=r.project_id where p.id is null)
   +(select count(*) from public.cybersecurity_project_gap_treatments r left join public.cybersecurity_projects p on p.id=r.project_id where p.id is null)=0, ''),
 ('no duplicate active names', not exists(select 1 from public.cybersecurity_projects where archived_at is null group by name_ar having count(*)>1), '')
) g(gate, pass, detail);
select mapping_completeness, count(*) from public.cybersecurity_projects where archived_at is null group by 1 order by 1;
rollback;
"""
(OUT/'PROD_POSTCHECK.sql').write_text(postcheck)

# ---------------------------------------------------------------- offline dry-run preview
with (OUT/'DRY_RUN_PROJECTS.csv').open('w',newline='',encoding='utf-8') as f:
    w=csv.writer(f); w.writerow(['project_code','source_row','name_ar','priority','execution_year','work_type','executive_owner_code','executive_owner_other','duration_value','duration_unit','status','references','exact_candidates','source_errors'])
    for p in payload:
        w.writerow([p['project_code'],p['source_row'],p['name'],p['priority'],p['priority'][1],p['work_type'],p['executive_owner_code'],p['executive_owner_other'] or '',
          p['duration_value'],p['duration_unit'],'planned',len(p['mappings']),sum(m['candidate']=='exact_match' for m in p['mappings']),sum(m['source_error'] for m in p['mappings'])])
with (OUT/'DRY_RUN_MAPPINGS.csv').open('w',newline='',encoding='utf-8') as f:
    w=csv.writer(f); w.writerow(['project_code','source_reference','source_framework','source_control_code','intended_match_status','intended_review_status','source_error','production_control_id'])
    for p in payload:
        for m in p['mappings']:
            exact=m['candidate']=='exact_match'
            w.writerow([p['project_code'],m['source_reference'],m['source_framework'],m['source_control_code'] or '',
              'exact_match (if resolved)' if exact else 'needs_review','approved (if resolved)' if exact else 'pending',m['source_error'],
              'resolved at execution by framework+code' if exact else ''])
summary={'production_ref':PROD_REF,'batch_id':batch,'approved_payload_sha256':args.expected_payload_sha,'source_sha256':args.source_sha,
  'projects':len(payload),'priorities':{'P1':p1,'P2':p2,'P3':p3},
  'work_type':{k:sum(p['work_type']==k for p in payload) for k in sorted({p['work_type'] for p in payload})},
  'executive_owner':{k:sum(p['executive_owner_code']==k for p in payload) for k in sorted({p['executive_owner_code'] for p in payload})},
  'duration_unit':{k:sum(p['duration_unit']==k for p in payload) for k in sorted({p['duration_unit'] for p in payload})},
  'references':len(refs),'exact_candidates':args.expected_exact,'unique_exact_pairs':len(exact_pairs),
  'needs_review':args.expected_references-args.expected_exact-args.expected_source_errors,'source_errors':args.expected_source_errors,
  'old_projects_archived':args.old_projects,'operator':args.operator_user_id or 'first active admin by user_id','pinned_fingerprints':sorted(pre)}
(OUT/'DRY_RUN_SUMMARY.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
files=sorted(x for x in OUT.iterdir() if x.is_file() and x.name!='MANIFEST.sha256')
(OUT/'MANIFEST.sha256').write_text(''.join(f'{sha(x)}  {x.name}\n' for x in files))
print(json.dumps(summary,ensure_ascii=False,indent=2))
