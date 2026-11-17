-- Dedicated Nudee assignee identity: no cybersecurity or Data Office reviewer role.
-- Account access remains limited to explicitly assigned Nudee requirement IDs.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
 check (role in ('admin','cybersecurity_team','data_governance_team',
                'control_owner','nca_external_auditor','nudee_owner'));

-- A Data Office reviewer can pick an assignee without gaining broad SELECT
-- permissions over profiles. Return only the fields necessary for assignment.
create function public.nudee_assignees()
returns table(user_id uuid,display_name text,role text)
language plpgsql stable security definer set search_path = ''
as $$
begin
 if auth.uid() is null or not public.nudee_is_office() then
   raise exception 'Data Office role required';
 end if;
 return query select p.user_id,p.display_name,p.role from public.profiles p
  where p.is_active and p.role <> 'nca_external_auditor'
  order by p.display_name nulls last,p.user_id;
end;
$$;
revoke all on function public.nudee_assignees() from public,anon;
grant execute on function public.nudee_assignees() to authenticated;
