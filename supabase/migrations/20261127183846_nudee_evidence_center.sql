alter table public.nudee_submissions drop constraint nudee_reuse_locator,
  add constraint nudee_reuse_locator check (
    (source_submission_id is null and source_locator is null) or
    (source_locator is not null and length(btrim(source_locator)) between 1 and 300)
  );

create function private.nudee_submit_with_locator(p_assignment_id bigint,p_storage_path text,p_file_name text,p_locator text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_locator is null or length(btrim(p_locator)) not between 1 and 300 then
    raise exception 'Invalid evidence locator' using errcode='23514';
  end if;
  perform public.nudee_submit_evidence(p_assignment_id,p_storage_path,p_file_name);
  update public.nudee_submissions set source_locator=btrim(p_locator)
   where assignment_id=p_assignment_id and storage_path=p_storage_path
     and submitted_by=auth.uid() and source_submission_id is null;
  if not found then raise exception 'Submission not available'; end if;
end;
$$;
create function public.nudee_submit_with_locator(p_assignment_id bigint,p_storage_path text,p_file_name text,p_locator text)
returns void language sql security invoker set search_path='' as $$
 select private.nudee_submit_with_locator(p_assignment_id,p_storage_path,p_file_name,p_locator);
$$;
revoke all on function private.nudee_submit_with_locator(bigint,text,text,text),public.nudee_submit_with_locator(bigint,text,text,text) from public,anon;
grant execute on function private.nudee_submit_with_locator(bigint,text,text,text),public.nudee_submit_with_locator(bigint,text,text,text) to authenticated;

alter table public.nudee_audit add column reviewer_name text;
update public.nudee_audit a set reviewer_name=p.display_name from public.profiles p
 where a.action in ('approved','changes_requested') and a.actor_id=p.user_id;
create function private.nudee_record_reviewer_name() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  select display_name into new.reviewer_name from public.profiles where user_id=new.actor_id;
  return new;
end;
$$;
revoke all on function private.nudee_record_reviewer_name() from public,anon,authenticated;
create trigger nudee_record_reviewer_name before insert on public.nudee_audit for each row
 when (new.action in ('approved','changes_requested')) execute function private.nudee_record_reviewer_name();

-- Match the scope and immutable evidence snapshot used by nudee_question_decide.
create function public.nudee_question_overview()
returns table(domain_name text,standard_code text,target_level text,question_state text,missing_count bigint)
language sql stable security invoker set search_path='' as $$
 with levels as (select array['المستوى 1: البناء','المستوى 2: التعريف','المستوى 3: التفعيل'] as names),
 latest as (
   select distinct on (d.domain_name,d.standard_code) d.* from public.nudee_question_decisions d
   order by d.domain_name,d.standard_code,d.id desc
 ), evidence as (
   select r.id,r.domain_name,r.standard_code,r.requirement_title,d.target_level,d.confirmed,d.evidence_ids,s.id as submission_id,
     array_position(l.names,r.maturity_level) as rank,array_position(l.names,d.target_level) as target_rank
   from public.nudee_requirements r cross join levels l
   left join latest d using(domain_name,standard_code)
   left join public.nudee_assignments a on a.requirement_id=r.id and a.status='approved'
   left join lateral (select f.id from public.nudee_submissions f where f.assignment_id=a.id order by f.id desc limit 1) s on true
   where (select public.nudee_is_office())
 ), grouped as (
   select e.domain_name,e.standard_code,e.target_level,e.confirmed,e.evidence_ids,
     bool_and(e.rank is not null) and count(distinct e.requirement_title)=1 as supported,
     count(*) filter(where e.rank=e.target_rank) as at_target,
     count(*) filter(where e.rank<=e.target_rank and e.submission_id is null) as missing,
     array_agg(e.submission_id order by e.id) filter(where e.rank<=e.target_rank) as ids
   from evidence e group by e.domain_name,e.standard_code,e.target_level,e.confirmed,e.evidence_ids
 )
 select g.domain_name,g.standard_code,g.target_level,
   case when not g.supported then 'unsupported' when g.target_level is null then 'no_target'
     when g.at_target=0 then 'unsupported' when g.missing>0 then 'blocked'
     when g.confirmed and g.evidence_ids=g.ids then 'confirmed' else 'ready' end,
   g.missing from grouped g order by g.domain_name,g.standard_code;
$$;
revoke all on function public.nudee_question_overview() from public,anon;
grant execute on function public.nudee_question_overview() to authenticated;
notify pgrst,'reload schema';
