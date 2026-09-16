-- Integration assertions use a real PostgreSQL RLS context. All fixtures roll back.
begin;
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),('10000000-0000-4000-8000-000000000003'),('10000000-0000-4000-8000-000000000004');
insert into public.profiles(user_id,display_name,role,is_active) values
 ('10000000-0000-4000-8000-000000000001','QA Owner','control_owner',true),
 ('10000000-0000-4000-8000-000000000002','QA Reviewer','cybersecurity_team',true),
 ('10000000-0000-4000-8000-000000000003','QA Admin','admin',true),
 ('10000000-0000-4000-8000-000000000004','QA Auditor','nca_external_auditor',true);
insert into public.controls(id,framework_id,control_code,title_ar,domain_ar,implementation_status,evidence_status,verification_status,control_owner_id)
select -910001,id,'GRC-QA-1','QA source','QA','not_implemented','not_uploaded','not_verified','10000000-0000-4000-8000-000000000001' from frameworks limit 1;
insert into public.controls(id,framework_id,control_code,title_ar,domain_ar,implementation_status,evidence_status,verification_status)
select -910002,id,'GRC-QA-2','QA target','QA','not_implemented','not_uploaded','not_verified' from frameworks order by id desc limit 1;
insert into public.control_framework_links(source_control_id,target_control_id,relationship_type,validation_status) values(-910001,-910002,'manual_mapping','approved');
insert into storage.objects(bucket_id,name,owner_id) values
 ('evidence-files','-910001/a.pdf','10000000-0000-4000-8000-000000000001'),
 ('evidence-files','-910001/b.pdf','10000000-0000-4000-8000-000000000001'),
 ('evidence-files','-910001/c.pdf','10000000-0000-4000-8000-000000000001'),
 ('evidence-files','-910001/admin.pdf','10000000-0000-4000-8000-000000000003');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.cgp_grc_command('open_cycle',-910001,jsonb_build_object('reviewer_id','10000000-0000-4000-8000-000000000002','due_date',current_date,'frequency','monthly','requirement','QA evidence request'));
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare rid bigint; response jsonb; begin
 if exists(select 1 from controls where id=-910002) then raise exception 'Owner scope leaked'; end if;
 select id into rid from evidence_requests where control_id=-910001;
 response:=public.cgp_grc_command('submit',-910001,jsonb_build_object('evidence_name','a','file_path','-910001/a.pdf','file_name','a.pdf','file_size',20,'request_id',rid));
 perform set_config('grc.qa.a',response->>'id',true);
 response:=public.cgp_grc_command('submit',-910001,jsonb_build_object('evidence_name','b','file_path','-910001/b.pdf','file_name','b.pdf','file_size',20,'request_id',rid));
 perform set_config('grc.qa.b',response->>'id',true);
 if (select count(*) from evidence where control_id=-910001 and is_current)<>2 then raise exception 'Distinct documents incorrectly superseded'; end if;
 begin
 perform public.cgp_review_evidence(current_setting('grc.qa.a')::bigint,'accepted','QA');
 raise exception 'Owner review succeeded';
 exception when insufficient_privilege then null; end;
 if (select implementation_status from controls where id=-910001)<>'not_implemented' then raise exception 'Upload changed compliance'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.cgp_grc_command('start_review',-910001,jsonb_build_object('evidence_id',current_setting('grc.qa.a')::bigint));
do $$ begin
 if not exists(select 1 from evidence where id=current_setting('grc.qa.a')::bigint and status='under_review' and assigned_reviewer=auth.uid()) then raise exception 'Review was not claimed'; end if;
 if exists(select 1 from evidence_reviews where evidence_id=current_setting('grc.qa.a')::bigint) then raise exception 'Starting review created decision'; end if;
end $$;
select public.cgp_review_evidence(current_setting('grc.qa.a')::bigint,'accepted','Meets evidence requirement');
select public.cgp_review_evidence(current_setting('grc.qa.b')::bigint,'changes_requested','Add approval page');
do $$ begin
 if (select implementation_status from controls where id=-910001)<>'not_implemented' then raise exception 'Evidence acceptance changed compliance'; end if;
 if not exists(select 1 from evidence_requests where control_id=-910001 and status='changes_requested') then raise exception 'Request not updated'; end if;
 begin
 update evidence set review_notes='tampered' where id=current_setting('grc.qa.a')::bigint;
 raise exception 'Completed decision modified';
 exception when raise_exception then if SQLERRM='Completed decision modified' then raise; end if; end;
 begin
 perform public.cgp_review_evidence(current_setting('grc.qa.a')::bigint,'rejected','stale');
 raise exception 'Stale decision allowed';
 exception when raise_exception then if SQLERRM='Stale decision allowed' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('grc.qa.c',(public.cgp_grc_command('submit',-910001,jsonb_build_object('evidence_name','b','file_path','-910001/c.pdf','file_name','c.pdf','file_size',20,'replaces_id',current_setting('grc.qa.b')::bigint))->>'id'),true);
do $$ begin
 if (select count(*) from evidence where control_id=-910001 and is_current)<>2 then raise exception 'Versioning broke independent documents'; end if;
 if not exists(select 1 from evidence where id=current_setting('grc.qa.c')::bigint and version_number=2) then raise exception 'Version not incremented'; end if;
 if not exists(select 1 from evidence_reviews where evidence_id=current_setting('grc.qa.b')::bigint and decision='changes_requested') then raise exception 'History lost'; end if;
 begin
 delete from grc_audit_events where control_id=-910001;
 raise exception 'Audit deletion allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.cgp_review_evidence(current_setting('grc.qa.c')::bigint,'accepted','Updated approval verified');
do $$ declare cid bigint; begin
 select id into cid from control_review_cycles where control_id=-910001 and status='open';
 perform public.cgp_grc_command('assess',-910001,jsonb_build_object('cycle_id',cid,'result','implemented','reason','Requirements verified against both documents','evidence_ids',jsonb_build_array(current_setting('grc.qa.a')::bigint,current_setting('grc.qa.c')::bigint)));
 if (select implementation_status from controls where id=-910001)<>'implemented' then raise exception 'Assessment did not reflect'; end if;
 if (select count(*) from control_review_cycles where control_id=-910001)<>2 then raise exception 'Next cycle missing'; end if;
 if not exists(select 1 from control_review_cycles where id=cid and status='completed') then raise exception 'Previous cycle not retained'; end if;
 if not exists(select 1 from grc_audit_events where control_id=-910001 and entity_type='control_assessments') then raise exception 'Assessment audit missing'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select set_config('grc.qa.admin',(public.cgp_grc_command('submit',-910001,jsonb_build_object('evidence_name','admin','file_path','-910001/admin.pdf','file_name','admin.pdf','file_size',20,'replaces_id',current_setting('grc.qa.a')::bigint,'targets',jsonb_build_array(-910002)))->>'id'),true);
do $$ begin
 if not exists(select 1 from evidence where id=current_setting('grc.qa.admin')::bigint and version_number=2 and request_id is null) then raise exception 'New version incorrectly bound to closed request'; end if;
 begin
 perform public.cgp_review_evidence(current_setting('grc.qa.admin')::bigint,'accepted','self');
 raise exception 'Admin self review succeeded'; exception when insufficient_privilege then null; end;
 if not exists(select 1 from evidence_control_links where evidence_id=current_setting('grc.qa.admin')::bigint and control_id=-910002) then raise exception 'Shared mapping not created'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.cgp_review_shared_evidence_link((select id from evidence_control_links where evidence_id=current_setting('grc.qa.admin')::bigint),'accepted','Target requirement verified');
do $$ begin
 if (select implementation_status from controls where id=-910002)<>'not_implemented' then raise exception 'Shared approval changed compliance'; end if;
 if not exists(select 1 from evidence_control_link_reviews r join evidence_control_links l on l.id=r.link_id where l.evidence_id=current_setting('grc.qa.admin')::bigint) then raise exception 'Shared decision history absent'; end if;
end $$;
reset role;
insert into external_auditor_framework_scopes(auditor_id,framework_id,ends_on,created_by)
select '10000000-0000-4000-8000-000000000004',framework_id,current_date+1,'10000000-0000-4000-8000-000000000003' from controls where id=-910002;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
 if not exists(select 1 from public.grc_evidence_register() where control_id=-910002) then raise exception 'Scoped shared evidence invisible'; end if;
 if not exists(select 1 from storage.objects where name='-910001/admin.pdf') then raise exception 'Shared file invisible'; end if;
 begin
 perform public.cgp_grc_command('open_cycle',-910002,'{}');raise exception 'Auditor write allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if private.grc_next_date('2027-01-31','monthly')<>'2027-02-28'::date then raise exception 'Month-end scheduling wrong'; end if;
 if private.grc_next_date('2028-01-31','monthly')<>'2028-02-29'::date then raise exception 'Leap year scheduling wrong'; end if;
end $$;
rollback;
select 'PASS: independent documents, versions, immutable decisions, separation of duties, shared evidence/RLS, requests, assessments, next cycle, calendar boundaries, scoped auditor, audit history. All fixtures rolled back.';
