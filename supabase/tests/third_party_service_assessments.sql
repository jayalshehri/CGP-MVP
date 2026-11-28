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

with a as (insert into public.third_party_service_assessments(service_id) values(pg_temp.tprm_party()) returning id)
select set_config('test.tprm.assessment',id::text,true) from a;
select pg_temp.expect_tprm_error($q$insert into public.third_party_service_assessments(service_id) values(pg_temp.tprm_party())$q$,'third_party_one_open_assessment');
select pg_temp.expect_tprm_error($q$update public.third_party_service_assessments set state='submitted' where id=pg_temp.tprm_id()$q$,'tprm_scope');
select pg_temp.expect_tprm_error($q$update public.third_party_service_assessments set state='decided' where id=pg_temp.tprm_id()$q$,'tprm_transition');

update public.third_party_service_assessments
set scope='{"kind":"managed","access":"privileged","data":false,"service_impact":true,"sensitive":true,"cloud":true,"subcontractors":false,"remote_soc":true,"system_reference":"QA-01","hosting_location":"QA-DC"}',
    scenario='Isolated test scenario',inherent_likelihood=3,inherent_impact=4,inherent_reason='Test rationale',
    expected_likelihood=1,expected_impact=2,expected_reason='Test plan',
    verified_likelihood=1,verified_impact=1,verified_reference='QA-VERIFIED',verified_reason='Test verification',
    state='submitted'
where id=pg_temp.tprm_id();
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
update public.third_party_service_assessments
set checks=(select jsonb_object_agg(k,jsonb_build_object('status','met','reference','QA-EVIDENCE'))
  from unnest(array['confidentiality','secure_deletion','incident_response','policy','risk_controls','local_soc','vetting','national_provider','cloud_review','sensitive_hosting']) k),
    state='submitted'
where id=pg_temp.tprm_id();

select set_config('request.jwt.claims','{"sub":"90340000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.expect_tprm_error($q$update public.third_party_service_assessments set state='decided',decision='conditional',
  decision_authority='Authority',decision_reference='QA-1',decision_reason='Test decision',review_due=pg_temp.tprm_day(30)
  where id=pg_temp.tprm_id()$q$,'tprm_condition');
update public.third_party_service_assessments set state='decided',decision='conditional',
  decision_authority='Authority',decision_reference='QA-1',decision_reason='Test decision',review_due=pg_temp.tprm_day(30),
  condition_plan='Supply updated report',condition_owner='Risk owner',condition_due=pg_temp.tprm_day(10)
where id=pg_temp.tprm_id();
do $$ begin
  if not exists(select 1 from public.third_party_service_assessments where id=pg_temp.tprm_id()
    and inherent_score=12 and expected_score=2 and verified_score=1 and decided_by=auth.uid()
    and service_snapshot->>'name'='Synthetic supplier' and return_note='Needs evidence')
  then raise exception 'Decision snapshot and independent scores were not saved'; end if;
end $$;
select pg_temp.expect_tprm_error($q$update public.third_party_service_assessments set decision='approved' where id=pg_temp.tprm_id()$q$,'tprm_immutable');
insert into public.third_party_service_assessments(service_id) values(pg_temp.tprm_party());

select set_config('request.jwt.claims','{"sub":"90340000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
  if exists(select 1 from public.third_party_service_assessments where service_id=pg_temp.tprm_party())
  then raise exception 'Out-of-scope role can read assessment'; end if;
end $$;
rollback;
