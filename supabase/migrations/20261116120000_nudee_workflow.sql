-- Nudee: isolated Data Office evidence workflow, least privilege.
create table public.nudee_requirements (
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
 actual_end date,
 source_review_status text,
 source_progress numeric(5,4) check (source_progress between 0 and 1),
 schedule_indicator text,
 created_at timestamptz not null default now()
);
create table public.nudee_assignments (
 id bigint generated always as identity primary key,
 requirement_id bigint not null unique references public.nudee_requirements(id),
 assignee_id uuid not null references auth.users(id),
 assigned_by uuid not null references auth.users(id),
 due_date date,
 status text not null default 'assigned'
   check (status in ('assigned','submitted','changes_requested','approved')),
 reviewer_id uuid references auth.users(id),
 review_notes text,
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.nudee_submissions (
 id bigint generated always as identity primary key,
 assignment_id bigint not null references public.nudee_assignments(id),
 submitted_by uuid not null references auth.users(id),
 storage_path text not null unique,
 file_name text not null,
 submitted_at timestamptz not null default now()
);
create table public.nudee_audit (
 id bigint generated always as identity primary key,
 assignment_id bigint not null references public.nudee_assignments(id),
 actor_id uuid not null references auth.users(id),
 action text not null check (action in ('assigned','submitted','approved','changes_requested')),
 notes text,
 created_at timestamptz not null default now()
);
create index nudee_assignments_assignee_idx on public.nudee_assignments(assignee_id);
create index nudee_submissions_assignment_idx on public.nudee_submissions(assignment_id,submitted_at desc);
create index nudee_audit_assignment_idx on public.nudee_audit(assignment_id,created_at desc);

-- Office rights follow the Data Office role, not cybersecurity control-owner role.
create function public.nudee_is_office() returns boolean language sql stable security invoker set search_path = '' as $$
 select exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.is_active and p.role in ('admin','data_governance_team'))
$$;
revoke all on function public.nudee_is_office() from public,anon;
grant execute on function public.nudee_is_office() to authenticated;

alter table public.nudee_requirements enable row level security;
alter table public.nudee_assignments enable row level security;
alter table public.nudee_submissions enable row level security;
alter table public.nudee_audit enable row level security;
create policy nudee_requirements_read on public.nudee_requirements for select to authenticated
 using (public.nudee_is_office() or exists(
  select 1 from public.nudee_assignments a join public.profiles p on p.user_id=a.assignee_id
  where a.requirement_id=public.nudee_requirements.id and a.assignee_id=(select auth.uid()) and p.is_active));
create policy nudee_assignments_read on public.nudee_assignments for select to authenticated
 using (public.nudee_is_office() or (assignee_id=(select auth.uid()) and exists(
  select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.is_active)));
create policy nudee_submissions_read on public.nudee_submissions for select to authenticated
 using (public.nudee_is_office() or exists(
  select 1 from public.nudee_assignments a where a.id=assignment_id and a.assignee_id=(select auth.uid())) );
create policy nudee_audit_read on public.nudee_audit for select to authenticated
 using (public.nudee_is_office() or exists(
  select 1 from public.nudee_assignments a where a.id=assignment_id and a.assignee_id=(select auth.uid())) );

-- No direct client writes: all transitions and audit events are atomic RPC transactions.
revoke all on public.nudee_requirements,public.nudee_assignments,public.nudee_submissions,public.nudee_audit from public,anon,authenticated;
grant select on public.nudee_requirements,public.nudee_assignments,public.nudee_submissions,public.nudee_audit to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('nudee-evidence','nudee-evidence',false,20971520,
 array['application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy nudee_storage_read on storage.objects for select to authenticated using(
 bucket_id='nudee-evidence' and (public.nudee_is_office() or exists(
 select 1 from public.nudee_assignments a join public.profiles p on p.user_id=a.assignee_id
 where a.id::text=(storage.foldername(name))[1] and a.assignee_id=(select auth.uid()) and p.is_active))
);
create policy nudee_storage_upload on storage.objects for insert to authenticated with check(
 bucket_id='nudee-evidence' and exists(
 select 1 from public.nudee_assignments a join public.profiles p on p.user_id=a.assignee_id
 where a.id::text=(storage.foldername(name))[1] and a.assignee_id=(select auth.uid())
   and a.status in ('assigned','changes_requested') and p.is_active)
);

create function public.nudee_assign(p_requirement_id bigint,p_assignee_id uuid,p_due_date date default null)
 returns bigint language plpgsql security definer set search_path='' as $$
declare v_id bigint;
begin
 if (select auth.uid()) is null or not public.nudee_is_office() then
  raise exception 'Data Office role required';
 end if;
 if not exists(select 1 from public.profiles p where p.user_id=p_assignee_id
    and p.is_active and p.role <> 'nca_external_auditor') then
  raise exception 'Assignee must have an active eligible account';
 end if;
 if not exists(select 1 from public.nudee_requirements where id=p_requirement_id) then
  raise exception 'Unknown Nudee requirement';
 end if;
 insert into public.nudee_assignments(requirement_id,assignee_id,assigned_by,due_date,status)
 values(p_requirement_id,p_assignee_id,(select auth.uid()),p_due_date,'assigned')
 on conflict (requirement_id) do update
 set assignee_id=excluded.assignee_id,assigned_by=excluded.assigned_by,
     due_date=excluded.due_date,status='assigned',review_notes=null,reviewer_id=null,
     reviewed_at=null,updated_at=now()
 where public.nudee_assignments.status='assigned'
   and not exists(select 1 from public.nudee_submissions s where s.assignment_id=public.nudee_assignments.id)
 returning id into v_id;
 if v_id is null then raise exception 'Submitted, reviewed or evidenced assignments cannot be reassigned'; end if;
 insert into public.nudee_audit(assignment_id,actor_id,action,notes)
 values(v_id,(select auth.uid()),'assigned','Assignee: '||p_assignee_id::text);
 return v_id;
end; $$;
revoke all on function public.nudee_assign(bigint,uuid,date) from public,anon;
grant execute on function public.nudee_assign(bigint,uuid,date) to authenticated;

create function public.nudee_submit_evidence(p_assignment_id bigint,p_storage_path text,p_file_name text)
 returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid := auth.uid();
begin
 if v_uid is null then raise exception 'Not authenticated'; end if;
 if p_storage_path is null or p_storage_path not like p_assignment_id::text||'/%'
    or nullif(btrim(p_file_name),'') is null or length(p_file_name)>255 then
   raise exception 'Invalid evidence path or name';
 end if;
 if not exists(
  select 1 from storage.objects o where o.bucket_id='nudee-evidence'
   and o.name=p_storage_path and o.owner_id=v_uid::text) then
  raise exception 'Evidence file does not exist or is not owned by uploader';
 end if;
 update public.nudee_assignments a set status='submitted',updated_at=now(),review_notes=null,reviewer_id=null,reviewed_at=null
 where a.id=p_assignment_id and a.assignee_id=v_uid and a.status in ('assigned','changes_requested')
   and exists(select 1 from public.profiles p where p.user_id=v_uid and p.is_active);
 if not found then raise exception 'Assignment not eligible for submission'; end if;
 insert into public.nudee_submissions(assignment_id,submitted_by,storage_path,file_name)
 values(p_assignment_id,v_uid,p_storage_path,p_file_name);
 insert into public.nudee_audit(assignment_id,actor_id,action)
 values(p_assignment_id,v_uid,'submitted');
end; $$;
revoke all on function public.nudee_submit_evidence(bigint,text,text) from public,anon;
grant execute on function public.nudee_submit_evidence(bigint,text,text) to authenticated;

create function public.nudee_review_evidence(p_assignment_id bigint,p_decision text,p_notes text default null)
 returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid := auth.uid();
begin
 if v_uid is null or not public.nudee_is_office() then
  raise exception 'Data Office reviewer role required';
 end if;
 if p_decision not in ('approved','changes_requested') then raise exception 'Invalid review decision'; end if;
 if p_decision='changes_requested' and nullif(btrim(p_notes),'') is null then
  raise exception 'Reason required for changes requested';
 end if;
 update public.nudee_assignments a
 set status=p_decision,review_notes=nullif(btrim(p_notes),''),reviewer_id=v_uid,
     reviewed_at=now(),updated_at=now()
 where a.id=p_assignment_id and a.status='submitted' and a.assignee_id<>v_uid
   and exists(select 1 from public.nudee_submissions s where s.assignment_id=a.id);
 if not found then raise exception 'Only submitted evidence may be reviewed by a different user'; end if;
 insert into public.nudee_audit(assignment_id,actor_id,action,notes)
 values(p_assignment_id,v_uid,p_decision,nullif(btrim(p_notes),''));
end; $$;
revoke all on function public.nudee_review_evidence(bigint,text,text) from public,anon;
grant execute on function public.nudee_review_evidence(bigint,text,text) to authenticated;
