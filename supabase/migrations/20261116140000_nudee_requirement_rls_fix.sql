-- Reapply corrected Nudee requirement visibility for existing QA installations.
drop policy if exists nudee_requirements_read on public.nudee_requirements;
create policy nudee_requirements_read on public.nudee_requirements for select to authenticated
 using (public.nudee_is_office() or exists(
  select 1 from public.nudee_assignments a join public.profiles p on p.user_id=a.assignee_id
  where a.requirement_id=public.nudee_requirements.id
    and a.assignee_id=(select auth.uid()) and p.is_active));