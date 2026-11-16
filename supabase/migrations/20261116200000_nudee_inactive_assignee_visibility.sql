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
   and a.assignee_id = (select auth.uid()) and p.is_active
 )
);
drop policy if exists nudee_audit_read on public.nudee_audit;
create policy nudee_audit_read on public.nudee_audit
for select to authenticated using (
 public.nudee_is_office() or exists (
  select 1 from public.nudee_assignments a
  join public.profiles p on p.user_id = a.assignee_id
  where a.id = public.nudee_audit.assignment_id
   and a.assignee_id = (select auth.uid()) and p.is_active
 )
);
