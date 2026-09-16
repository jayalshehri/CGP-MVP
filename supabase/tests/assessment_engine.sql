begin;
insert into auth.users(id) select ('20000000-0000-4000-8000-00000000000'||n)::uuid from generate_series(1,6) n;
insert into public.profiles(user_id,display_name,role,is_active) values
('20000000-0000-4000-8000-000000000001','Assessor','cybersecurity_team',true),
('20000000-0000-4000-8000-000000000002','Reviewer','cybersecurity_team',true),
('20000000-0000-4000-8000-000000000003','Approver','admin',true),
('20000000-0000-4000-8000-000000000004','Owner','control_owner',true),
('20000000-0000-4000-8000-000000000005','Other owner','control_owner',true),
('20000000-0000-4000-8000-000000000006','Auditor','nca_external_auditor',true);
insert into frameworks(id,code,name_ar,name_en,version) values(-920001,'ENGINE-QA','اختبار','Test','v1');
insert into controls(id,framework_id,control_code,title_ar,domain_ar,control_owner_id) values
(-920001,-920001,'1-1-1','Parent','Governance',null),
(-920002,-920001,'1-1-1-1','Requirement','Governance','20000000-0000-4000-8000-000000000004'),
(-920003,-920001,'1-1-2','Not applicable requirement','Governance',null);
insert into storage.objects(bucket_id,name,owner_id) values('evidence-files','-920002/qa.pdf','20000000-0000-4000-8000-000000000004');
create function pg_temp.expect_error(statement text) returns void language plpgsql as $$ declare failed boolean:=false; begin
 begin execute statement; exception when others then failed:=true; end;
 if not failed then raise exception 'Expected rejection: %',statement; end if;
end $$;
create function pg_temp.command(action text,data jsonb default '{}') returns jsonb language sql as $$ select public.cgp_assessment_command(action,current_setting('qa.cycle')::bigint,jsonb_build_object('cycle_revision',(select revision from public.assessment_cycles where id=current_setting('qa.cycle')::bigint))||data); $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('qa.cycle',(public.cgp_assessment_command('create',null,'{"framework_id":-920001,"scope_name":"Scope A"}')->>'id'),true);
select set_config('qa.item',(select id::text from assessment_items where cycle_id=current_setting('qa.cycle')::bigint and control_id=-920002),true);
do $$ begin
 if (select count(*) from assessment_items where cycle_id=current_setting('qa.cycle')::bigint and is_scoring)<>2 then raise exception 'Parent counted twice'; end if;
end $$;
select pg_temp.expect_error($q$select pg_temp.command('start')$q$);
select pg_temp.command('configure',jsonb_build_object('assessor_id','20000000-0000-4000-8000-000000000001','reviewer_id','20000000-0000-4000-8000-000000000002','approver_id','20000000-0000-4000-8000-000000000003','due_date',current_date+10));
select pg_temp.expect_error($q$select pg_temp.command('scope',jsonb_build_object('reason','bad parent and child','item_ids',(select jsonb_agg(id) from assessment_items where cycle_id=current_setting('qa.cycle')::bigint)))$q$);
select pg_temp.command('scope',jsonb_build_object('reason','Leaf requirements reviewed','item_ids',(select jsonb_agg(id) from assessment_items where cycle_id=current_setting('qa.cycle')::bigint and is_scoring)));
select pg_temp.command('start');
select pg_temp.expect_error($q$select pg_temp.command('submit')$q$);
select pg_temp.command('save',jsonb_build_object('item_id',current_setting('qa.item')::bigint,'revision',(select revision from assessment_items where id=current_setting('qa.item')::bigint),'compliance_status','not_implemented','notes','Gap identified','corrective_action','Implement requirement','owner_id','20000000-0000-4000-8000-000000000004','expected_compliance_date',current_date+3));
select pg_temp.expect_error($q$select pg_temp.command('save',jsonb_build_object('item_id',current_setting('qa.item')::bigint,'revision',0,'compliance_status','implemented','notes','Stale save'))$q$);
-- Explicit clear works and does not restore an old note.
select pg_temp.command('save',jsonb_build_object('item_id',current_setting('qa.item')::bigint,'revision',(select revision from assessment_items where id=current_setting('qa.item')::bigint),'compliance_status','','notes','','corrective_action','','expected_compliance_date',''));
do $$ begin if exists(select 1 from assessment_items where id=current_setting('qa.item')::bigint and (notes is not null or compliance_status is not null)) then raise exception 'Clearing restored stale fields'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select set_config('qa.evidence',(public.cgp_grc_command('submit',-920002,'{"file_path":"-920002/qa.pdf","file_name":"qa.pdf","evidence_name":"QA","file_size":20}')->>'id'),true);
select pg_temp.expect_error($q$select public.cgp_assessment_command('create',null,'{"framework_id":-920001,"scope_name":"Unauthorized"}')$q$);
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.cgp_review_evidence(current_setting('qa.evidence')::bigint,'accepted','Independent evidence review');
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.command('save',jsonb_build_object('item_id',current_setting('qa.item')::bigint,'revision',(select revision from assessment_items where id=current_setting('qa.item')::bigint),'compliance_status','implemented','notes','Tested against current evidence','owner_id','20000000-0000-4000-8000-000000000004','evidence_ids',jsonb_build_array(current_setting('qa.evidence')::bigint)));
select pg_temp.command('save',jsonb_build_object('item_id',(select id from assessment_items where cycle_id=current_setting('qa.cycle')::bigint and control_id=-920003),'revision',(select revision from assessment_items where cycle_id=current_setting('qa.cycle')::bigint and control_id=-920003),'compliance_status','not_applicable','notes','Documented scope exclusion'));
select pg_temp.command('submit');
select pg_temp.expect_error($q$select pg_temp.command('review',jsonb_build_object('item_id',current_setting('qa.item')::bigint,'revision',(select revision from assessment_items where id=current_setting('qa.item')::bigint),'decision','accepted','reason','self'))$q$);
select pg_temp.expect_error($q$select pg_temp.command('save',jsonb_build_object('item_id',current_setting('qa.item')::bigint,'revision',(select revision from assessment_items where id=current_setting('qa.item')::bigint),'notes','edit under review'))$q$);
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare r record; begin for r in select * from assessment_items where cycle_id=current_setting('qa.cycle')::bigint and is_scoring loop perform pg_temp.command('review',jsonb_build_object('item_id',r.id,'revision',r.revision,'decision','accepted','reason','Independent verification')); end loop; end $$;
select pg_temp.command('complete');
select pg_temp.expect_error($q$select pg_temp.command('approve',jsonb_build_object('reason','not assigned','next_review_date',current_date+90))$q$);
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
reset role;
update evidence set valid_until=current_date-1 where id=current_setting('qa.evidence')::bigint;
set local role authenticated;
select pg_temp.expect_error($q$select pg_temp.command('approve',jsonb_build_object('reason','expired evidence','next_review_date',current_date+90))$q$);
reset role;
update evidence set valid_until=current_date+10 where id=current_setting('qa.evidence')::bigint;
set local role authenticated;
select pg_temp.command('approve',jsonb_build_object('reason','Approved scope and verified results','next_review_date',current_date+90));
do $$ begin
 if not exists(select 1 from jsonb_array_elements(public.cgp_assessment_summary()) q where (q->>'id')::bigint=current_setting('qa.cycle')::bigint and (q->>'compliance')::numeric=100 and (q->>'not_applicable')::int=1) then raise exception 'Server summary formula wrong'; end if;
 if (select implementation_status from controls where id=-920002)<>'not_started' then raise exception 'Scoped result overwrote global control'; end if;
 if not exists(select 1 from grc_audit_events where entity_type='assessment_cycles' and entity_id=current_setting('qa.cycle') and action='approve') then raise exception 'Approval history missing'; end if;
end $$;
select pg_temp.expect_error($q$select approved_snapshot from assessment_cycles$q$);
select pg_temp.expect_error($q$update assessment_items set notes='tamper' where id=current_setting('qa.item')::bigint$q$);
select pg_temp.expect_error($q$select pg_temp.command('save',jsonb_build_object('item_id',current_setting('qa.item')::bigint,'revision',(select revision from assessment_items where id=current_setting('qa.item')::bigint),'notes','tamper'))$q$);
select pg_temp.command('close',jsonb_build_object('reason','Cycle closed with findings tracked separately'));
select set_config('qa.next',(pg_temp.command('reassess',jsonb_build_object('due_date',current_date+90))->>'id'),true);
do $$ begin if exists(select 1 from assessment_items where cycle_id=current_setting('qa.next')::bigint and compliance_status is not null) then raise exception 'Reassessment carried old approval'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin if exists(select 1 from assessment_items where cycle_id=current_setting('qa.cycle')::bigint) or exists(select 1 from assessment_cycles where id=current_setting('qa.cycle')::bigint) then raise exception 'Unassigned owner scope leaked'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin if (select count(*) from assessment_items where cycle_id=current_setting('qa.cycle')::bigint)<>1 then raise exception 'Owner scope incorrect'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
do $$ begin if exists(select 1 from assessment_cycles where id=current_setting('qa.cycle')::bigint) then raise exception 'Unscoped auditor leaked'; end if; end $$;
reset role;
insert into external_auditor_framework_scopes(auditor_id,framework_id,ends_on,created_by) values('20000000-0000-4000-8000-000000000006',-920001,current_date+1,'20000000-0000-4000-8000-000000000003');
set local role authenticated;
do $$ begin
 if not exists(select 1 from assessment_cycles where id=current_setting('qa.cycle')::bigint) then raise exception 'Approved auditor scope unavailable'; end if;
 if exists(select 1 from assessment_cycles where id=current_setting('qa.next')::bigint) then raise exception 'Auditor sees draft'; end if;
end $$;
select pg_temp.expect_error($q$select pg_temp.command('reassess')$q$);
-- Finding reassignment must grant only that item, without changing its frozen owner/result.
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.command('finding',jsonb_build_object('item_id',current_setting('qa.item')::bigint,'revision',(select revision from assessment_findings where item_id=current_setting('qa.item')::bigint),'status','in_progress','owner_id','20000000-0000-4000-8000-000000000005','action_plan','Follow up','due_date',current_date+5));
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin if (select count(*) from assessment_items where cycle_id=current_setting('qa.cycle')::bigint)<>1 then raise exception 'Reassigned gap owner cannot see assigned requirement'; end if; end $$;
select pg_temp.expect_error($q$select pg_temp.command('finding',jsonb_build_object('item_id',current_setting('qa.item')::bigint,'revision',(select revision from assessment_findings where item_id=current_setting('qa.item')::bigint),'status','closed','reason','Self closure','evidence_id',current_setting('qa.evidence')::bigint))$q$);
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.command('finding',jsonb_build_object('item_id',current_setting('qa.item')::bigint,'revision',(select revision from assessment_findings where item_id=current_setting('qa.item')::bigint),'status','closed','owner_id','20000000-0000-4000-8000-000000000005','reason','Independently verified remediation','evidence_id',current_setting('qa.evidence')::bigint));
do $$ begin
 if (select status from assessment_findings where item_id=current_setting('qa.item')::bigint)<>'closed' then raise exception 'Verified finding did not close'; end if;
 if (select owner_id from assessment_items where id=current_setting('qa.item')::bigint)<>'20000000-0000-4000-8000-000000000004'::uuid then raise exception 'Follow up changed frozen assessment owner'; end if;
end $$;
reset role;
do $$ begin if (select approved_snapshot->>'method' from assessment_cycles where id=current_setting('qa.cycle')::bigint)<>'full-scope-v1' then raise exception 'Frozen snapshot missing'; end if; end $$;
select pg_temp.expect_error($q$update assessment_items set notes='server tamper' where id=current_setting('qa.item')::bigint$q$);
rollback;
select 'PASS: hierarchy, required scope, lifecycle, versions, clear/reset, concurrency, independent reviews, frozen approvals, reassessment, audit and scoped RLS';
