-- Re-check the CURRENT role on every owner-side access, not only assignment time.
-- Changing an assigned account away from nudee_owner immediately removes owner
-- data/Storage/submit rights while preserving the assignment and audit history.
-- Office/admin access remains governed by nudee_is_office(); formulas are unchanged.
-- CREATE OR REPLACE preserves the submit RPC's existing EXECUTE privileges.
-- No new client grants or privileges are introduced.

-- Reapply corrected Nudee requirement visibility for existing QA installations.
drop policy if exists nudee_requirements_read on public.nudee_requirements;
create policy nudee_requirements_read on public.nudee_requirements for select to authenticated
 using (public.nudee_is_office() or exists(
  select 1 from public.nudee_assignments a join public.profiles p on p.user_id=a.assignee_id
  where a.requirement_id=public.nudee_requirements.id
    and a.assignee_id=(select auth.uid()) and p.is_active and p.role = 'nudee_owner'));

drop policy if exists nudee_assignments_read on public.nudee_assignments;
create policy nudee_assignments_read on public.nudee_assignments for select to authenticated
 using (public.nudee_is_office() or (assignee_id=(select auth.uid()) and exists(
  select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.is_active and p.role = 'nudee_owner')));


-- Prevent deactivated Nudee assignees from reading former evidence or audit history.
-- The requirements, assignments and Storage policies already require an active profile;
-- keep submissions and audit equally restrictive.
drop policy if exists nudee_submissions_read on public.nudee_submissions;
create policy nudee_submissions_read on public.nudee_submissions
for select to authenticated using (
 public.nudee_is_office() or exists (
  select 1 from public.nudee_assignments a
  join public.profiles p on p.user_id = a.assignee_id
  where a.id = public.nudee_submissions.assignment_id
   and a.assignee_id = (select auth.uid()) and p.is_active and p.role = 'nudee_owner'
 )
);
drop policy if exists nudee_audit_read on public.nudee_audit;
create policy nudee_audit_read on public.nudee_audit
for select to authenticated using (
 public.nudee_is_office() or exists (
  select 1 from public.nudee_assignments a
  join public.profiles p on p.user_id = a.assignee_id
  where a.id = public.nudee_audit.assignment_id
   and a.assignee_id = (select auth.uid()) and p.is_active and p.role = 'nudee_owner'
 )
);


-- Defense in depth: an assigned Nudee owner must not forge an object's owner_id.
-- Storage uploads run with the uploader's JWT. The HTTP Storage service ordinarily
-- populates owner_id from that JWT; bind the RLS INSERT policy to the same identity.
-- This hardens the policy against direct authenticated storage.objects inserts.
-- The SELECT and DELETE policies below also require the current owner role.
drop policy if exists nudee_storage_upload on storage.objects;
create policy nudee_storage_upload on storage.objects
for insert to authenticated with check (
  bucket_id = 'nudee-evidence'
  and owner_id = (select auth.uid())::text
  and exists (
    select 1
    from public.nudee_assignments a
    join public.profiles p on p.user_id = a.assignee_id
    where a.id::text = (storage.foldername(storage.objects.name))[1]
      and a.assignee_id = (select auth.uid())
      and a.status in ('assigned', 'changes_requested')
      and p.is_active and p.role = 'nudee_owner'
  )
);


-- Defense in depth against an assignment/upload race.
-- A Storage object uploaded by the former assignee can commit after
-- an office reassignment's orphan check. Folder ownership alone must
-- never grant a new assignee access to the former assignee's bytes.
-- Office users retain read/cleanup rights for orphan resolution.
drop policy if exists nudee_storage_read on storage.objects;
create policy nudee_storage_read on storage.objects
for select to authenticated using (
  bucket_id = 'nudee-evidence'
  and (
    public.nudee_is_office()
    or (
      owner_id = (select auth.uid())::text
      and exists (
        select 1
        from public.nudee_assignments a
        join public.profiles p on p.user_id = a.assignee_id
        where a.id::text = (storage.foldername(storage.objects.name))[1]
          and a.assignee_id = (select auth.uid())
          and p.is_active and p.role = 'nudee_owner'
      )
    )
  )
);

drop policy if exists nudee_storage_delete_unsent on storage.objects;
create policy nudee_storage_delete_unsent on storage.objects
for delete to authenticated using (
  bucket_id = 'nudee-evidence'
  and exists (
    select 1
    from public.nudee_assignments a
    where a.id::text = (storage.foldername(storage.objects.name))[1]
      and a.status in ('assigned', 'changes_requested')
      and not exists (
        select 1 from public.nudee_submissions s
        where s.storage_path = storage.objects.name
      )
      and (
        public.nudee_is_office()
        or (
          owner_id = (select auth.uid())::text
          and a.assignee_id = (select auth.uid())
          and exists (
            select 1 from public.profiles p
            where p.user_id = (select auth.uid()) and p.is_active and p.role = 'nudee_owner'
          )
        )
      )
  )
);

create or replace function public.nudee_submit_evidence(p_assignment_id bigint,p_storage_path text,p_file_name text)
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
   and exists(select 1 from public.profiles p where p.user_id=v_uid and p.is_active and p.role = 'nudee_owner');
 if not found then raise exception 'Assignment not eligible for submission'; end if;
 insert into public.nudee_submissions(assignment_id,submitted_by,storage_path,file_name)
 values(p_assignment_id,v_uid,p_storage_path,p_file_name);
 insert into public.nudee_audit(assignment_id,actor_id,action)
 values(p_assignment_id,v_uid,'submitted');
end; $$;

