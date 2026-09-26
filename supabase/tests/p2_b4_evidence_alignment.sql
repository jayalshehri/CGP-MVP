-- Run only against a disposable synthetic P2-B4 database prepared with the
-- local P2-B4 fixture (four synthetic profiles, one cycle/item/control).
-- The database-name guard prevents accidental execution against QA/Production.
\set ON_ERROR_STOP on
begin;
do $guard$
begin
  if current_database() not like 'cgp_b41_%' then
    raise exception 'P2-B4.1 evidence tests require a disposable cgp_b41_ database';
  end if;
  if to_regclass('public.grc_findings') is null
     or (select count(*) from public.assessment_items where id = 1) <> 1 then
    raise exception 'Synthetic P2-B4 test fixture is missing';
  end if;
end $guard$;

-- Synthetic fixture only. Disable workflow triggers during fixture insertion;
-- all command, scope and eligibility assertions run with triggers restored.
set local session_replication_role = replica;
insert into public.frameworks(id,code,name_ar,name_en,version,is_active)
values (2,'LOCAL_RETIRED','إطار مؤرشف','Retired fixture','old',false);
insert into public.controls(id, framework_id, control_code, title_ar,
  description_ar, domain_ar, implementation_status, evidence_status,
  verification_status, control_owner_id)
values
  (2, 1, 'LOCAL-2', 'مصدر مشترك', 'مصدر اختبار', 'مجال محلي',
    'not_implemented', 'not_uploaded', 'not_verified', '00000000-0000-0000-0000-000000000001'),
  (3, 1, 'LOCAL-3', 'مصدر غير معتمد', 'مصدر اختبار', 'مجال محلي',
    'not_implemented', 'not_uploaded', 'not_verified', '00000000-0000-0000-0000-000000000001'),
  (4, 2, 'LOCAL-RETIRED', 'مصدر مؤرشف', 'مصدر اختبار', 'مجال محلي',
    'not_implemented', 'not_uploaded', 'not_verified', '00000000-0000-0000-0000-000000000001');
insert into public.assessment_items(id, cycle_id, control_id, control_code,
  title_ar, domain_ar, subdomain_code, is_scoring, owner_id)
overriding system value
values (2, 1, 2, 'LOCAL-2', 'مصدر مشترك', 'مجال محلي', 'LOCAL', true,
  '00000000-0000-0000-0000-000000000003');
insert into public.control_framework_links(source_control_id,target_control_id,
  relationship_type,validation_status)
values (2,1,'manual_mapping','approved'), (3,1,'manual_mapping','pending'),
  (4,1,'manual_mapping','approved');
insert into public.evidence(id,control_id,evidence_name,file_name,status,
  is_current,valid_until,uploaded_by)
values
  (100,1,'Direct valid','direct.pdf','accepted',true,current_date+30,'00000000-0000-0000-0000-000000000001'),
  (101,2,'Shared approved','shared.pdf','accepted',true,current_date+30,'00000000-0000-0000-0000-000000000001'),
  (102,3,'Mapping pending','pending.pdf','accepted',true,current_date+30,'00000000-0000-0000-0000-000000000001'),
  (103,3,'Unrelated','unrelated.pdf','accepted',true,current_date+30,'00000000-0000-0000-0000-000000000001'),
  (104,1,'Expired','expired.pdf','accepted',true,current_date-1,'00000000-0000-0000-0000-000000000001'),
  (105,1,'Obsolete','obsolete.pdf','accepted',false,current_date+30,'00000000-0000-0000-0000-000000000001'),
  (106,1,'Rejected','rejected.pdf','rejected',true,current_date+30,'00000000-0000-0000-0000-000000000001'),
  (107,1,'Unknown uploader','unknown.pdf','accepted',true,current_date+30,null),
  (108,1,'Reviewer uploaded','self.pdf','accepted',true,current_date+30,'00000000-0000-0000-0000-000000000002'),
  (109,2,'Link rejected','link-rejected.pdf','accepted',true,current_date+30,'00000000-0000-0000-0000-000000000001'),
  (110,4,'Archived source','retired.pdf','accepted',true,current_date+30,'00000000-0000-0000-0000-000000000001');
insert into public.evidence_control_links(evidence_id,control_id,status,created_by)
values
  (101,1,'accepted','00000000-0000-0000-0000-000000000001'),
  (102,1,'accepted','00000000-0000-0000-0000-000000000001'),
  (109,1,'rejected','00000000-0000-0000-0000-000000000001'),
  (110,1,'accepted','00000000-0000-0000-0000-000000000001');
insert into public.assessment_item_evidence(item_id,control_id,evidence_id,linked_by)
values (1,1,101,'00000000-0000-0000-0000-000000000001');
set local session_replication_role = origin;

do $eligibility$
declare reviewer uuid := '00000000-0000-0000-0000-000000000002';
begin
  if not private.grc_finding_evidence_valid(100,1,reviewer)
     or not private.grc_finding_evidence_valid(101,1,reviewer) then
    raise exception 'Direct or approved shared evidence was rejected';
  end if;
  if private.grc_finding_evidence_valid(102,1,reviewer)
     or private.grc_finding_evidence_valid(103,1,reviewer)
     or private.grc_finding_evidence_valid(104,1,reviewer)
     or private.grc_finding_evidence_valid(105,1,reviewer)
     or private.grc_finding_evidence_valid(106,1,reviewer)
     or private.grc_finding_evidence_valid(107,1,reviewer)
     or private.grc_finding_evidence_valid(108,1,reviewer)
     or private.grc_finding_evidence_valid(109,1,reviewer)
     or private.grc_finding_evidence_valid(110,1,reviewer) then
    raise exception 'Unapproved, unrelated, expired, obsolete, rejected, self or archived evidence passed';
  end if;
  if not private.assessment_evidence_valid(1,reviewer) then
    raise exception 'Existing assessment-engine shared evidence semantics regressed';
  end if;
  if has_function_privilege('anon','public.cgp_finding_evidence_options(bigint)','EXECUTE')
     or not has_function_privilege('authenticated','public.cgp_finding_evidence_options(bigint)','EXECUTE') then
    raise exception 'Evidence selector RPC privilege model is wrong';
  end if;
end $eligibility$;

set local role authenticated;
do $workflow$
declare
  owner uuid := '00000000-0000-0000-0000-000000000003';
  reviewer uuid := '00000000-0000-0000-0000-000000000002';
  v_finding_id bigint; other_finding_id bigint; v_action_id bigint;
  finding_revision integer; action_revision integer; result jsonb;
begin
  perform set_config('request.jwt.claim.sub',owner::text,true);
  result := public.cgp_finding_command('create_finding',null,
    jsonb_build_object('source_type','assessment','source_record_id',1,
      'owner_id',owner,'title','Synthetic evidence finding',
      'description','Evidence alignment test'));
  v_finding_id := (result->>'id')::bigint;
  finding_revision := (result->>'revision')::integer;
  if (select count(*) from public.cgp_finding_evidence_options(v_finding_id)
      where id in (100,101) and association in ('direct','shared')) <> 2
     or exists (select 1 from public.cgp_finding_evidence_options(v_finding_id)
      where id in (102,103,104,105,106,107,109,110)) then
    raise exception 'Selector and backend eligibility disagree';
  end if;

  -- An item assignee who does not own the source control cannot obtain
  -- repository evidence metadata through this new RPC.
  result := public.cgp_finding_command('create_finding',null,
    jsonb_build_object('source_type','assessment','source_record_id',2,
      'owner_id',owner,'title','Other control finding',
      'description','Control-owner scope test'));
  other_finding_id := (result->>'id')::bigint;
  if exists (select 1 from public.cgp_finding_evidence_options(other_finding_id)) then
    raise exception 'Control owner accessed evidence outside owned control scope';
  end if;

  perform set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000004',true);
  if exists (select 1 from public.cgp_finding_evidence_options(v_finding_id)) then
    raise exception 'External auditor received evidence options';
  end if;
  begin
    perform public.cgp_finding_command('add_action',v_finding_id,
      jsonb_build_object('finding_revision',finding_revision,
        'title','Auditor write attempt','description','Must reject'));
    raise exception 'External auditor could mutate finding';
  exception when sqlstate '42501' then null; end;
  perform set_config('request.jwt.claim.sub',owner::text,true);

  for v_action_id in 1..2 loop
    result := public.cgp_finding_command('add_action',v_finding_id,
      jsonb_build_object('finding_revision',finding_revision,'title',
        'Synthetic action '||v_action_id,'description','No file duplication',
        'owner_id',owner));
    finding_revision := (result->>'revision')::integer;
    select revision into action_revision from public.grc_corrective_actions
      where id = (result->>'action_id')::bigint;
    begin
      perform public.cgp_finding_command('complete_action',v_finding_id,
        jsonb_build_object('finding_revision',finding_revision,
          'action_revision',action_revision,'action_id',(result->>'action_id')::bigint,
          'completion_note','Invalid mapping should fail','evidence_id',102));
      raise exception 'Unapproved mapping accepted by action completion';
    exception when sqlstate '42501' then null; end;
    result := public.cgp_finding_command('complete_action',v_finding_id,
      jsonb_build_object('finding_revision',finding_revision,
        'action_revision',action_revision,'action_id',(result->>'action_id')::bigint,
        'completion_note','Uses one existing version','evidence_id',101));
    finding_revision := (result->>'revision')::integer;
  end loop;
  result := public.cgp_finding_command('submit_verification',v_finding_id,
    jsonb_build_object('finding_revision',finding_revision,'reason','Ready for review'));
  finding_revision := (result->>'revision')::integer;
  begin
    perform public.cgp_finding_command('verify_finding',v_finding_id,
      jsonb_build_object('finding_revision',finding_revision,'reason','Self review'));
    raise exception 'Owner self-verification was not rejected';
  exception when sqlstate '42501' then null; end;

  perform set_config('request.jwt.claim.sub',reviewer::text,true);
  for v_action_id in select id from public.grc_corrective_actions
      where finding_id = v_finding_id order by id loop
    select revision into action_revision from public.grc_corrective_actions
      where id = v_action_id;
    result := public.cgp_finding_command('verify_action',v_finding_id,
      jsonb_build_object('finding_revision',finding_revision,
        'action_revision',action_revision,'action_id',v_action_id,
        'reason','Independent shared-evidence review'));
    finding_revision := (result->>'revision')::integer;
  end loop;
  result := public.cgp_finding_command('verify_finding',v_finding_id,
    jsonb_build_object('finding_revision',finding_revision,
      'reason','Independent final verification','evidence_id',101));
  finding_revision := (result->>'revision')::integer;
  perform public.cgp_finding_command('close_finding',v_finding_id,
    jsonb_build_object('finding_revision',finding_revision,
      'reason','Explicitly closed after verification'));
  raise notice 'P2-B4.1 evidence alignment: direct/shared, rejection, scope, SoD and provenance PASS';
end $workflow$;
reset role;
do $assertions$
begin
  if (select count(*) from public.grc_corrective_actions
      where verification_evidence_id = 101) <> 2
     or (select count(*) from public.evidence where id = 101) <> 1 then
    raise exception 'Multiple actions duplicated or lost the evidence version';
  end if;
  if (select count(*) from public.grc_findings where status = 'closed') <> 1 then
    raise exception 'Finding was not explicitly closed';
  end if;
end $assertions$;
rollback;
