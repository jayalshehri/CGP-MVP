begin;
insert into auth.users(id) values
  ('90340000-0000-4000-8000-000000000001'),('90340000-0000-4000-8000-000000000002'),('90340000-0000-4000-8000-000000000003');
insert into public.profiles(user_id,display_name,role,is_active) values
  ('90340000-0000-4000-8000-000000000001','Synthetic assessor','admin',true),
  ('90340000-0000-4000-8000-000000000002','Synthetic reviewer','admin',true),
  ('90340000-0000-4000-8000-000000000003','Synthetic owner','control_owner',true);

create function pg_temp.expect_tprm_error(command text, signal text) returns void language plpgsql as $$
declare message text;
begin
  begin execute command; exception when others then get stacked diagnostics message=message_text; end;
  if message is null or position(signal in message)=0 then raise exception 'Expected %, got % for %',signal,message,command; end if;
end $$;
create function pg_temp.tprm_id() returns bigint language sql as $$select current_setting('test.tprm.assessment')::bigint$$;
create function pg_temp.tprm_party() returns bigint language sql as $$select current_setting('test.tprm.party')::bigint$$;
create function pg_temp.tprm_day(offset_days integer) returns date language sql as $$select (statement_timestamp() at time zone 'Asia/Riyadh')::date+offset_days$$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"90340000-0000-4000-8000-000000000001","role":"authenticated"}',true);
with p as (insert into public.third_parties(name,service,relationship_owner,service_stage)
values('Synthetic supplier','Managed test service','Service owner','pre_contract') returning id)
select set_config('test.tprm.party',id::text,true) from p;
do $$ begin
  if not exists(select 1 from public.third_parties where id=pg_temp.tprm_party()
    and service_code like 'TPS-%' and likelihood is null and residual_risk_score is null) then raise exception 'New service received legacy default scores'; end if;
end $$;
select pg_temp.expect_tprm_error($q$update public.third_parties set decision='approved' where id=pg_temp.tprm_party()$q$,'tprm_legacy_read_only');
select pg_temp.expect_tprm_error($q$update public.third_parties set contract_signed_on=pg_temp.tprm_day(0) where id=pg_temp.tprm_party()$q$,'tpra_contract_date_and_ref');
select pg_temp.expect_tprm_error($q$update public.third_parties set contract_signed_on=pg_temp.tprm_day(2),contract_number='A',contract_document_ref='DOC' where id=pg_temp.tprm_party()$q$,'tpra_contract_date_and_ref');

with a as (insert into public.third_party_service_assessments(service_id,rule_version) values(pg_temp.tprm_party(),'cgp_tprm_v1') returning id)
select set_config('test.tprm.assessment',id::text,true) from a;
select pg_temp.expect_tprm_error($q$insert into public.third_party_service_assessments(service_id) values(pg_temp.tprm_party())$q$,'third_party_one_open_assessment');
select pg_temp.expect_tprm_error($q$update public.third_party_service_assessments set state='submitted' where id=pg_temp.tprm_id()$q$,'tprm_scope');
select pg_temp.expect_tprm_error($q$update public.third_party_service_assessments set state='decided' where id=pg_temp.tprm_id()$q$,'tprm_transition');

update public.third_party_service_assessments
set scope='{"kind":"managed","access":"privileged","data":false,"service_impact":true,"sensitive":true,"cloud":true,"subcontractors":false,"remote_soc":true,"system_reference":"QA-01","hosting_location":"QA-DC"}',
    review_trigger='initial',scenario='Isolated test scenario',inherent_likelihood=3,inherent_impact=4,inherent_reason='Test rationale',
    expected_likelihood=1,expected_impact=2,expected_reason='Test plan',
    verified_likelihood=1,verified_impact=1,verified_reference='QA-VERIFIED',verified_reason='Test verification',
    state='draft'
where id=pg_temp.tprm_id();
select pg_temp.expect_tprm_error($q$update public.third_party_service_assessments set state='submitted' where id=pg_temp.tprm_id()$q$,'tpra_contract_identity');
select pg_temp.expect_tprm_error($q$update public.third_party_service_assessments set review_trigger='regulatory_change',state='submitted' where id=pg_temp.tprm_id()$q$,'tpra_cycle');
update public.third_parties set contract_reference='PR-SYNTH' where id=pg_temp.tprm_party();
update public.third_party_service_assessments set state='submitted' where id=pg_temp.tprm_id();
select pg_temp.expect_tprm_error($q$update public.third_party_service_assessments set state='decided',decision='approved' where id=pg_temp.tprm_id()$q$,'tprm_independent');
select pg_temp.expect_tprm_error($q$update public.third_parties set name='Changed while submitted' where id=pg_temp.tprm_party()$q$,'tprm_submission_locked');

select set_config('request.jwt.claims','{"sub":"90340000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.expect_tprm_error($q$update public.third_party_service_assessments set state='decided',decision='approved',
  decision_authority='Authority',decision_reference='QA-1',decision_reason='Test decision',review_due=pg_temp.tprm_day(30)
  where id=pg_temp.tprm_id()$q$,'tprm_blocker');
select pg_temp.expect_tprm_error($q$update public.third_party_service_assessments set state='draft', return_note='Needs evidence',scenario='Edited'
  where id=pg_temp.tprm_id()$q$,'tprm_submission_locked');
update public.third_party_service_assessments set state='draft',return_note='Needs evidence' where id=pg_temp.tprm_id();

select set_config('request.jwt.claims','{"sub":"90340000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update public.third_party_service_assessments set checks=(select jsonb_object_agg(k,jsonb_build_object('status','met','reference','FREE-TEXT'))
  from unnest(private.tpra_required_keys(scope)) k) where id=pg_temp.tprm_id();

select pg_temp.expect_tprm_error($q$insert into public.third_party_assessment_evidence(assessment_id,check_key,document_title,document_ref,state)
  values(pg_temp.tprm_id(),'contract_requirements','Synthetic file','D-1','accepted')$q$,'tpra_evidence_stage');
select pg_temp.expect_tprm_error($q$insert into public.third_party_assessment_evidence(assessment_id,check_key,document_title,document_ref)
  values(pg_temp.tprm_id(),'residual','Synthetic file','Incorrect reference')$q$,'tpra_evidence_scope');

insert into public.third_party_assessment_evidence(assessment_id,check_key,document_title,document_ref)
select pg_temp.tprm_id(),k,'Synthetic evidence',case when k='residual' then 'QA-VERIFIED' else 'QA-'||k end
  from public.third_party_service_assessments, lateral unnest(private.tpra_required_keys(scope)||array['residual']) k
where id=pg_temp.tprm_id();
select pg_temp.expect_tprm_error($q$update public.third_party_assessment_evidence set state='accepted',review_note='Self verification'
  where assessment_id=pg_temp.tprm_id()$q$,'tpra_independent_evidence');

update public.third_party_service_assessments set state='submitted' where id=pg_temp.tprm_id();
select set_config('request.jwt.claims','{"sub":"90340000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.expect_tprm_error($q$update public.third_party_service_assessments set state='decided',decision='approved',
  decision_authority='Authority',decision_reference='QA-1',decision_reason='Test decision',review_due=pg_temp.tprm_day(30)
  where id=pg_temp.tprm_id()$q$,'tprm_blocker');
update public.third_party_assessment_evidence set state='accepted',review_note='Viewed verification source'
where assessment_id=pg_temp.tprm_id();
select pg_temp.expect_tprm_error($q$update public.third_party_service_assessments set state='decided',decision='conditional',
  decision_authority='Authority',decision_reference='QA-1',decision_reason='Test decision',review_due=pg_temp.tprm_day(30)
  where id=pg_temp.tprm_id()$q$,'tpra_condition_action');
update public.third_party_service_assessments set state='draft',return_note='Needs evidence' where id=pg_temp.tprm_id();

select set_config('request.jwt.claims','{"sub":"90340000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update public.third_party_service_assessments set scenario='Changed synthetic scenario' where id=pg_temp.tprm_id();
select pg_temp.expect_tprm_error($q$update public.third_party_assessment_evidence set document_ref='Changed document' where assessment_id=pg_temp.tprm_id()$q$,'tpra_evidence_locked');
insert into public.third_party_assessment_evidence(assessment_id,check_key,document_title,document_ref)
values (pg_temp.tprm_id(),'risk_controls','Revised controls','QA-CONTROLS-2'),(pg_temp.tprm_id(),'residual','Revised verification','QA-VERIFIED');

insert into public.third_party_assessment_actions(assessment_id,description,owner,due_on)
values(pg_temp.tprm_id(),'Supply updated report','Risk owner',pg_temp.tprm_day(10));
update public.third_party_service_assessments set state='submitted' where id=pg_temp.tprm_id();

select set_config('request.jwt.claims','{"sub":"90340000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.expect_tprm_error($q$update public.third_party_service_assessments set state='decided',decision='approved',
  decision_authority='Authority',decision_reference='QA-1',decision_reason='Test decision',review_due=pg_temp.tprm_day(30)
  where id=pg_temp.tprm_id()$q$,'tprm_blocker');
update public.third_party_assessment_evidence set state='accepted',review_note='Adjusted assessment evidence verified'
where assessment_id=pg_temp.tprm_id() and state='pending';
select pg_temp.expect_tprm_error($q$update public.third_party_service_assessments set state='decided',decision='approved',
  decision_authority='Authority',decision_reference='QA-1',decision_reason='Test decision',review_due=pg_temp.tprm_day(30)
  where id=pg_temp.tprm_id()$q$,'tpra_actions_open');
select pg_temp.expect_tprm_error($q$update public.third_party_service_assessments set state='decided',decision='conditional',
  decision_authority='Authority',decision_reference='QA-1',decision_reason='Test decision',review_due=pg_temp.tprm_day(2)
  where id=pg_temp.tprm_id()$q$,'tpra_condition_action');
update public.third_party_service_assessments set state='decided',decision='conditional',
  decision_authority='Authority',decision_reference='QA-1',decision_reason='Test decision',review_due=pg_temp.tprm_day(30)
where id=pg_temp.tprm_id();
do $$ begin
  if not exists(select 1 from public.third_party_service_assessments where id=pg_temp.tprm_id()
    and inherent_score=12 and expected_score=2 and verified_score=1 and decided_by=auth.uid()
    and service_snapshot->>'name'='Synthetic supplier' and service_snapshot->>'contract_reference'='PR-SYNTH'
    and rule_version='cgp_tprm_v2' and condition_owner='Risk owner' and return_note='Needs evidence')
  then raise exception 'Decision snapshot and independent scores were not saved'; end if;
end $$;
select pg_temp.expect_tprm_error($q$update public.third_party_service_assessments set decision='approved' where id=pg_temp.tprm_id()$q$,'tprm_immutable');
select pg_temp.expect_tprm_error($q$update public.third_party_assessment_actions set state='closed' where assessment_id=pg_temp.tprm_id()$q$,'tpra_action_stage');
update public.third_party_assessment_actions set state='to_verify',closure_ref='QA-EXECUTION' where assessment_id=pg_temp.tprm_id();
select pg_temp.expect_tprm_error($q$update public.third_party_assessment_actions set state='closed',review_note='Test verification'
  where assessment_id=pg_temp.tprm_id()$q$,'tpra_independent_action');
select set_config('request.jwt.claims','{"sub":"90340000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update public.third_party_assessment_actions set state='closed',review_note='Verified execution'
where assessment_id=pg_temp.tprm_id();
do $$ begin
  if not exists(select 1 from public.third_party_assessment_actions where assessment_id=pg_temp.tprm_id()
    and state='closed' and verified_by=auth.uid() and completed_by<>auth.uid())
  then raise exception 'Independent verification and closure not recorded'; end if;
end $$;
select pg_temp.expect_tprm_error($q$delete from public.third_party_assessment_evidence where assessment_id=pg_temp.tprm_id()$q$,'permission denied');
insert into public.third_party_service_assessments(service_id) values(pg_temp.tprm_party());

select set_config('request.jwt.claims','{"sub":"90340000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
  if exists(select 1 from public.third_party_service_assessments where service_id=pg_temp.tprm_party())
  or exists(select 1 from public.third_party_assessment_evidence where assessment_id=pg_temp.tprm_id())
    or exists(select 1 from public.third_party_assessment_actions where assessment_id=pg_temp.tprm_id())
  then raise exception 'Out-of-scope role can read TPRA'; end if;
end $$;
rollback;
