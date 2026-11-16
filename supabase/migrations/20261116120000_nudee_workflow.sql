-- Nudee evidence workflow: Data Office controls assignment and approval.
create table if not exists public.nudee_requirements (
 id bigint generated always as identity primary key,
 source_row integer not null unique,
 domain_name text not null,
 standard_code text not null,
 requirement_title text not null,
 maturity_level text not null,
 evidence_name text not null,
 evidence_description text,
 responsible_department text,
 specification_code text,
 source_compliance text,
 source_notes text,
 review_phase text,
 planned_start date,
 planned_end date,
 source_review_status text,
 source_progress numeric(5,4),
 created_at timestamptz not null default now()
);
create table if not exists public.nudee_assignments (
 id bigint generated always as identity primary key,
 requirement_id bigint not null unique references public.nudee_requirements(id),
 assignee_id uuid references auth.users(id),
 assigned_by uuid references auth.users(id),
 due_date date,
 status text not null default 'unassigned' check(status in ('unassigned','assigned','submitted','changes_requested','approved')),
 reviewer_id uuid references auth.users(id),
 review_notes text,
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.nudee_submissions (
 id bigint generated always as identity primary key,
 assignment_id bigint not null references public.nudee_assignments(id),
 submitted_by uuid not null references auth.users(id),
 storage_path text not null unique,
 file_name text not null,
 submitted_at timestamptz not null default now()
);
create table if not exists public.nudee_audit (
 id bigint generated always as identity primary key,
 assignment_id bigint not null references public.nudee_assignments(id),
 actor_id uuid not null references auth.users(id),
 action text not null,
 notes text,
 created_at timestamptz not null default now()
);
create or replace function public.nudee_is_office() returns boolean language sql stable security invoker set search_path = '' as $$
 select exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.is_active and p.role in ('admin','data_governance_team'))
$$;
revoke all on function public.nudee_is_office() from public,anon;
grant execute on function public.nudee_is_office() to authenticated;
alter table public.nudee_requirements enable row level security;
alter table public.nudee_assignments enable row level security;
alter table public.nudee_submissions enable row level security;
alter table public.nudee_audit enable row level security;
create policy nudee_requirements_office on public.nudee_requirements for select to authenticated using (public.nudee_is_office() or exists(select 1 from public.nudee_assignments a where a.requirement_id=id and a.assignee_id=(select auth.uid())));
create policy nudee_assignments_read on public.nudee_assignments for select to authenticated using (public.nudee_is_office() or assignee_id=(select auth.uid()));
create policy nudee_assignments_office_insert on public.nudee_assignments for insert to authenticated with check (public.nudee_is_office() and assigned_by=(select auth.uid()));
create policy nudee_assignments_office_update on public.nudee_assignments for update to authenticated using (public.nudee_is_office()) with check (public.nudee_is_office());
create policy nudee_submissions_read on public.nudee_submissions for select to authenticated using (public.nudee_is_office() or exists(select 1 from public.nudee_assignments a where a.id=assignment_id and a.assignee_id=(select auth.uid())));
create policy nudee_submissions_insert on public.nudee_submissions for insert to authenticated with check (submitted_by=(select auth.uid()) and exists(select 1 from public.nudee_assignments a where a.id=assignment_id and a.assignee_id=(select auth.uid()) and a.status in ('assigned','changes_requested')));
create policy nudee_audit_read on public.nudee_audit for select to authenticated using (public.nudee_is_office() or exists(select 1 from public.nudee_assignments a where a.id=assignment_id and a.assignee_id=(select auth.uid())));
create policy nudee_audit_insert on public.nudee_audit for insert to authenticated with check (actor_id=(select auth.uid()) and (public.nudee_is_office() or exists(select 1 from public.nudee_assignments a where a.id=assignment_id and a.assignee_id=(select auth.uid()))));
revoke all on public.nudee_requirements,public.nudee_assignments,public.nudee_submissions,public.nudee_audit from anon;
grant select on public.nudee_requirements to authenticated;
grant select,insert,update on public.nudee_assignments to authenticated;
grant select,insert on public.nudee_submissions,public.nudee_audit to authenticated;
grant usage,select on all sequences in schema public to authenticated;
-- Storage bucket is private. Assignees can upload only into their own assignment folder.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('nudee-evidence','nudee-evidence',false,20971520,array['application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) on conflict(id) do nothing;
create policy nudee_storage_read on storage.objects for select to authenticated using(bucket_id='nudee-evidence' and (public.nudee_is_office() or exists(select 1 from public.nudee_assignments a where a.id::text=(storage.foldername(name))[1] and a.assignee_id=(select auth.uid()))));
create policy nudee_storage_upload on storage.objects for insert to authenticated with check(bucket_id='nudee-evidence' and exists(select 1 from public.nudee_assignments a where a.id::text=(storage.foldername(name))[1] and a.assignee_id=(select auth.uid()) and a.status in ('assigned','changes_requested')));

-- Controlled state transition; only assigned uploader can submit, never approve.
create or replace function public.nudee_mark_submitted(p_assignment_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'Not authenticated'; end if;
 update public.nudee_assignments
 set status='submitted', updated_at=now()
 where id=p_assignment_id and assignee_id=(select auth.uid())
   and status in ('assigned','changes_requested')
   and exists(select 1 from public.nudee_submissions s where s.assignment_id=p_assignment_id and s.submitted_by=(select auth.uid()));
 if not found then raise exception 'Assignment not eligible for submission'; end if;
 insert into public.nudee_audit(assignment_id,actor_id,action) values(p_assignment_id,(select auth.uid()),'submitted');
end; $$;
revoke all on function public.nudee_mark_submitted(bigint) from public,anon;
grant execute on function public.nudee_mark_submitted(bigint) to authenticated;

-- Only office users can read the full requirements; assignees see their assigned requirements.
-- Validate transitions in the database to avoid client-side approval bypass.
create or replace function public.nudee_assignment_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if not public.nudee_is_office() and not (tg_op='UPDATE' and old.status in ('assigned','changes_requested') and new.status='submitted' and new.assignee_id=(select auth.uid()) and new.assignee_id=old.assignee_id and new.requirement_id=old.requirement_id) then raise exception 'Data Office authorization required'; end if;
 if tg_op='UPDATE' then
   if old.status='approved' then raise exception 'Approved assignments are immutable'; end if;
   if new.status in ('approved','changes_requested') and old.status <> 'submitted' then
     raise exception 'Only submitted assignments may be reviewed';
   end if;
   if new.status='changes_requested' and nullif(trim(new.review_notes),'') is null then
     raise exception 'Review notes are required';
   end if;
   if new.status='submitted' and not (old.status in ('assigned','changes_requested') and new.assignee_id=(select auth.uid())) then raise exception 'Invalid submission'; end if;
 end if;
 return new;
end; $$;
create trigger nudee_assignment_guard_trigger before insert or update on public.nudee_assignments for each row execute function public.nudee_assignment_guard();
-- Prevent reassignment after upload and reject inactive or unauthorized assignees.
create or replace function public.nudee_validate_assignee()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if new.assignee_id is not null and not exists(
  select 1 from public.profiles p where p.user_id=new.assignee_id and p.is_active and p.role='control_owner'
 ) then raise exception 'Assignee must be an active control owner'; end if;
 return new;
end; $$;
create trigger nudee_validate_assignee_trigger before insert or update on public.nudee_assignments for each row execute function public.nudee_validate_assignee();
