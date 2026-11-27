alter table public.nudee_audit add column submission_id bigint references public.nudee_submissions(id);

create function private.nudee_review_version(p_assignment_id bigint, p_submission_id bigint, p_decision text, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  latest_id bigint;
  review_event_id bigint;
begin
  if auth.uid() is null or not public.nudee_is_office() then
    raise exception 'Data Office reviewer role required' using errcode = '42501';
  end if;
  -- Submission and review both lock the assignment before writing their audit event.
  perform 1 from public.nudee_assignments
    where id = p_assignment_id and status = 'submitted' and assignee_id <> auth.uid() for update;
  if not found then
    raise exception 'Review is no longer available' using errcode = '40001';
  end if;
  select id into latest_id from public.nudee_submissions where assignment_id = p_assignment_id order by id desc limit 1;
  if p_submission_id is null or latest_id is distinct from p_submission_id then
    raise exception 'Submission changed before review' using errcode = '40001';
  end if;
  perform public.nudee_review_evidence(p_assignment_id, p_decision, p_notes);
  select id into strict review_event_id from public.nudee_audit
    where assignment_id = p_assignment_id order by id desc limit 1;
  update public.nudee_audit set submission_id = latest_id where id = review_event_id;
end;
$$;

create function public.nudee_review_version(p_assignment_id bigint, p_submission_id bigint, p_decision text, p_notes text default null)
returns void language sql security invoker set search_path = '' as $$
  select private.nudee_review_version(p_assignment_id, p_submission_id, p_decision, p_notes);
$$;

revoke all on function private.nudee_review_version(bigint,bigint,text,text) from public, anon;
revoke all on function public.nudee_review_version(bigint,bigint,text,text) from public, anon;
grant execute on function private.nudee_review_version(bigint,bigint,text,text) to authenticated;
grant execute on function public.nudee_review_version(bigint,bigint,text,text) to authenticated;
