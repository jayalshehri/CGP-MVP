-- Do not expose an orphan upload to a newly assigned requirement owner.
-- A binary uploaded just before a failed submit RPC remains in Storage without
-- a nudee_submissions row. Such files must be cleaned up before reassignment.
drop policy if exists nudee_storage_delete_unsent on storage.objects;
create policy nudee_storage_delete_unsent on storage.objects
for delete to authenticated using (
 bucket_id = 'nudee-evidence'
 and exists (
  select 1 from public.nudee_assignments a
  where a.id::text = (storage.foldername(storage.objects.name))[1]
    and a.status in ('assigned','changes_requested')
    and not exists (
      select 1 from public.nudee_submissions s
      where s.storage_path = storage.objects.name
    )
    and (
      public.nudee_is_office()
      or (
        a.assignee_id = (select auth.uid())
        and exists (
          select 1 from public.profiles p
          where p.user_id = (select auth.uid()) and p.is_active
        )
      )
    )
 )
);

-- Reassign only if there are neither submitted records nor orphan binaries
-- in the assignment folder. Office can remove orphan binaries under the
-- delete policy above before retrying reassignment.
create or replace function public.nudee_assign(
 p_requirement_id bigint, p_assignee_id uuid, p_due_date date default null
)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
 if (select auth.uid()) is null or not public.nudee_is_office() then
   raise exception 'Data Office role required';
 end if;
 if not exists (
  select 1 from public.profiles p
  where p.user_id = p_assignee_id and p.is_active
    and p.role <> 'nca_external_auditor'
 ) then
   raise exception 'Assignee must have an active eligible account';
 end if;
 if not exists (
  select 1 from public.nudee_requirements where id = p_requirement_id
 ) then
   raise exception 'Unknown Nudee requirement';
 end if;
 insert into public.nudee_assignments
   (requirement_id,assignee_id,assigned_by,due_date,status)
 values (p_requirement_id,p_assignee_id,(select auth.uid()),p_due_date,'assigned')
 on conflict (requirement_id) do update
 set assignee_id = excluded.assignee_id,
     assigned_by = excluded.assigned_by,
     due_date = excluded.due_date,
     status = 'assigned',
     review_notes = null,
     reviewer_id = null,
     reviewed_at = null,
     updated_at = now()
 where public.nudee_assignments.status = 'assigned'
   and not exists (
     select 1 from public.nudee_submissions s
     where s.assignment_id = public.nudee_assignments.id
   )
   and not exists (
     select 1 from storage.objects o
     where o.bucket_id = 'nudee-evidence'
       and o.name like public.nudee_assignments.id::text || '/%'
   )
 returning id into v_id;
 if v_id is null then
   raise exception 'Submitted or stored evidence blocks reassignment; remove any unsent upload first';
 end if;
 insert into public.nudee_audit (assignment_id,actor_id,action,notes)
 values (v_id,(select auth.uid()),'assigned','Assignee: '||p_assignee_id::text);
 return v_id;
end;
$$;
revoke all on function public.nudee_assign(bigint,uuid,date) from public,anon;
grant execute on function public.nudee_assign(bigint,uuid,date) to authenticated;
