begin;

-- Additive migration: historical evidence and decisions are retained verbatim.
create table public.control_review_cycles (
 id bigint generated always as identity primary key,
 control_id bigint not null references public.controls(id),
 owner_id uuid not null references public.profiles(user_id),
 reviewer_id uuid not null references public.profiles(user_id),
 due_date date not null,
 status text not null default 'open' check(status in ('open','completed','cancelled')),
 frequency text not null check(frequency in ('monthly','quarterly','semiannual','annual','custom')),
 created_at timestamptz not null default now(), created_by uuid not null references public.profiles(user_id),
 completed_at timestamptz, notes text,
 check(owner_id <> reviewer_id)
);
create unique index grc_one_open_cycle on public.control_review_cycles(control_id) where status='open';
create index grc_cycles_due on public.control_review_cycles(due_date) where status='open';
create table public.evidence_requests (
 id bigint generated always as identity primary key,
 control_id bigint not null references public.controls(id),
 cycle_id bigint not null references public.control_review_cycles(id),
 requested_from uuid not null references public.profiles(user_id),
 reviewer_id uuid not null references public.profiles(user_id),
 requirement text not null check(length(btrim(requirement))>0),
 due_date date not null,
 status text not null default 'open' check(status in ('open','submitted','changes_requested','accepted','rejected','cancelled')),
 created_at timestamptz not null default now(), created_by uuid not null references public.profiles(user_id)
);
alter table public.evidence
 add column evidence_group uuid not null default gen_random_uuid(),
 add column version_number integer not null default 1 check(version_number>0),
 add column replaces_id bigint references public.evidence(id),
 add column uploaded_by uuid references public.profiles(user_id),
 add column uploader_name text,
 add column reviewer_display_name text,
 add column valid_until date,
 add column coverage_start date,
 add column coverage_end date,
 add column request_id bigint references public.evidence_requests(id),
 add column assigned_reviewer uuid references public.profiles(user_id),
 add constraint evidence_coverage_order check(coverage_start is null or coverage_end is null or coverage_end>=coverage_start);
-- Recover uploader only where Storage attribution resolves to an existing profile.
update public.evidence e set uploaded_by=p.user_id
from storage.objects o join public.profiles p on p.user_id::text=o.owner_id
where o.bucket_id='evidence-files' and o.name=e.file_path;
create unique index grc_evidence_group_version on public.evidence(evidence_group,version_number);
create unique index grc_evidence_group_current on public.evidence(evidence_group) where is_current;
alter table public.evidence drop constraint if exists evidence_status_check;
alter table public.evidence add constraint evidence_status_check check(status in ('not_uploaded','pending_review','under_review','accepted','rejected','changes_requested'));
alter table public.evidence_reviews drop constraint if exists evidence_reviews_decision_check;
alter table public.evidence_reviews add constraint evidence_reviews_decision_check check(decision in ('accepted','rejected','changes_requested'));
alter table public.evidence_control_links drop constraint if exists evidence_control_links_status_check;
alter table public.evidence_control_links add constraint evidence_control_links_status_check check(status in ('pending_review','under_review','accepted','rejected','changes_requested'));
alter table public.evidence_control_link_reviews drop constraint if exists evidence_control_link_reviews_decision_check;
alter table public.evidence_control_link_reviews add constraint evidence_control_link_reviews_decision_check check(decision in ('accepted','rejected','changes_requested'));
-- Never cascade deletion through decision history.
alter table public.evidence_reviews drop constraint evidence_reviews_evidence_id_fkey;
alter table public.evidence_reviews add constraint evidence_reviews_evidence_id_fkey foreign key(evidence_id) references public.evidence(id) on delete restrict;
alter table public.evidence_control_link_reviews drop constraint evidence_control_link_reviews_link_id_fkey;
alter table public.evidence_control_link_reviews add constraint evidence_control_link_reviews_link_id_fkey foreign key(link_id) references public.evidence_control_links(id) on delete restrict;

create table public.control_assessments (
 id bigint generated always as identity primary key,
 control_id bigint not null references public.controls(id),
 cycle_id bigint not null unique references public.control_review_cycles(id),
 result text not null check(result in ('implemented','in_progress','not_implemented','not_applicable')),
 rationale text not null check(length(btrim(rationale))>0),
 evidence_ids bigint[] not null default '{}',
 assessor_id uuid not null references public.profiles(user_id),
 assessed_at timestamptz not null default now()
);
create table public.grc_audit_events (
 id bigint generated always as identity primary key,
 control_id bigint references public.controls(id),
 entity_type text not null, entity_id text not null, action text not null,
 actor_id uuid, actor_name text,
 previous_data jsonb, new_data jsonb,
 occurred_at timestamptz not null default now()
);
create index grc_events_control_time on public.grc_audit_events(control_id,occurred_at desc,id desc);

-- All new writes use validated commands; clients only read scoped rows.
do $$ declare t text; begin
 foreach t in array array['control_review_cycles','evidence_requests','control_assessments','grc_audit_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy grc_scoped_read on public.%I for select to authenticated using (exists(select 1 from public.controls c where c.id=control_id))',t);
 end loop;
end $$;
revoke truncate, references, trigger on public.controls,public.evidence,public.evidence_reviews,public.evidence_control_links,public.evidence_control_link_reviews from authenticated;
revoke insert,update,delete on public.evidence_control_link_reviews from authenticated;
revoke update,delete on public.evidence_control_links from authenticated;
-- Explicitly qualify both sides: avoid resolving the outer control_id to evidence.control_id.
drop policy if exists cgp_shared_evidence_links_team_insert on public.evidence_control_links;
create policy cgp_shared_evidence_links_team_insert on public.evidence_control_links for insert to authenticated with check (
 (select private.current_user_role()) in ('admin','cybersecurity_team') and created_by=(select auth.uid())
 and status='pending_review' and reviewed_at is null and reviewed_by is null and review_notes is null
 and exists(select 1 from public.evidence e join public.control_framework_links m
 on (m.source_control_id=e.control_id and m.target_control_id=evidence_control_links.control_id)
 or (m.target_control_id=e.control_id and m.source_control_id=evidence_control_links.control_id)
 where e.id=evidence_control_links.evidence_id and e.is_current)
);

create or replace function private.grc_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb; after_row jsonb; row_data jsonb; cid bigint; actor_label text;
begin
 if TG_OP <> 'INSERT' then before_row:=to_jsonb(old); end if;
 if TG_OP <> 'DELETE' then after_row:=to_jsonb(new); end if;
 if before_row is not distinct from after_row then return new; end if;
 row_data:=coalesce(after_row,before_row);
 if TG_TABLE_NAME='controls' then cid:=(row_data->>'id')::bigint;
 elsif TG_TABLE_NAME='evidence_reviews' then select control_id into cid from public.evidence where id=(row_data->>'evidence_id')::bigint;
 elsif TG_TABLE_NAME='evidence_control_link_reviews' then select control_id into cid from public.evidence_control_links where id=(row_data->>'link_id')::bigint;
 else cid:=(row_data->>'control_id')::bigint; end if;
 select display_name into actor_label from public.profiles where user_id=auth.uid();
 insert into public.grc_audit_events(control_id,entity_type,entity_id,action,actor_id,actor_name,previous_data,new_data)
 values(cid,TG_TABLE_NAME,row_data->>'id',lower(TG_OP),auth.uid(),actor_label,before_row,after_row);
 if TG_OP='DELETE' then return old; end if; return new;
end $$;
revoke all on function private.grc_audit() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['controls','evidence','evidence_reviews','evidence_control_links','evidence_control_link_reviews','control_review_cycles','evidence_requests','control_assessments'] loop
 execute format('create trigger grc_audit after insert or update or delete on public.%I for each row execute function private.grc_audit()',t);
 end loop;
end $$;

create or replace function private.cgp_prepare_evidence() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role text; owner uuid; prior public.evidence%rowtype; req public.evidence_requests%rowtype;
begin
 select role into actor_role from public.profiles where user_id=actor and is_active;
 if actor is null or actor_role is null then raise exception 'Active account required' using errcode='42501'; end if;
 select control_owner_id into owner from public.controls where id=new.control_id for update;
 if not found or not(actor_role in ('admin','cybersecurity_team') or (actor_role='control_owner' and owner=actor)) then raise exception 'Control outside your scope' using errcode='42501'; end if;
 if TG_OP='INSERT' then
 if new.status is distinct from 'pending_review' or nullif(btrim(new.evidence_name),'') is null or new.file_size is null or new.file_size<=0 or new.file_size>20971520 then raise exception 'Valid evidence file required'; end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='evidence-files' and o.name=new.file_path and split_part(o.name,'/',1)=new.control_id::text and o.owner_id=actor::text) then raise exception 'Upload a file to this control first' using errcode='42501'; end if;
 if exists(select 1 from public.evidence where file_path=new.file_path) then raise exception 'File already registered'; end if;
 if new.valid_until < (now() at time zone 'Asia/Riyadh')::date then raise exception 'Evidence validity has expired'; end if;
 new.evidence_group:=gen_random_uuid(); new.version_number:=1;
 if new.replaces_id is not null then
 select * into prior from public.evidence where id=new.replaces_id for update;
 if not found or prior.control_id<>new.control_id or not prior.is_current then raise exception 'Choose the current version of this control'; end if;
 new.evidence_group:=prior.evidence_group; new.version_number:=prior.version_number+1;
 if new.request_id is null and exists(select 1 from public.evidence_requests r join public.control_review_cycles rc on rc.id=r.cycle_id where r.id=prior.request_id and r.status not in ('accepted','cancelled') and rc.status='open') then new.request_id:=prior.request_id; end if;
 update public.evidence set is_current=false where id=prior.id;
 end if;
 new.assigned_reviewer:=null;
 if new.request_id is not null then
 select * into req from public.evidence_requests where id=new.request_id for update;
 if not found or req.control_id<>new.control_id or req.status in ('accepted','cancelled') or not exists(select 1 from public.control_review_cycles where id=req.cycle_id and status='open') then raise exception 'Evidence request is not open'; end if;
 new.assigned_reviewer:=req.reviewer_id;
 end if;
 new.uploaded_by:=actor; select display_name into new.uploader_name from public.profiles where user_id=actor; new.uploaded_at:=now(); new.submitted_at:=now(); new.is_current:=true;
 new.reviewed_at:=null; new.reviewed_by:=null; new.review_notes:=null;
 else
 if actor_role not in ('admin','cybersecurity_team') or actor=new.uploaded_by or (new.assigned_reviewer is not null and new.assigned_reviewer<>actor) then raise exception 'Independent assigned reviewer required' using errcode='42501'; end if;
 if not old.is_current or old.status not in ('pending_review','under_review') then raise exception 'Evidence is no longer pending'; end if;
 if new.status='under_review' and old.status='pending_review' then
 new.assigned_reviewer:=actor; new.reviewed_at:=null; new.reviewed_by:=null; new.review_notes:=null; return new;
 end if;
 if new.status not in ('accepted','rejected','changes_requested') then raise exception 'Invalid decision'; end if;
 if nullif(btrim(new.review_notes),'') is null then raise exception 'Decision reason required'; end if;
 if new.status='accepted' and new.valid_until < (now() at time zone 'Asia/Riyadh')::date then raise exception 'Expired evidence cannot be accepted'; end if;
 select display_name into new.reviewer_display_name from public.profiles where user_id=actor;
 new.review_notes:=btrim(new.review_notes); new.reviewed_by:=actor::text; new.reviewed_at:=now();
 end if;
 return new;
end $$;

create function private.grc_refresh_evidence_summary(p_control_id bigint) returns void language sql security definer set search_path='' as $$
 with items as (
 select e.status,e.valid_until from public.evidence e where e.control_id=p_control_id and e.is_current
 union all
 select l.status,e.valid_until from public.evidence_control_links l join public.evidence e on e.id=l.evidence_id where l.control_id=p_control_id and e.is_current
 ), active as (select * from items where valid_until is null or valid_until >= (now() at time zone 'Asia/Riyadh')::date)
 update public.controls set evidence_status=case
 when exists(select 1 from active where status in ('pending_review','under_review')) then 'pending_review'
 when exists(select 1 from active where status='changes_requested') then 'changes_requested'
 when exists(select 1 from active where status='rejected') then 'rejected'
 when exists(select 1 from active where status='accepted') then 'accepted'
 when exists(select 1 from items) then 'expired'
 else 'not_uploaded' end where id=p_control_id;
$$;
revoke all on function private.grc_refresh_evidence_summary(bigint) from public,anon,authenticated;

create or replace function private.cgp_sync_evidence() returns trigger language plpgsql security definer set search_path='' as $$
declare target bigint;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if TG_OP='UPDATE' and new.status in ('accepted','rejected','changes_requested') then
 insert into public.evidence_reviews(evidence_id,decision,reviewer_name,review_notes,reviewed_at) values(new.id,new.status,new.reviewed_by,new.review_notes,new.reviewed_at);
 end if;
 if new.request_id is not null then update public.evidence_requests set status=case
 when exists(select 1 from public.evidence where request_id=new.request_id and is_current and status in ('pending_review','under_review')) then 'submitted'
 when exists(select 1 from public.evidence where request_id=new.request_id and is_current and status='changes_requested') then 'changes_requested'
 when exists(select 1 from public.evidence where request_id=new.request_id and is_current and status='rejected') then 'rejected'
 else 'accepted' end where id=new.request_id; end if;
 -- Approval of a document never overwrites a control assessment.
 perform private.grc_refresh_evidence_summary(new.control_id);
 for target in select distinct control_id from public.evidence_control_links where evidence_id in (new.id,new.replaces_id) loop
 perform private.grc_refresh_evidence_summary(target);
 end loop;
 return new;
end $$;

-- Read mappings in either direction for any framework.
create function public.grc_control_mappings(p_control_id bigint)
returns table(control_id bigint,framework_code text,control_code text,control_title text,relationship_type text,source_note text)
language sql stable security invoker set search_path='' as $$
 select distinct c.id,f.code,c.control_code,c.title_ar,m.relationship_type,m.source_note
 from public.control_framework_links m join public.controls c on c.id=case when m.source_control_id=p_control_id then m.target_control_id else m.source_control_id end
 join public.frameworks f on f.id=c.framework_id
 where (m.source_control_id=p_control_id or m.target_control_id=p_control_id) and exists(select 1 from public.controls where id=p_control_id);
$$;
revoke all on function public.grc_control_mappings(bigint) from public,anon;
grant execute on function public.grc_control_mappings(bigint) to authenticated;

-- Calendar month arithmetic clamps month end rather than drifting into the next month.
create function private.grc_next_date(p_date date,p_frequency text) returns date language sql immutable set search_path='' as $$
 select case p_frequency when 'monthly' then (p_date+interval '1 month')::date when 'quarterly' then (p_date+interval '3 months')::date when 'semiannual' then (p_date+interval '6 months')::date when 'annual' then (p_date+interval '1 year')::date else null end;
$$;
revoke all on function private.grc_next_date(date,text) from public,anon,authenticated;

-- Commands are private, authenticated and explicitly role/scope checked; the public API is an invoker wrapper.
create function private.grc_command(p_action text,p_control_id bigint,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
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
end $$;
revoke all on function private.grc_command(text,bigint,jsonb) from public,anon;
grant execute on function private.grc_command(text,bigint,jsonb) to authenticated;
create function public.cgp_grc_command(p_action text,p_control_id bigint,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select private.grc_command(p_action,p_control_id,p_data); $$;
revoke all on function public.cgp_grc_command(text,bigint,jsonb) from public,anon;
grant execute on function public.cgp_grc_command(text,bigint,jsonb) to authenticated;

create or replace function public.cgp_review_shared_evidence_link(p_link_id bigint,p_decision text,p_notes text default null) returns void
language plpgsql security invoker set search_path='' as $$
declare cid bigint; begin
 select control_id into cid from public.evidence_control_links where id=p_link_id;
 if cid is null then raise exception 'Shared evidence not accessible'; end if;
 perform public.cgp_grc_command('review_shared',cid,jsonb_build_object('link_id',p_link_id,'decision',p_decision,'notes',p_notes));
end $$;
-- A target's scoped user can see shared evidence without obtaining access to the source control.
create policy grc_shared_target_read on public.evidence_control_links for select to authenticated using(exists(select 1 from public.controls c where c.id=evidence_control_links.control_id));
create policy grc_shared_history_read on public.evidence_control_link_reviews for select to authenticated using(exists(select 1 from public.evidence_control_links l where l.id=link_id));
create policy grc_shared_evidence_read on public.evidence for select to authenticated using(exists(select 1 from public.evidence_control_links l where l.evidence_id=evidence.id));
create policy grc_shared_file_read on storage.objects for select to authenticated using(bucket_id='evidence-files' and exists(select 1 from public.evidence e join public.evidence_control_links l on l.evidence_id=e.id where e.file_path=name));
create policy grc_team_reviewer_directory on public.profiles for select to authenticated using((select private.current_user_role()) in ('admin','cybersecurity_team') and role in ('admin','cybersecurity_team') and is_active);

create function public.grc_evidence_register() returns table(
 id bigint,control_id bigint,source_control_id bigint,link_id bigint,evidence_name text,file_name text,file_path text,description text,
 status text,is_current boolean,version_number integer,evidence_group uuid,uploaded_at timestamptz,reviewed_at timestamptz,
 review_notes text,valid_until date,uploader_name text,reviewer_display_name text,uploaded_by uuid,assigned_reviewer uuid)
language sql stable security invoker set search_path='' as $$
 select e.id,e.control_id,e.control_id,null::bigint,e.evidence_name,e.file_name,e.file_path,e.description,e.status,e.is_current,e.version_number,e.evidence_group,e.uploaded_at,e.reviewed_at,e.review_notes,e.valid_until,e.uploader_name,e.reviewer_display_name,e.uploaded_by,e.assigned_reviewer
 from public.evidence e join public.controls c on c.id=e.control_id
 union all
 select e.id,l.control_id,e.control_id,l.id,e.evidence_name,e.file_name,e.file_path,e.description,l.status,e.is_current,e.version_number,e.evidence_group,e.uploaded_at,l.reviewed_at,l.review_notes,e.valid_until,e.uploader_name,l.reviewed_by,e.uploaded_by,(select rc.reviewer_id from public.control_review_cycles rc where rc.control_id=l.control_id and rc.status='open')
 from public.evidence_control_links l join public.evidence e on e.id=l.evidence_id join public.controls c on c.id=l.control_id;
$$;
revoke all on function public.grc_evidence_register() from public,anon;
grant execute on function public.grc_evidence_register() to authenticated;
drop trigger cgp_prepare_evidence on public.evidence;
create trigger cgp_prepare_evidence before insert or update of status,review_notes on public.evidence for each row execute function private.cgp_prepare_evidence();
create or replace function public.cgp_dashboard() returns jsonb language sql stable security invoker set search_path='' as $$
with scoped as (select c.* from public.controls c), measured as (
 select *, implementation_status<>'not_applicable' applicable,
 implementation_status in ('implemented','compliant') and verification_status in ('verified','approved') compliant from scoped
), totals as (
 select count(*) total,count(*) filter(where applicable) applicable,
 count(*) filter(where applicable and compliant) done,
 count(*) filter(where applicable and evidence_status not in ('uploaded','pending_review','under_review','accepted','approved','verified')) waiting_evidence,
 count(*) filter(where applicable and due_date<(now() at time zone 'Asia/Riyadh')::date and not compliant) overdue,
 count(*) filter(where applicable and verification_status in ('verified','approved')) verified from measured
), domains as (
 select domain_ar name,count(*) total,count(*) filter(where applicable) applicable,count(*) filter(where applicable and compliant) done from measured group by domain_ar
)
select jsonb_build_object('total',t.total,'applicable',t.applicable,'compliance',coalesce(round(100.0*t.done/nullif(t.applicable,0)),0),
'waiting_evidence',t.waiting_evidence,'overdue',t.overdue,'verified',t.verified,
'pending_review',(select count(*) from public.grc_evidence_register() e where e.is_current and e.status in ('pending_review','under_review')),
'domains',coalesce((select jsonb_agg(jsonb_build_object('name',d.name,'total',d.total,'applicable',d.applicable,'done',d.done,'percentage',coalesce(round(100.0*d.done/nullif(d.applicable,0)),0)) order by d.name) from domains d),'[]'::jsonb)) from totals t;
$$;
commit;
