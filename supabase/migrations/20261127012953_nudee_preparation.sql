-- Office decisions form an append-only history. The previous event is supplied
-- by the editor to prevent a second reviewer overwriting a newer target.
create table public.nudee_question_decisions (
  id bigint generated always as identity primary key,
  domain_name text not null,
  standard_code text not null,
  target_level text not null,
  confirmed boolean not null,
  evidence_ids bigint[] not null,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index nudee_decisions_question_idx on public.nudee_question_decisions(domain_name,standard_code,id desc);
alter table public.nudee_question_decisions enable row level security;
revoke all on public.nudee_question_decisions from public,anon,authenticated;
grant select on public.nudee_question_decisions to authenticated;
create policy nudee_office_decisions on public.nudee_question_decisions for select to authenticated using ((select public.nudee_is_office()));

create function private.nudee_question_decide(p_domain text,p_code text,p_level text,p_confirm boolean,p_previous bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare
  levels constant text[] := array['المستوى 1: البناء','المستوى 2: التعريف','المستوى 3: التفعيل'];
  prior bigint;
  evidence bigint[];
  result_id bigint;
begin
  if auth.uid() is null or not public.nudee_is_office() then raise exception 'Office role required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext(p_domain),hashtext(p_code));
  select id into prior from public.nudee_question_decisions where domain_name=p_domain and standard_code=p_code order by id desc limit 1;
  if prior is distinct from p_previous then raise exception 'Question changed' using errcode='40001'; end if;
  if p_confirm is null or array_position(levels,p_level) is null or not exists (
    select 1 from public.nudee_requirements where domain_name=p_domain and standard_code=p_code and maturity_level=p_level
  ) or exists (select 1 from public.nudee_requirements where domain_name=p_domain and standard_code=p_code and array_position(levels,maturity_level) is null)
  or (select count(distinct requirement_title) from public.nudee_requirements where domain_name=p_domain and standard_code=p_code) <> 1
  then raise exception 'Unknown question or maturity level'; end if;
  if p_confirm then
    select array_agg(s.id order by r.id) into evidence
    from public.nudee_requirements r
    left join public.nudee_assignments a on a.requirement_id=r.id and a.status='approved'
    left join lateral (select id from public.nudee_submissions where assignment_id=a.id order by id desc limit 1) s on true
    where r.domain_name=p_domain and r.standard_code=p_code and array_position(levels,r.maturity_level)<=array_position(levels,p_level);
    if evidence is null or array_position(evidence,null) is not null then raise exception 'Evidence incomplete' using errcode='23514'; end if;
  end if;
  insert into public.nudee_question_decisions(domain_name,standard_code,target_level,confirmed,evidence_ids,actor_id)
    values(p_domain,p_code,p_level,p_confirm,coalesce(evidence,'{}'),auth.uid()) returning id into result_id;
  return result_id;
end;
$$;
create function public.nudee_question_decide(p_domain text,p_code text,p_level text,p_confirm boolean,p_previous bigint)
returns bigint language sql security invoker set search_path='' as $$
 select private.nudee_question_decide(p_domain,p_code,p_level,p_confirm,p_previous);
$$;
revoke all on function private.nudee_question_decide(text,text,text,boolean,bigint), public.nudee_question_decide(text,text,text,boolean,bigint) from public,anon;
grant execute on function private.nudee_question_decide(text,text,text,boolean,bigint), public.nudee_question_decide(text,text,text,boolean,bigint) to authenticated;

-- An original upload remains unique. Reuse points to its private object and
-- creates a separate submission/decision for the receiving assignment.
alter table public.nudee_submissions
  add column source_submission_id bigint references public.nudee_submissions(id),
  add column source_locator text,
  add constraint nudee_reuse_locator check (
    (source_submission_id is null and source_locator is null) or
    (source_submission_id is not null and source_locator is not null and length(trim(source_locator)) between 1 and 300)
  );
create unique index nudee_original_path_idx on public.nudee_submissions(storage_path) where source_submission_id is null;
alter table public.nudee_submissions drop constraint nudee_submissions_storage_path_key;
create index nudee_submissions_source_idx on public.nudee_submissions(source_submission_id) where source_submission_id is not null;

create function private.nudee_reuse_evidence(p_assignment bigint,p_source bigint,p_locator text)
returns bigint language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  source_file public.nudee_submissions%rowtype;
  new_id bigint;
begin
  if actor is null or not exists(select 1 from public.profiles where user_id=actor and role='nudee_owner' and is_active)
    then raise exception 'Owner required' using errcode='42501'; end if;
  if p_locator is null or length(trim(p_locator)) not between 1 and 300 then raise exception 'Page or section required'; end if;
  select s.* into source_file from public.nudee_submissions s
  join public.nudee_assignments a on a.id=s.assignment_id
  where s.id=p_source and s.submitted_by=actor and a.assignee_id=actor and a.status='approved'
    and s.assignment_id<>p_assignment and s.source_submission_id is null
    and not exists(select 1 from public.nudee_submissions newer where newer.assignment_id=a.id and newer.id>s.id);
  if not found then raise exception 'Source unavailable' using errcode='42501'; end if;
  update public.nudee_assignments set status='submitted',review_notes=null,reviewer_id=null,reviewed_at=null,updated_at=now()
    where id=p_assignment and assignee_id=actor and status in ('assigned','changes_requested');
  if not found then raise exception 'Assignment changed' using errcode='40001'; end if;
  insert into public.nudee_submissions(assignment_id,submitted_by,storage_path,file_name,source_submission_id,source_locator)
    values(p_assignment,actor,source_file.storage_path,source_file.file_name,p_source,trim(p_locator)) returning id into new_id;
  insert into public.nudee_audit(assignment_id,actor_id,action,submission_id) values(p_assignment,actor,'submitted',new_id);
  return new_id;
end;
$$;
create function public.nudee_reuse_evidence(p_assignment bigint,p_source bigint,p_locator text)
returns bigint language sql security invoker set search_path='' as $$
 select private.nudee_reuse_evidence(p_assignment,p_source,p_locator);
$$;
revoke all on function private.nudee_reuse_evidence(bigint,bigint,text), public.nudee_reuse_evidence(bigint,bigint,text) from public,anon;
grant execute on function private.nudee_reuse_evidence(bigint,bigint,text), public.nudee_reuse_evidence(bigint,bigint,text) to authenticated;

-- The export manifest is one MVCC snapshot. The object paths point to immutable submissions.
create function public.nudee_preparation_manifest(p_domain text,p_code text default null)
returns table (requirement_id bigint, standard_code text, specification_code text, maturity_level text,
 evidence_name text,status text,submission_id bigint,storage_path text,file_name text,source_locator text)
language sql stable security invoker set search_path='' as $$
 select r.id,r.standard_code,r.specification_code,r.maturity_level,r.evidence_name,coalesce(a.status,'unassigned'),s.id,s.storage_path,s.file_name,s.source_locator
 from public.nudee_requirements r
 left join public.nudee_assignments a on a.requirement_id=r.id
 left join lateral (select f.* from public.nudee_submissions f where f.assignment_id=a.id and a.status='approved' order by f.id desc limit 1) s on true
 where (select public.nudee_is_office()) and r.domain_name=p_domain and (p_code is null or r.standard_code=p_code)
 order by r.source_row,r.id;
$$;
revoke all on function public.nudee_preparation_manifest(text,text) from public,anon;
grant execute on function public.nudee_preparation_manifest(text,text) to authenticated;
notify pgrst,'reload schema';
