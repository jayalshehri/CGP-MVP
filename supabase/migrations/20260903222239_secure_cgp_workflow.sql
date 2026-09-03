-- Role scope is enforced in Postgres as well as in the UI.
revoke all on public.controls, public.evidence, public.evidence_reviews, public.frameworks from anon;
alter table public.controls enable row level security;
alter table public.evidence enable row level security;
alter table public.evidence_reviews enable row level security;
alter table public.frameworks enable row level security;

drop policy if exists "Enable read access for all users" on public.controls;
create policy cgp_controls_read on public.controls for select to authenticated using (
  (select private.current_user_role()) in ('admin','cybersecurity_team') or
  ((select private.current_user_role()) = 'control_owner' and control_owner_id=(select auth.uid()))
);
drop policy if exists "Enable insert access for all users" on public.evidence;
drop policy if exists "Enable read access for all users" on public.evidence;
drop policy if exists "Enable review updates for evidence" on public.evidence;
create policy cgp_evidence_read on public.evidence for select to authenticated using (exists(select 1 from public.controls c where c.id=control_id));
create policy cgp_evidence_submit on public.evidence for insert to authenticated with check (
  (select private.current_user_role()) is not null and status='pending_review' and is_current=true and
  reviewed_at is null and reviewed_by is null and review_notes is null and
  exists(select 1 from public.controls c where c.id=control_id)
);
create policy cgp_evidence_review on public.evidence for update to authenticated
using ((select private.current_user_role()) in ('admin','cybersecurity_team'))
with check ((select private.current_user_role()) in ('admin','cybersecurity_team'));
revoke update on public.evidence from authenticated;
grant update(status,review_notes) on public.evidence to authenticated;
revoke delete on public.evidence from authenticated;
drop policy if exists "Enable insert access for evidence reviews" on public.evidence_reviews;
drop policy if exists "Enable read access for evidence reviews" on public.evidence_reviews;
revoke insert,update,delete on public.evidence_reviews from authenticated;
create policy cgp_review_history on public.evidence_reviews for select to authenticated using (exists(select 1 from public.evidence e where e.id=evidence_id));
drop policy if exists "Frameworks are readable" on public.frameworks;
create policy cgp_frameworks_read on public.frameworks for select to authenticated using ((select private.current_user_role()) is not null);
create policy cgp_team_read_owners on public.profiles for select to authenticated using (
  (select private.current_user_role()) in ('admin','cybersecurity_team') and role='control_owner' and is_active
);

-- File access follows the assigned control. Only an uploader may remove an
-- unregistered file (compensation after a failed metadata insert).
drop policy if exists "Allow evidence deletes" on storage.objects;
drop policy if exists "Allow evidence reads" on storage.objects;
drop policy if exists "Allow evidence updates" on storage.objects;
drop policy if exists "Allow evidence uploads" on storage.objects;
drop policy if exists "Allow evidence uploads 1m9h75t_0" on storage.objects;
create policy cgp_file_read on storage.objects for select to authenticated using (
 bucket_id='evidence-files' and exists(select 1 from public.controls c where c.id::text=split_part(name,'/',1))
);
create policy cgp_file_upload on storage.objects for insert to authenticated with check (
 bucket_id='evidence-files' and (select private.current_user_role()) is not null and
 exists(select 1 from public.controls c where c.id::text=split_part(name,'/',1))
);
create policy cgp_file_cleanup on storage.objects for delete to authenticated using (
 bucket_id='evidence-files' and owner_id=(select auth.uid())::text and
 exists(select 1 from public.controls c where c.id::text=split_part(name,'/',1)) and
 not exists(select 1 from public.evidence e where e.file_path=name)
);

-- Internal triggers need narrowly scoped privileges to derive control status
-- and preserve audit history. They are not exposed RPCs and never accept a user id.
drop trigger if exists evidence_sync_control_status on public.evidence;
drop function if exists public.sync_control_evidence_status();
create or replace function private.cgp_prepare_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); actor_role text; owner uuid;
begin
 select role into actor_role from public.profiles where user_id=actor and is_active;
 if actor is null or actor_role is null then raise exception 'Active CGP account required' using errcode='42501'; end if;
 select control_owner_id into owner from public.controls where id=new.control_id for update;
 if not found or not (actor_role in ('admin','cybersecurity_team') or (actor_role='control_owner' and owner=actor)) then
   raise exception 'Control is outside your scope' using errcode='42501';
 end if;
 if TG_OP='INSERT' then
   if new.status is distinct from 'pending_review' or new.file_path is null or
      nullif(btrim(new.evidence_name),'') is null or new.file_size <= 0 or new.file_size > 20971520 then
     raise exception 'A valid uploaded evidence file is required';
   end if;
   if not exists(select 1 from storage.objects o where o.bucket_id='evidence-files' and o.name=new.file_path
     and split_part(o.name,'/',1)=new.control_id::text and o.owner_id=actor::text) then
     raise exception 'Upload a file to this control first' using errcode='42501';
   end if;
   if exists(select 1 from public.evidence where file_path=new.file_path) then raise exception 'File already submitted'; end if;
   new.is_current:=true; new.uploaded_at:=now(); new.submitted_at:=now();
   new.reviewed_by:=null; new.reviewed_at:=null; new.review_notes:=null;
 else
   if actor_role not in ('admin','cybersecurity_team') then raise exception 'Reviewer role required' using errcode='42501'; end if;
   if not old.is_current or old.status not in ('pending_review','under_review') then raise exception 'Evidence is no longer pending. Refresh the page.'; end if;
   if new.status not in ('accepted','rejected') then raise exception 'Invalid review decision'; end if;
   if new.status='rejected' and nullif(btrim(new.review_notes),'') is null then raise exception 'Rejection notes are required'; end if;
   new.review_notes:=nullif(btrim(new.review_notes),'');
   new.reviewed_at:=now(); new.reviewed_by:=actor::text;
 end if;
 return new;
end $$;
revoke all on function private.cgp_prepare_evidence() from public,anon,authenticated;
create trigger cgp_prepare_evidence before insert or update of status on public.evidence for each row execute function private.cgp_prepare_evidence();

create or replace function private.cgp_sync_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if TG_OP='INSERT' then
   -- The latest submission is current; earlier submissions remain as history.
   update public.evidence set is_current=false where control_id=new.control_id and id<>new.id and is_current;
 else
   insert into public.evidence_reviews(evidence_id,decision,reviewer_name,review_notes,reviewed_at)
   values(new.id,new.status,new.reviewed_by,new.review_notes,new.reviewed_at);
 end if;
 update public.controls set
   evidence_status=new.status,
   verification_status=case when new.status='accepted' then 'verified' when new.status='rejected' then 'not_verified' else 'under_review' end,
   implementation_status=case when new.status='accepted' then 'implemented' else 'in_progress' end,
   last_review_date=case when new.status in ('accepted','rejected') then current_date else last_review_date end
 where id=new.control_id;
 return new;
end $$;
revoke all on function private.cgp_sync_evidence() from public,anon,authenticated;
create trigger cgp_sync_evidence after insert or update of status on public.evidence for each row execute function private.cgp_sync_evidence();

create or replace function public.cgp_review_evidence(p_evidence_id bigint,p_decision text,p_notes text default null)
returns void language plpgsql security invoker set search_path='' as $$
declare target_control bigint;
begin
 if (select private.current_user_role()) is null or (select private.current_user_role()) not in ('admin','cybersecurity_team') then
 raise exception 'Reviewer role required' using errcode='42501'; end if;
 select control_id into target_control from public.evidence where id=p_evidence_id;
 if not found then raise exception 'Evidence not found'; end if;
 perform 1 from public.controls where id=target_control for update;
 update public.evidence set status=p_decision,review_notes=p_notes where id=p_evidence_id and is_current and status in ('pending_review','under_review');
 if not found then raise exception 'Evidence is no longer pending. Refresh the page.'; end if;
end $$;
revoke all on function public.cgp_review_evidence(bigint,text,text) from public,anon;
grant execute on function public.cgp_review_evidence(bigint,text,text) to authenticated;

create or replace function public.cgp_dashboard() returns jsonb
language sql stable security invoker set search_path='' as $$
 with scoped as (
 select * from public.controls where
   (select private.current_user_role()) in ('admin','cybersecurity_team') or
   ((select private.current_user_role())='control_owner' and control_owner_id=(select auth.uid()))
 ), totals as (
 select count(*) total,
 count(*) filter(where lower(trim(implementation_status)) in ('implemented','compliant')) done,
 count(*) filter(where lower(trim(evidence_status)) not in ('uploaded','pending_review','under_review','accepted','approved','verified')) waiting_evidence,
 count(*) filter(where due_date < (now() at time zone 'Asia/Riyadh')::date and lower(trim(implementation_status)) not in ('implemented','compliant')) overdue,
 count(*) filter(where lower(trim(verification_status)) in ('verified','approved')) verified from scoped
 ), domains as (
 select domain_ar name,count(*) total,count(*) filter(where lower(trim(implementation_status)) in ('implemented','compliant')) done from scoped group by domain_ar
 )
 select jsonb_build_object('total',t.total,'compliance',case when t.total=0 then 0 else round(100.0*t.done/t.total) end,
 'waiting_evidence',t.waiting_evidence,'overdue',t.overdue,'verified',t.verified,
 'pending_review',(select count(*) from public.evidence e join scoped c on c.id=e.control_id where e.is_current and e.status in ('pending_review','under_review')),
 'domains',coalesce((select jsonb_agg(jsonb_build_object('name',d.name,'total',d.total,'done',d.done,'percentage',round(100.0*d.done/d.total)) order by d.name) from domains d),'[]'::jsonb)) from totals t;
$$;
revoke all on function public.cgp_dashboard() from public,anon;
grant execute on function public.cgp_dashboard() to authenticated;
create index if not exists cgp_controls_owner_idx on public.controls(control_owner_id);
create index if not exists cgp_evidence_control_idx on public.evidence(control_id);
create index if not exists cgp_evidence_file_idx on public.evidence(file_path);
-- Reconcile pre-existing submissions without changing their review history.
with ranked as (select id,row_number() over(partition by control_id order by uploaded_at desc nulls last,id desc)=1 current_row from public.evidence)
update public.evidence e set is_current=r.current_row from ranked r where e.id=r.id;
update public.controls c set evidence_status=e.status,
 verification_status=case when e.status='accepted' then 'verified' when e.status='rejected' then 'not_verified' else 'under_review' end,
 implementation_status=case when e.status='accepted' then 'implemented' else 'in_progress' end
from public.evidence e where e.control_id=c.id and e.is_current and e.status in ('pending_review','under_review','accepted','rejected');
