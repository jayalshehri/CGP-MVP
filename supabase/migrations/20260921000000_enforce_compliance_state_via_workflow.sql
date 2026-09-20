-- QA-ONLY. Phase 1 Pilot — Part A: close the direct compliance-state bypass
-- identified in the Controls & Evidence Lifecycle assessment.
--
-- Problem: the existing cgp_admin_team_update_controls UPDATE policy on
-- public.controls has no column restriction, so any admin/cybersecurity_team
-- account can set implementation_status/verification_status directly via
-- the API, completely bypassing the governed assess workflow (independent
-- reviewer, accepted/valid/non-self-uploaded evidence, resolved requests,
-- rationale). A narrower guard (assessment_control_guard, added earlier)
-- already blocks this for CSCC/DCC/TCC/OSMACC controls specifically, to
-- protect against the separate framework-level assessment subsystem writing
-- here directly -- but it does not cover ECC or CCC, which is where the real
-- per-control review-cycle workflow actually lives. This migration closes
-- that gap for every framework, without touching the existing guard.
--
-- Mechanism (smallest safe enforcement): a BEFORE UPDATE trigger on
-- public.controls rejects any change to implementation_status or
-- verification_status unless a transaction-local session flag is set. The
-- ONLY place that flag is ever set is inside private.grc_command's 'assess'
-- branch, immediately before the one legitimate UPDATE that sets those two
-- columns together. set_config(..., true) with is_local=true scopes the
-- flag to the current transaction only -- it cannot leak across requests,
-- connections, or sessions, and nothing needs to explicitly clear it.
--
-- Preserves every existing function/trigger unchanged: grc_audit,
-- assessment_control_guard, cgp_prepare_evidence, cgp_sync_evidence,
-- grc_refresh_evidence_summary, grc_expire_evidence_sweep are not modified.
-- private.grc_command is replaced with the SAME body plus exactly one added
-- line (the set_config call) -- no other logic changes.
-- No RLS policy is removed or narrowed; this is purely additive.

create or replace function private.enforce_compliance_state_via_workflow()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if (new.implementation_status is distinct from old.implementation_status
      or new.verification_status is distinct from old.verification_status)
     and coalesce(current_setting('private.grc_assess_context', true), '') <> 'on' then
    raise exception 'implementation_status/verification_status can only change through the governed assessment workflow (private.grc_command action=assess)' using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists enforce_compliance_state on public.controls;
create trigger enforce_compliance_state
  before update on public.controls
  for each row execute function private.enforce_compliance_state_via_workflow();

CREATE OR REPLACE FUNCTION private.grc_command(p_action text, p_control_id bigint, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); actor_role text; c public.controls%rowtype; cycle public.control_review_cycles%rowtype;
 e public.evidence%rowtype; l public.evidence_control_links%rowtype; new_id bigint; target bigint;
 reviewer uuid; due date; result text; reason text; ids bigint[]; next_due date; n integer;
begin
 select role into actor_role from public.profiles where user_id=actor and is_active;
 if actor is null or actor_role is null then raise exception 'Active account required' using errcode='42501'; end if;
 select * into c from public.controls where id=p_control_id for update;
 if not found or not(actor_role in ('admin','cybersecurity_team') or (actor_role='control_owner' and c.control_owner_id=actor)) then raise exception 'Control outside your scope' using errcode='42501'; end if;
 if p_action='submit' then
 insert into public.evidence(control_id,evidence_name,description,file_name,file_path,mime_type,file_size,status,is_current,replaces_id,request_id,valid_until,coverage_start,coverage_end)
 values(c.id,p_data->>'evidence_name',p_data->>'description',p_data->>'file_name',p_data->>'file_path',p_data->>'mime_type',(p_data->>'file_size')::bigint,'pending_review',true,(p_data->>'replaces_id')::bigint,(p_data->>'request_id')::bigint,(p_data->>'valid_until')::date,(p_data->>'coverage_start')::date,(p_data->>'coverage_end')::date) returning id into new_id;
 for target in select distinct value::bigint from jsonb_array_elements_text(coalesce(p_data->'targets','[]'::jsonb)) loop
 if actor_role not in ('admin','cybersecurity_team') or target=c.id or not exists(select 1 from public.control_framework_links m where (m.source_control_id=c.id and m.target_control_id=target) or (m.target_control_id=c.id and m.source_control_id=target)) then raise exception 'Invalid shared control mapping' using errcode='42501'; end if;
 insert into public.evidence_control_links(evidence_id,control_id,created_by) values(new_id,target,actor);
 perform private.grc_refresh_evidence_summary(target);
 end loop;
 return jsonb_build_object('id',new_id);
 end if;
 if actor_role not in ('admin','cybersecurity_team') then raise exception 'Compliance team required' using errcode='42501'; end if;
 if p_action='start_review' then
 select * into e from public.evidence where id=(p_data->>'evidence_id')::bigint and control_id=c.id for update;
 if not found or e.status<>'pending_review' or not e.is_current or e.uploaded_by=actor or (e.assigned_reviewer is not null and e.assigned_reviewer<>actor) then raise exception 'Independent assigned reviewer required' using errcode='42501'; end if;
 update public.evidence set status='under_review' where id=e.id;
 return jsonb_build_object('id',e.id);
 elsif p_action='open_cycle' then
 reviewer:=(p_data->>'reviewer_id')::uuid; due:=(p_data->>'due_date')::date;
 if c.control_owner_id is null or not exists(select 1 from public.profiles where user_id=c.control_owner_id and is_active and role='control_owner') then raise exception 'Assign an active control owner first'; end if;
 if not exists(select 1 from public.profiles where user_id=reviewer and is_active and role in ('admin','cybersecurity_team')) or reviewer=c.control_owner_id then raise exception 'Choose an independent active reviewer'; end if;
 if due is null then raise exception 'Due date required'; end if;
 insert into public.control_review_cycles(control_id,owner_id,reviewer_id,due_date,frequency,created_by,notes)
 values(c.id,c.control_owner_id,reviewer,due,coalesce(p_data->>'frequency',c.audit_frequency),actor,p_data->>'notes') returning id into new_id;
 insert into public.evidence_requests(control_id,cycle_id,requested_from,reviewer_id,requirement,due_date,created_by)
 values(c.id,new_id,c.control_owner_id,reviewer,coalesce(nullif(btrim(p_data->>'requirement'),''),c.title_ar),due,actor);
 update public.controls set next_audit_date=due,audit_frequency=coalesce(p_data->>'frequency',c.audit_frequency) where id=c.id;
 return jsonb_build_object('id',new_id);
 elsif p_action='reschedule' then
 select * into cycle from public.control_review_cycles where id=(p_data->>'cycle_id')::bigint and control_id=c.id for update;
 if not found or cycle.status<>'open' then raise exception 'Open cycle required'; end if;
 reason:=nullif(btrim(p_data->>'reason'),''); due:=(p_data->>'due_date')::date;
 reviewer:=(p_data->>'reviewer_id')::uuid;
 if reason is null or due is null then raise exception 'Date and change reason required'; end if;
 if c.control_owner_id is null or reviewer=c.control_owner_id or not exists(select 1 from public.profiles where user_id=reviewer and is_active and role in ('admin','cybersecurity_team')) then raise exception 'Independent reviewer required'; end if;
 update public.control_review_cycles set due_date=due,reviewer_id=reviewer,owner_id=c.control_owner_id,frequency=coalesce(p_data->>'frequency',frequency),notes=reason where id=cycle.id;
 update public.evidence_requests set due_date=due,reviewer_id=reviewer,requested_from=c.control_owner_id where cycle_id=cycle.id and status not in ('accepted','cancelled');
 update public.evidence set assigned_reviewer=reviewer where request_id in (select id from public.evidence_requests where cycle_id=cycle.id) and status in ('pending_review','under_review');
 update public.controls set next_audit_date=due,audit_frequency=coalesce(p_data->>'frequency',audit_frequency) where id=c.id;
 return jsonb_build_object('id',cycle.id);
 elsif p_action='assess' then
 select * into cycle from public.control_review_cycles where id=(p_data->>'cycle_id')::bigint and control_id=c.id for update;
 if not found or cycle.status<>'open' or cycle.reviewer_id<>actor then raise exception 'Open cycle and assigned reviewer required' using errcode='42501'; end if;
 result:=p_data->>'result'; reason:=nullif(btrim(p_data->>'reason'),'');
 if result not in ('implemented','in_progress','not_implemented','not_applicable') or reason is null then raise exception 'Assessment and rationale required'; end if;
 select coalesce(array_agg(distinct value::bigint),'{}') into ids from jsonb_array_elements_text(coalesce(p_data->'evidence_ids','[]'::jsonb));
 foreach target in array ids loop
 select * into e from public.evidence where id=target for update;
 if not found or not e.is_current or e.uploaded_by=actor or (e.valid_until is not null and e.valid_until<(now() at time zone 'Asia/Riyadh')::date) or not ((e.control_id=c.id and e.status='accepted') or exists(select 1 from public.evidence_control_links where evidence_id=e.id and control_id=c.id and status='accepted')) then raise exception 'Assessment requires current, accepted, valid evidence reviewed independently'; end if;
 end loop;
 if result='implemented' and cardinality(ids)=0 then raise exception 'Select supporting evidence for full implementation'; end if;
 if exists(select 1 from public.evidence_requests where cycle_id=cycle.id and status in ('open','submitted','changes_requested')) then raise exception 'Resolve outstanding evidence requests first'; end if;
 insert into public.control_assessments(control_id,cycle_id,result,rationale,evidence_ids,assessor_id) values(c.id,cycle.id,result,reason,ids,actor);
 next_due:=case when cycle.frequency='custom' then (p_data->>'next_due_date')::date else private.grc_next_date(greatest(cycle.due_date,(now() at time zone 'Asia/Riyadh')::date),cycle.frequency) end;
 if next_due is null or next_due <= (now() at time zone 'Asia/Riyadh')::date then raise exception 'Future next review date required'; end if;
 update public.control_review_cycles set status='completed',completed_at=now(),notes=reason where id=cycle.id;
 perform set_config('private.grc_assess_context','on',true);
 update public.controls set implementation_status=result,verification_status=case when result in ('implemented','not_applicable') then 'verified' else 'not_verified' end,last_review_date=(now() at time zone 'Asia/Riyadh')::date,last_audit_date=(now() at time zone 'Asia/Riyadh')::date,next_audit_date=next_due where id=c.id;
 insert into public.control_review_cycles(control_id,owner_id,reviewer_id,due_date,frequency,created_by) values(c.id,cycle.owner_id,cycle.reviewer_id,next_due,cycle.frequency,actor) returning id into new_id;
 insert into public.evidence_requests(control_id,cycle_id,requested_from,reviewer_id,requirement,due_date,created_by) values(c.id,new_id,cycle.owner_id,cycle.reviewer_id,'مراجعة دورية: '||c.title_ar,next_due,actor);
 return jsonb_build_object('next_cycle_id',new_id);
 elsif p_action='review_shared' then
 select * into l from public.evidence_control_links where id=(p_data->>'link_id')::bigint and control_id=c.id for update;
 if not found or l.status not in ('pending_review','under_review') then raise exception 'Shared evidence is no longer pending'; end if;
 select * into e from public.evidence where id=l.evidence_id for update;
 if not e.is_current or e.uploaded_by=actor or exists(select 1 from public.control_review_cycles where control_id=c.id and status='open' and reviewer_id<>actor) then raise exception 'Independent review of current evidence required' using errcode='42501'; end if;
 result:=p_data->>'decision'; reason:=nullif(btrim(p_data->>'notes'),'');
 if result not in ('accepted','rejected','changes_requested') or reason is null then raise exception 'Decision and reason required'; end if;
 if result='accepted' and e.valid_until<(now() at time zone 'Asia/Riyadh')::date then raise exception 'Expired evidence'; end if;
 update public.evidence_control_links set status=result,review_notes=reason,reviewed_at=now(),reviewed_by=actor::text where id=l.id;
 insert into public.evidence_control_link_reviews(link_id,decision,reviewer_name,review_notes) values(l.id,result,actor::text,reason);
 perform private.grc_refresh_evidence_summary(c.id);
 return jsonb_build_object('id',l.id);
 elsif p_action='cancel_request' then
 reason:=nullif(btrim(p_data->>'reason'),''); if reason is null then raise exception 'Cancellation reason required'; end if;
 update public.evidence_requests set status='cancelled',requirement=requirement||E'\nسبب الإلغاء: '||reason where id=(p_data->>'request_id')::bigint and control_id=c.id and status in ('open','changes_requested','rejected');
 get diagnostics n=row_count; if n=0 then raise exception 'Request cannot be cancelled'; end if;
 return '{}'::jsonb;
 else raise exception 'Unknown command'; end if;
end $function$;
