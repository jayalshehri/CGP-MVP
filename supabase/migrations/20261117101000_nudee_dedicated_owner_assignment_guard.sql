-- Restrict Nudee evidence assignments to the dedicated least-privilege owner role.
-- No cybersecurity/admin/control-owner account is implicitly a Nudee assignee.
-- Existing assignments remain auditable; QA is clean prior to this migration.
create or replace function public.nudee_assignees()
returns table(user_id uuid,display_name text,role text)
language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null or not public.nudee_is_office() then
   raise exception 'Data Office role required';
 end if;
 return query select p.user_id,p.display_name,p.role
 from public.profiles p
 where p.is_active and p.role = 'nudee_owner'
 order by p.display_name nulls last,p.user_id;
end;
$$;
revoke all on function public.nudee_assignees() from public,anon;
grant execute on function public.nudee_assignees() to authenticated;

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
    and p.role = 'nudee_owner'
 ) then
   raise exception 'Assignee must have an active Nudee owner account';
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
