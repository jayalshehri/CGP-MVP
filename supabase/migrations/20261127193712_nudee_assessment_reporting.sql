-- Preserve historical files and decisions. Only the version-checked public entry points can write.
revoke all on function public.nudee_review_evidence(bigint,text,text), public.nudee_submit_evidence(bigint,text,text) from authenticated,anon,public;

create table public.nudee_specifications(code text primary key,page integer not null check(page>0));
-- Specification codes and first cross-reference in SDAIA NDI v1.1; printed page numbering.
insert into public.nudee_specifications(code,page) values
 ('BIA.1.1',62),
 ('BIA.1.2',63),
 ('BIA.1.3',63),
 ('BIA.1.4',63),
 ('BIA.2.1',65),
 ('BIA.2.2',65),
 ('BIA.3.1',63),
 ('BIA.3.2',65),
 ('BIA.4.1',64),
 ('BIA.5.1',63),
 ('DAM.1.1',47),
 ('DAM.2.1',47),
 ('DAM.3.1',46),
 ('DAM.3.2',46),
 ('DAM.3.3',47),
 ('DAM.3.4',48),
 ('DAM.3.5',48),
 ('DAM.4.1',48),
 ('DAM.4.2',49),
 ('DAM.5.1',47),
 ('DAM.5.2',48),
 ('DAM.6.1',47),
 ('DAM.7.1',48),
 ('DC.1.1',81),
 ('DC.1.2',82),
 ('DC.2.1',82),
 ('DC.3.1',82),
 ('DC.3.2',82),
 ('DC.3.3',82),
 ('DC.3.4',83),
 ('DC.3.5',83),
 ('DC.4.1',83),
 ('DC.5.1',83),
 ('DCM.1.1',42),
 ('DCM.1.2',42),
 ('DCM.1.3',43),
 ('DCM.1.4',42),
 ('DCM.2.1',44),
 ('DCM.3.1',43),
 ('DCM.4.1',44),
 ('DCM.4.2',44),
 ('DCM.4.3',44),
 ('DCM.4.4',44),
 ('DCM.4.5',45),
 ('DCM.5.1',45),
 ('DG.1.1',17),
 ('DG.1.2',17),
 ('DG.1.3',17),
 ('DG.1.4',17),
 ('DG.2.1',18),
 ('DG.2.2',18),
 ('DG.3.1',22),
 ('DG.4.1',19),
 ('DG.4.10',20),
 ('DG.4.11',20),
 ('DG.4.2',20),
 ('DG.4.3',19),
 ('DG.4.4',20),
 ('DG.4.5',21),
 ('DG.4.6',20),
 ('DG.4.7',21),
 ('DG.4.8',20),
 ('DG.4.9',20),
 ('DG.5.1',19),
 ('DG.5.2',19),
 ('DG.5.3',19),
 ('DG.6.1',17),
 ('DG.6.2',23),
 ('DG.7.1',19),
 ('DG.7.2',18),
 ('DG.8.1',23),
 ('DG.8.2',23),
 ('DG.8.3',23),
 ('DO.1.1',36),
 ('DO.1.2',36),
 ('DO.1.3',36),
 ('DO.1.4',36),
 ('DO.2.1',36),
 ('DO.3.1',38),
 ('DO.3.2',38),
 ('DO.3.3',38),
 ('DO.3.4',38),
 ('DO.3.5',38),
 ('DO.4.1',39),
 ('DO.4.2',40),
 ('DO.4.3',40),
 ('DO.5.1',37),
 ('DQ.1.1',31),
 ('DQ.1.2',30),
 ('DQ.1.3',31),
 ('DQ.2.1',31),
 ('DQ.2.2',33),
 ('DQ.2.3',31),
 ('DQ.2.4',32),
 ('DQ.2.5',31),
 ('DQ.3.1',33),
 ('DQ.3.2',32),
 ('DQ.4.1',33),
 ('DQ.4.2',33),
 ('DQ.4.3',33),
 ('DSI.1.1',50),
 ('DSI.1.2',50),
 ('DSI.1.3',50),
 ('DSI.2.1',51),
 ('DSI.3.1',54),
 ('DSI.3.2',54),
 ('DSI.3.3',54),
 ('DSI.3.4',54),
 ('DSI.4.1',55),
 ('DSI.4.2',55),
 ('DSI.5.1',51),
 ('DSI.6.1',52),
 ('DSI.7.1',52),
 ('DSI.7.2',52),
 ('DSI.7.3',53),
 ('DSI.8.1',54),
 ('DVR.1.1',70),
 ('DVR.1.2',70),
 ('DVR.2.1',72),
 ('DVR.2.2',72),
 ('DVR.2.3',72),
 ('DVR.2.4',72),
 ('DVR.3.1',70),
 ('DVR.4.1',71),
 ('FOI.1.1',78),
 ('FOI.2.1',78),
 ('FOI.3.1',79),
 ('FOI.3.2',79),
 ('FOI.3.3',79),
 ('FOI.3.4',79),
 ('FOI.3.5',80),
 ('FOI.3.6',78),
 ('FOI.4.1',80),
 ('MCM.1.1',24),
 ('MCM.1.2',25),
 ('MCM.1.3',25),
 ('MCM.2.1',26),
 ('MCM.2.2',26),
 ('MCM.3.1',26),
 ('MCM.3.2',26),
 ('MCM.4.1',28),
 ('MCM.4.2',27),
 ('MCM.4.3',24),
 ('MCM.4.4',27),
 ('MCM.4.5',27),
 ('MCM.4.6',28),
 ('MCM.4.7',28),
 ('MCM.5.1',25),
 ('MCM.5.2',28),
 ('MCM.5.3',26),
 ('MCM.5.4',26),
 ('MCM.6.1',26),
 ('MCM.6.2',28),
 ('OD.1.1',73),
 ('OD.2.1',73),
 ('OD.3.1',74),
 ('OD.3.2',75),
 ('OD.3.3',76),
 ('OD.3.4',75),
 ('OD.3.5',76),
 ('OD.3.6',76),
 ('OD.4.1',74),
 ('OD.5.1',76),
 ('PDP.1.1',85),
 ('PDP.1.2',85),
 ('PDP.2.1',85),
 ('PDP.3.1',87),
 ('PDP.3.2',86),
 ('PDP.4.1',86),
 ('PDP.4.2',87),
 ('PDP.4.3',87),
 ('PDP.4.4',87),
 ('PDP.5.1',87),
 ('RMD.1.1',57),
 ('RMD.1.2',58),
 ('RMD.1.3',58),
 ('RMD.1.4',58),
 ('RMD.2.1',58),
 ('RMD.2.2',59),
 ('RMD.2.3',60),
 ('RMD.2.4',60),
 ('RMD.2.5',60),
 ('RMD.3.1',57),
 ('RMD.4.1',57),
 ('RMD.4.2',59),
 ('RMD.4.3',60),
 ('RMD.4.4',60),
 ('RMD.5.1',58),
 ('RMD.5.2',59),
 ('RMD.6.1',57),
 ('RMD.6.2',57);
alter table public.nudee_specifications enable row level security;
create policy office_spec_read on public.nudee_specifications for select to authenticated using ((select public.nudee_is_office()));

create table public.nudee_mapping_decisions(
 id bigint generated always as identity primary key,requirement_id bigint not null references public.nudee_requirements,
 codes text[] not null,reason text not null,actor uuid not null references auth.users,created_at timestamptz not null default now()
);
create index nudee_mapping_latest on public.nudee_mapping_decisions(requirement_id,id desc);
alter table public.nudee_mapping_decisions enable row level security;
create policy office_mapping_read on public.nudee_mapping_decisions for select to authenticated using ((select public.nudee_is_office()));

create view public.nudee_evidence_mapping with(security_invoker=true) as
select r.id as requirement_id,r.evidence_name,r.standard_code,r.domain_name,r.maturity_level,
 coalesce(d.codes,array(select distinct s.code from public.nudee_specifications s
 where s.code = any(regexp_split_to_array(coalesce(r.specification_code,''),'[^A-Za-z0-9.]+')) order by s.code)) as codes,
 case when d.id is not null then case when cardinality(d.codes)=0 then 'maturity' else 'linked' end
 when r.specification_code is null or btrim(r.specification_code)='' then 'unresolved'
 when exists(select from public.nudee_specifications s where s.code=any(regexp_split_to_array(r.specification_code,'[^A-Za-z0-9.]+'))) then 'source' else 'unresolved' end as mapping_state,
 d.id as decision_id,a.status,s.id as approved_version
from public.nudee_requirements r left join lateral(select * from public.nudee_mapping_decisions x where x.requirement_id=r.id order by x.id desc limit 1) d on true
left join public.nudee_assignments a on a.requirement_id=r.id
left join lateral(select f.id from public.nudee_submissions f join public.nudee_audit au on au.submission_id=f.id and au.action='approved'
 where f.assignment_id=a.id and a.status='approved' order by f.id desc limit 1) s on true
where (select public.nudee_is_office());

create function public.nudee_export_manifest(p_domain text)
returns table(requirement_id bigint, standard_code text,specification_code text,maturity_level text,evidence_name text,
status text,submission_id bigint,storage_path text,file_name text,source_locator text,
reviewer_name text,reviewed_at timestamptz,question_state text,target_level text,reference_page integer,effective_codes text[],mapping_state text)
language sql stable security invoker set search_path='' as $$
 select m.*,a.reviewer_name,a.created_at,q.question_state,q.target_level,r.acceptance_pdf_page::integer-1,em.codes,em.mapping_state
 from public.nudee_preparation_manifest(p_domain) m
 join public.nudee_requirements r on r.id=m.requirement_id
 join public.nudee_evidence_mapping em on em.requirement_id=m.requirement_id
 left join lateral (select au.reviewer_name,au.created_at from public.nudee_audit au
   where au.submission_id=m.submission_id and au.action='approved' order by au.id desc limit 1) a on true
 left join public.nudee_question_overview() q on q.domain_name=p_domain and q.standard_code=m.standard_code
 where (select public.nudee_is_office()) order by r.source_row
$$;

create table public.nudee_cycles(id bigint generated always as identity primary key,title text not null unique,methodology text not null,
 created_by uuid not null references auth.users,created_at timestamptz not null default now());
create table public.nudee_cycle_events(
 id bigint generated always as identity primary key,cycle_id bigint not null references public.nudee_cycles,kind text not null check(kind in ('spec','result','snapshot')),
 subject text not null, outcome text not null,reference text not null,payload jsonb not null,actor uuid not null references auth.users,created_at timestamptz not null default now()
);
create index nudee_cycle_event_lookup on public.nudee_cycle_events(cycle_id,kind,subject,id desc);
create table public.nudee_improvements(
 id bigint generated always as identity primary key,cycle_id bigint not null references public.nudee_cycles,
 requirement_id bigint not null references public.nudee_requirements,description text not null,owner_id uuid not null references auth.users,
 due_date date not null,created_by uuid not null references auth.users,created_at timestamptz not null default now(),
 closure_ref bigint references public.nudee_submissions,closed_at timestamptz,closed_by uuid references auth.users,decision_ref text
);
alter table public.nudee_cycles enable row level security;
alter table public.nudee_cycle_events enable row level security;
alter table public.nudee_improvements enable row level security;
create policy office_cycles on public.nudee_cycles for select to authenticated using ((select public.nudee_is_office()));
create policy office_events on public.nudee_cycle_events for select to authenticated using ((select public.nudee_is_office()));
create policy office_or_owner_actions on public.nudee_improvements for select to authenticated
 using ((select public.nudee_is_office()) or (owner_id=(select auth.uid()) and exists(select from public.profiles p where p.user_id=(select auth.uid()) and p.is_active and p.role='nudee_owner')));
revoke all on public.nudee_specifications,public.nudee_mapping_decisions,public.nudee_evidence_mapping,public.nudee_cycles,public.nudee_cycle_events,public.nudee_improvements from public,anon,authenticated;
grant select on public.nudee_specifications,public.nudee_mapping_decisions,public.nudee_evidence_mapping,public.nudee_cycles,public.nudee_cycle_events,public.nudee_improvements to authenticated;

create function private.nudee_office_record(p_action text,p_data jsonb) returns bigint language plpgsql security definer set search_path='' as $$
<<office_event>>
declare
 uid uuid:=auth.uid(); cycle bigint:=(p_data->>'cycle')::bigint; req bigint:=(p_data->>'requirement')::bigint;
 subject text:=btrim(p_data->>'subject'); outcome text:=btrim(p_data->>'outcome'); ref text:=btrim(p_data->>'reference');
 owner_id uuid:=(p_data->>'owner')::uuid; expected bigint:=(p_data->>'previous')::bigint; previous bigint; result bigint;
 selected_codes text[]; evidence jsonb; action_row public.nudee_improvements; version_id bigint;
begin
 if uid is null or not public.nudee_is_office() then raise exception 'Office role required' using errcode='42501';end if;
 if nullif(ref,'') is null or length(ref)>1600 then raise exception 'Reference or rationale required'; end if;
 if p_action='cycle' then
  if nullif(subject,'') is null or length(subject)>160 then raise exception 'Cycle name required';end if;
  insert into public.nudee_cycles(title,methodology,created_by) values(subject,ref,uid) returning id into result;
  return result;
 elsif p_action='mapping' then
  perform 1 from public.nudee_requirements where id=req for update;
  if not found or jsonb_typeof(p_data->'codes') is distinct from 'array' then raise exception 'Invalid evidence mapping';end if;
  select id into previous from public.nudee_mapping_decisions where requirement_id=req order by id desc limit 1;
  if previous is distinct from expected then raise exception 'Decision changed' using errcode='40001';end if;
  selected_codes:=array(select distinct jsonb_array_elements_text(p_data->'codes') order by 1);
  if exists(select from unnest(selected_codes) x where not exists(select from public.nudee_specifications where code=x)) then raise exception 'Unknown specification';end if;
  insert into public.nudee_mapping_decisions(requirement_id,codes,reason,actor) values(req,selected_codes,ref,uid) returning id into result;
  return result;
 end if;
 perform 1 from public.nudee_cycles where id=cycle for update;
 if not found then raise exception 'Unknown cycle';end if;
 if p_action='improve' then
  if not exists(select from public.profiles p where p.user_id=owner_id and p.is_active and p.role='nudee_owner')
   or (p_data->>'due')::date is null then raise exception 'Active owner and due date required';end if;
  insert into public.nudee_improvements(cycle_id,requirement_id,description,owner_id,due_date,created_by)
  values(cycle,req,ref,owner_id,(p_data->>'due')::date,uid) returning id into result;return result;
 elsif p_action='close' then
  select * into strict action_row from public.nudee_improvements where id=(p_data->>'action_id')::bigint and cycle_id=cycle and closed_at is null for update;
  select approved_version into version_id from public.nudee_evidence_mapping where requirement_id=action_row.requirement_id;
  if version_id is null then raise exception 'Reviewed closure evidence required';end if;
  update public.nudee_improvements set closed_at=now(),closed_by=uid,closure_ref=version_id,decision_ref=ref where id=action_row.id;
  return action_row.id;
 elsif p_action='spec' then
  if not exists(select from public.nudee_specifications where code=subject) or outcome is null or outcome not in ('full','partial','non','na','unassessed') then raise exception 'Unknown specification or state';end if;
  select coalesce(jsonb_agg(jsonb_build_array(requirement_id,approved_version) order by requirement_id),'[]') into evidence from public.nudee_evidence_mapping where subject=any(codes);
  if outcome='full' and (evidence='[]'::jsonb or exists(select from jsonb_array_elements(evidence) x where x->1='null'::jsonb)) then raise exception 'Missing versioned evidence for specification';end if;
  if outcome='partial' and not exists(select from jsonb_array_elements(evidence) x where x->1<>'null'::jsonb) then raise exception 'Partial assessment requires reviewed evidence';end if;
 elsif p_action='result' then
  if subject is null or subject not in ('maturity','compliance','operational') or nullif(outcome,'') is null or length(outcome)>100 then raise exception 'Invalid result';end if;
  if (p_data->>'date')::date is null or (p_data->>'date')::date>(now() at time zone 'Asia/Riyadh')::date then raise exception 'Invalid issuance date';end if;
  evidence:=jsonb_build_object('issued_on',p_data->>'date');
 elsif p_action='snapshot' then
  subject:='cycle';outcome:='saved';
  select jsonb_build_object('cycle',(select to_jsonb(c) from public.nudee_cycles c where c.id=cycle),
   'as_of',now(),'catalog',(select jsonb_agg(to_jsonb(m) order by requirement_id) from public.nudee_evidence_mapping m),
   'questions',(select jsonb_agg(to_jsonb(q)) from public.nudee_question_overview() q),
   'decisions',(select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from public.nudee_cycle_events e where cycle_id=cycle and kind<>'snapshot'),
   'actions',(select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]') from public.nudee_improvements i where cycle_id=cycle),
   'final_review',(select progress from public.nudee_final_review where id=1),
   'plan_stages',(select jsonb_agg(to_jsonb(t)) from (select r.maturity_level,count(*) as total,
    sum(case a.status when 'approved' then 1 when 'submitted' then greatest(coalesce(r.source_progress,0),0.5) when 'changes_requested' then 0 else coalesce(r.source_progress,0) end) as progress_sum
    from public.nudee_requirements r left join public.nudee_assignments a on a.requirement_id=r.id where r.source_row between 2 and 365 group by r.maturity_level) t)) into evidence;
 else raise exception 'Unknown action';end if;
 if p_action in ('spec','result') then
  select id into previous from public.nudee_cycle_events where cycle_id=cycle and kind=p_action and nudee_cycle_events.subject=office_event.subject order by id desc limit 1;
  if previous is distinct from expected then raise exception 'Decision changed' using errcode='40001';end if;
 end if;
 insert into public.nudee_cycle_events(cycle_id,kind,subject,outcome,reference,payload,actor) values(cycle,p_action,subject,outcome,ref,evidence,uid) returning id into result;
 return result;
end $$;
create function public.nudee_office_record(p_action text,p_data jsonb) returns bigint language sql security invoker set search_path='' as $$
 select private.nudee_office_record(p_action,p_data);
$$;
revoke all on function private.nudee_office_record(text,jsonb), public.nudee_office_record(text,jsonb), public.nudee_export_manifest(text) from public,anon,authenticated;
grant execute on function private.nudee_office_record(text,jsonb), public.nudee_office_record(text,jsonb), public.nudee_export_manifest(text) to authenticated;
notify pgrst,'reload schema';
