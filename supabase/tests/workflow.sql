begin;
select set_config('cgp.qa.owner',(select user_id::text from profiles where role='control_owner' and is_active limit 1),true);
select set_config('cgp.qa.admin',(select user_id::text from profiles where role='admin' and is_active limit 1),true);
insert into public.controls(id,framework_id,control_code,title_ar,description_ar,domain_ar,implementation_status,evidence_status,verification_status,due_date,control_owner_id)
select -900001,id,'CGP-QA-ROLLBACK','اختبار مؤقت','rolled back','QA','not_started','not_uploaded','not_verified',(now() at time zone 'Asia/Riyadh')::date,current_setting('cgp.qa.owner')::uuid from frameworks limit 1;
insert into public.controls(id,framework_id,control_code,title_ar,description_ar,domain_ar,implementation_status,evidence_status,verification_status,due_date)
select -900002,id,'CGP-QA-UNASSIGNED','اختبار مؤقت','rolled back','QA','not_started','not_uploaded','not_verified',current_date-1 from frameworks limit 1;
insert into storage.objects(bucket_id,name,owner_id) values('evidence-files','-900001/qa-rollback.pdf',current_setting('cgp.qa.owner'));
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cgp.qa.owner'),'role','authenticated')::text,true);
do $$ declare d jsonb; begin
 if not exists(select 1 from public.controls where id=-900001) then raise exception 'Owner cannot read own control'; end if;
 if exists(select 1 from public.controls where id=-900002) then raise exception 'Owner can read unassigned control'; end if;
 if exists(select 1 from public.controls where control_owner_id is distinct from auth.uid()) then raise exception 'Owner scope leaked'; end if;
 d:=public.cgp_dashboard();
 if (d->>'total')::int<>(select count(*) from public.controls) then raise exception 'Dashboard total differs'; end if;
 if exists(select 1 from public.controls where id=-900001 and due_date < (now() at time zone 'Asia/Riyadh')::date) then raise exception 'Due today counted overdue'; end if;
 begin
   perform public.cgp_review_evidence(2,'accepted',null);
   raise exception 'Owner review allowed';
 exception when insufficient_privilege then null; end;
end $$;
insert into public.evidence(control_id,evidence_name,file_path,file_name,file_size,status,is_current)
values(-900001,'QA','-900001/qa-rollback.pdf','qa.pdf',50,'pending_review',true);
do $$ begin
 if not exists(select 1 from public.controls where id=-900001 and evidence_status='pending_review' and verification_status='under_review') then raise exception 'Upload did not update control atomically'; end if;
 begin
 update public.evidence set status='accepted' where control_id=-900001;
 if found then raise exception 'Owner self-approval succeeded'; end if;
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('cgp.qa.evidence',(select id::text from evidence where control_id=-900001),true);
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cgp.qa.admin'),'role','authenticated')::text,true);
do $$ begin
 if not exists(select 1 from public.controls where id=-900002) then raise exception 'Admin missing global scope'; end if;
 begin
 perform public.cgp_review_evidence(current_setting('cgp.qa.evidence')::bigint,'rejected','');
 raise exception 'Blank rejection accepted';
 exception when raise_exception then if SQLERRM='Blank rejection accepted' then raise; end if; end;
end $$;
select public.cgp_review_evidence(current_setting('cgp.qa.evidence')::bigint,'rejected','QA rejection reason');
do $$ begin
 if not exists(select 1 from public.controls where id=-900001 and evidence_status='rejected' and verification_status='not_verified') then raise exception 'Reject status did not sync'; end if;
 if not exists(select 1 from public.evidence_reviews where evidence_id=current_setting('cgp.qa.evidence')::bigint and decision='rejected') then raise exception 'Missing rejection audit'; end if;
 begin
 perform public.cgp_review_evidence(current_setting('cgp.qa.evidence')::bigint,'accepted',null);
 raise exception 'Stale review succeeded';
 exception when raise_exception then if SQLERRM='Stale review succeeded' then raise; end if; end;
end $$;
reset role;
insert into storage.objects(bucket_id,name,owner_id) values('evidence-files','-900001/qa-resubmit.pdf',current_setting('cgp.qa.owner'));
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cgp.qa.owner'),'role','authenticated')::text,true);
insert into public.evidence(control_id,evidence_name,file_path,file_name,file_size,status,is_current)
values(-900001,'QA resubmit','-900001/qa-resubmit.pdf','qa.pdf',50,'pending_review',true);
do $$ begin
 if (select count(*) from public.evidence where control_id=-900001 and is_current)<>1 then raise exception 'Multiple current submissions'; end if;
end $$;
reset role;
select set_config('cgp.qa.evidence',(select id::text from evidence where control_id=-900001 and is_current),true);
update profiles set role='cybersecurity_team' where user_id=current_setting('cgp.qa.admin')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cgp.qa.admin'),'role','authenticated')::text,true);
select public.cgp_review_evidence(current_setting('cgp.qa.evidence')::bigint,'accepted','QA acceptance');
do $$ begin
 if not exists(select 1 from public.controls where id=-900001 and evidence_status='accepted' and implementation_status='implemented' and verification_status='verified') then raise exception 'Accept did not complete control'; end if;
 if not exists(select 1 from public.controls where id=-900002) then raise exception 'Team missing global scope'; end if;
 if not exists(select 1 from public.profiles where role='control_owner') then raise exception 'Team cannot assign owner'; end if;
 if (public.cgp_dashboard()->>'verified')::int < 1 then raise exception 'Live dashboard not updated'; end if;
end $$;
reset role;
update profiles set is_active=false where user_id=current_setting('cgp.qa.owner')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cgp.qa.owner'),'role','authenticated')::text,true);
do $$ begin
 if exists(select 1 from public.controls) or exists(select 1 from public.evidence) or exists(select 1 from storage.objects where bucket_id='evidence-files') then raise exception 'Inactive profile can read data'; end if;
 if (public.cgp_dashboard()->>'total')::int<>0 then raise exception 'Inactive dashboard leak'; end if;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$ begin
 begin perform 1 from public.controls; raise exception 'Anonymous control read allowed'; exception when insufficient_privilege then null; end;
 begin perform public.cgp_dashboard(); raise exception 'Anonymous dashboard allowed'; exception when insufficient_privilege then null; end;
 if exists(select 1 from storage.objects where bucket_id='evidence-files') then raise exception 'Anonymous file read allowed'; end if;
end $$;
rollback;
select 'PASS: owner/admin/team/inactive/anonymous scope; submission/rejection/resubmission/acceptance; audit; stale review; dashboard updates. All fixtures rolled back.' as result;
