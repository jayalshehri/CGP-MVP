-- Additive TPRA rollout. Existing services and decisions are not rewritten.
set local lock_timeout = '5s';

alter table public.third_parties
  add column business_unit text check (length(business_unit) <= 200),
  add column business_purpose text check (length(business_purpose) <= 1000),
  add column service_criticality text check (service_criticality in ('low','medium','high','critical')),
  add column external_contact text check (length(external_contact) <= 300),
  add column contract_number text check (length(contract_number) <= 200),
  add column contract_signed_on date,
  add column contract_document_ref text check (length(contract_document_ref) <= 300),
  add constraint tpra_contract_date_and_ref check (contract_signed_on is null or (
    length(btrim(coalesce(contract_number,''))) > 0 and length(btrim(coalesce(contract_document_ref,''))) > 0
    and contract_signed_on <= (statement_timestamp() at time zone 'Asia/Riyadh')::date));

alter table public.third_party_service_assessments
  drop constraint third_party_service_assessments_rule_version_check,
  alter column rule_version set default 'cgp_tprm_v2',
  add constraint third_party_service_assessments_rule_version_check check (rule_version in ('cgp_tprm_v1','cgp_tprm_v2')),
  add column review_trigger text check (review_trigger in ('initial','renewal','regulatory_change','scope_change','periodic')),
  add column trigger_reference text check (length(trigger_reference) <= 300);

create table public.third_party_assessment_evidence (
  id bigint generated always as identity primary key,
  assessment_id bigint not null references public.third_party_service_assessments(id) on delete restrict,
  check_key text not null check (check_key in ('contract_requirements','confidentiality','secure_deletion','incident_response',
    'policy','risk_controls','local_soc','vetting','national_provider','cloud_requirements','cloud_data','cloud_isolation','cloud_review','sensitive_hosting','residual')),
  document_title text not null check (length(btrim(document_title)) between 1 and 200),
  document_ref text not null check (length(btrim(document_ref)) between 1 and 300),
  verification_context jsonb not null default '{}',
  state text not null default 'pending' check (state in ('pending','accepted','rejected')),
  review_note text check (length(btrim(review_note)) between 1 and 1000),
  created_by uuid not null default auth.uid() references auth.users(id),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.third_party_assessment_actions (
  id bigint generated always as identity primary key,
  assessment_id bigint not null references public.third_party_service_assessments(id) on delete restrict,
  description text not null check (length(btrim(description)) between 1 and 1000),
  owner text not null check (length(btrim(owner)) between 1 and 200),
  due_on date not null,
  state text not null default 'open' check (state in ('open','to_verify','closed')),
  closure_ref text check (length(btrim(closure_ref)) between 1 and 300),
  review_note text check (length(btrim(review_note)) between 1 and 1000),
  created_by uuid not null default auth.uid() references auth.users(id),
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tpra_evidence_assessment_idx on public.third_party_assessment_evidence(assessment_id, check_key, id desc);
create index tpra_actions_assessment_idx on public.third_party_assessment_actions(assessment_id, state, due_on);
create index tpra_evidence_created_by_idx on public.third_party_assessment_evidence(created_by);
create index tpra_evidence_verified_by_idx on public.third_party_assessment_evidence(verified_by);
create index tpra_actions_created_by_idx on public.third_party_assessment_actions(created_by);
create index tpra_actions_completed_by_idx on public.third_party_assessment_actions(completed_by);
create index tpra_actions_verified_by_idx on public.third_party_assessment_actions(verified_by);

do $$
declare tab text;
begin
  foreach tab in array array['third_party_assessment_evidence','third_party_assessment_actions'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from public, anon, authenticated',tab);
    execute format('grant select, insert, update on public.%I to authenticated',tab);
    execute format('create policy tpra_select on public.%I for select to authenticated using (
      (select private.current_user_role()) in (''admin'',''cybersecurity_team''))',tab);
    execute format('create policy tpra_insert on public.%I for insert to authenticated with check (
      (select private.current_user_role()) in (''admin'',''cybersecurity_team'') and created_by=(select auth.uid()))',tab);
    execute format('create policy tpra_update on public.%I for update to authenticated using (
      (select private.current_user_role()) in (''admin'',''cybersecurity_team'')) with check (
      (select private.current_user_role()) in (''admin'',''cybersecurity_team''))',tab);
  end loop;
end $$;

create function private.tpra_required_keys(scope jsonb) returns text[]
language sql immutable security invoker set search_path = '' as $$
  select array['contract_requirements'] ||
    case when scope->>'kind' in ('outsourcing','managed') or scope->>'access'<>'none'
      or scope->'data'='true'::jsonb or scope->'service_impact'='true'::jsonb
      or scope->'sensitive'='true'::jsonb or scope->'cloud'='true'::jsonb
    then array['confidentiality','secure_deletion','incident_response','policy'] else array[]::text[] end ||
    case when scope->>'kind' in ('outsourcing','managed') then array['risk_controls'] else array[]::text[] end ||
    case when scope->'remote_soc'='true'::jsonb then array['local_soc'] else array[]::text[] end ||
    case when scope->'sensitive'='true'::jsonb and scope->>'kind' in ('outsourcing','managed')
    then array['vetting','national_provider'] else array[]::text[] end ||
    case when scope->'cloud'='true'::jsonb
    then array['cloud_requirements','cloud_data','cloud_isolation','cloud_review'] else array[]::text[] end ||
    case when scope->'cloud'='true'::jsonb and scope->'sensitive'='true'::jsonb then array['sensitive_hosting'] else array[]::text[] end;
$$;
revoke all on function private.tpra_required_keys(jsonb) from public, anon, authenticated;
grant execute on function private.tpra_required_keys(jsonb) to authenticated;

create function private.tpra_context(a public.third_party_service_assessments, p public.third_parties, evidence_key text) returns jsonb
language sql immutable security invoker set search_path = '' as $$
  select jsonb_build_object('scope',a.scope,'contract',p.contract_number,'reference',p.contract_reference,
    'contract_document',p.contract_document_ref,'trigger',a.review_trigger,'trigger_reference',a.trigger_reference)
  || case when evidence_key in ('risk_controls','residual') then jsonb_build_object(
       'risk', a.scenario, 'inherent_likelihood',a.inherent_likelihood,'inherent_impact',a.inherent_impact,
       'inherent_reason',a.inherent_reason,'expected_likelihood',a.expected_likelihood,'expected_impact',a.expected_impact,
       'expected_reason',a.expected_reason,
       'residual_likelihood',a.verified_likelihood,'residual_impact',a.verified_impact,'residual_reason',a.verified_reason,
       'residual_reference',a.verified_reference) else '{}'::jsonb end;
$$;
revoke all on function private.tpra_context(public.third_party_service_assessments,public.third_parties,text) from public, anon, authenticated;
grant execute on function private.tpra_context(public.third_party_service_assessments,public.third_parties,text) to authenticated;

create function private.guard_tpra_evidence() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  a public.third_party_service_assessments%rowtype;
  p public.third_parties%rowtype;
  current_context jsonb;
begin
  select * into a from public.third_party_service_assessments where id=new.assessment_id for update;
  if actor is null or not found or a.state='decided' or a.rule_version<>'cgp_tprm_v2' then
    raise exception 'tpra_evidence_locked' using errcode='23514';
  end if;
  select * into p from public.third_parties where id=a.service_id for update;
  if (new.check_key=any(private.tpra_required_keys(a.scope)) or
      (new.check_key='residual' and a.verified_likelihood is not null and btrim(new.document_ref)=btrim(a.verified_reference))) is not true then
    raise exception 'tpra_evidence_scope' using errcode='23514';
  end if;
  current_context := private.tpra_context(a,p,new.check_key);
  if tg_op='INSERT' then
    if a.state<>'draft' or new.state<>'pending' then raise exception 'tpra_evidence_stage' using errcode='23514'; end if;
    if exists (select 1 from public.third_party_assessment_evidence e where e.assessment_id=a.id
      and e.check_key=new.check_key and e.verification_context=current_context and e.state in ('pending','accepted'))
    then raise exception 'tpra_evidence_exists' using errcode='23514'; end if;
    new.verification_context:=current_context;
    new.created_at:=clock_timestamp(); new.created_by:=actor;
    new.review_note:=null; new.verified_at:=null; new.verified_by:=null;
  else
    if old.state<>'pending' or new.state not in ('accepted','rejected')
      or (to_jsonb(new)-array['state','review_note','updated_at']) is distinct from (to_jsonb(old)-array['state','review_note','updated_at'])
    then raise exception 'tpra_evidence_locked' using errcode='23514'; end if;
    if actor=old.created_by then raise exception 'tpra_independent_evidence' using errcode='42501'; end if;
    if current_context is distinct from old.verification_context then raise exception 'tpra_evidence_scope' using errcode='23514'; end if;
    if length(btrim(coalesce(new.review_note,'')))=0 then raise exception 'tpra_review_note' using errcode='23514'; end if;
    new.verified_by:=actor; new.verified_at:=clock_timestamp();
  end if;
  new.updated_at:=clock_timestamp();
  return new;
end $$;

create function private.guard_tpra_action() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_role text := private.current_user_role();
  a public.third_party_service_assessments%rowtype;
begin
  select * into a from public.third_party_service_assessments where id=new.assessment_id for update;
  if actor is null or not found or a.rule_version<>'cgp_tprm_v2' then raise exception 'tpra_action_stage' using errcode='23514'; end if;
  if tg_op='INSERT' then
    if a.state<>'draft' or new.state<>'open' or new.due_on < (statement_timestamp() at time zone 'Asia/Riyadh')::date
    then raise exception 'tpra_action_stage' using errcode='23514'; end if;
    new.created_at:=clock_timestamp(); new.created_by:=actor;
    new.closure_ref:=null; new.review_note:=null;
    new.completed_by:=null; new.completed_at:=null; new.verified_by:=null; new.verified_at:=null;
  else
    if (to_jsonb(new)-array['state','closure_ref','review_note','updated_at'])
      is distinct from (to_jsonb(old)-array['state','closure_ref','review_note','updated_at'])
    then raise exception 'tpra_action_stage' using errcode='23514'; end if;
    if old.state='open' and new.state='to_verify' and a.state<>'submitted' and length(btrim(coalesce(new.closure_ref,'')))>0 then
      new.completed_by:=actor; new.completed_at:=clock_timestamp(); new.review_note:=null;
      new.verified_by:=null; new.verified_at:=null;
    elsif old.state='to_verify' and new.state in ('open','closed') then
      if actor=old.completed_by or actor_role<>'admin' then raise exception 'tpra_independent_action' using errcode='42501'; end if;
      if new.closure_ref is distinct from old.closure_ref or length(btrim(coalesce(new.review_note,'')))=0
      then raise exception 'tpra_review_note' using errcode='23514'; end if;
      new.verified_by:=actor; new.verified_at:=clock_timestamp();
    else raise exception 'tpra_action_stage' using errcode='23514'; end if;
  end if;
  new.updated_at:=clock_timestamp();
  return new;
end $$;

revoke all on function private.guard_tpra_evidence() from public, anon, authenticated;
revoke all on function private.guard_tpra_action() from public, anon, authenticated;
create trigger tpra_evidence_guard before insert or update on public.third_party_assessment_evidence
  for each row execute function private.guard_tpra_evidence();
create trigger tpra_action_guard before insert or update on public.third_party_assessment_actions
  for each row execute function private.guard_tpra_action();

create or replace function private.guard_third_party_assessment() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_role text := private.current_user_role();
  today date := (statement_timestamp() at time zone 'Asia/Riyadh')::date;
  p public.third_parties%rowtype;
  key text;
  action public.third_party_assessment_actions%rowtype;
begin
  if actor is null or coalesce(actor_role,'') not in ('admin','cybersecurity_team') then
    raise exception 'tprm_role' using errcode='42501';
  end if;
  if tg_op='INSERT' and new.state <> 'draft' then raise exception 'tprm_transition' using errcode='23514'; end if;
  if tg_op='UPDATE' then
    if old.state='decided' or row(new.id,new.service_id,new.method,new.created_by,new.created_at)
      is distinct from row(old.id,old.service_id,old.method,old.created_by,old.created_at)
    then raise exception 'tprm_immutable' using errcode='23514'; end if;
    if new.rule_version is distinct from old.rule_version
      and not (old.rule_version='cgp_tprm_v1' and new.rule_version='cgp_tprm_v2' and old.state='draft' and new.state='draft')
    then raise exception 'tprm_immutable' using errcode='23514'; end if;
    if old.state='submitted' and (
      new.state not in ('draft','decided') or actor_role <> 'admin' or actor in (old.submitted_by,old.created_by)
    ) then raise exception 'tprm_independent' using errcode='42501'; end if;
    if old.state='draft' and new.state='decided' then raise exception 'tprm_transition' using errcode='23514'; end if;
    if old.state='submitted' and (
      to_jsonb(new)-array['state','decision','decision_authority','decision_reference','decision_reason','condition_plan',
        'condition_owner','condition_due','review_due','return_note','updated_at','inherent_score','expected_score','verified_score']
      is distinct from to_jsonb(old)-array['state','decision','decision_authority','decision_reference','decision_reason','condition_plan',
        'condition_owner','condition_due','review_due','return_note','updated_at','inherent_score','expected_score','verified_score']
    ) then raise exception 'tprm_submission_locked' using errcode='23514'; end if;
  end if;

  -- Serialize header changes against taking the submitted snapshot. The row lock is RLS-scoped.
  select * into p from public.third_parties where id=new.service_id for update;
  if not found or p.service_stage='ended' then raise exception 'tprm_service' using errcode='23514'; end if;
  if tg_op='INSERT' then
    new.rule_version := 'cgp_tprm_v2';
    new.created_by := actor; new.created_at := clock_timestamp();
    new.return_note := null; new.returned_by := null; new.returned_at := null;
  elsif old.state='submitted' and new.state='draft' then
    if nullif(btrim(new.return_note),'') is null then raise exception 'tprm_return' using errcode='23514'; end if;
    new.returned_by := actor; new.returned_at := clock_timestamp();
  else
    new.return_note := old.return_note; new.returned_by := old.returned_by; new.returned_at := old.returned_at;
  end if;

  if (new.inherent_likelihood is null) <> (new.inherent_impact is null)
     or (new.expected_likelihood is null) <> (new.expected_impact is null)
     or (new.verified_likelihood is null) <> (new.verified_impact is null)
     or (new.inherent_likelihood is not null and (nullif(btrim(new.scenario),'') is null or nullif(btrim(new.inherent_reason),'') is null))
     or (new.expected_likelihood is not null and (new.inherent_likelihood is null or nullif(btrim(new.expected_reason),'') is null))
     or (new.verified_likelihood is not null and (new.inherent_likelihood is null or nullif(btrim(new.verified_reference),'') is null or nullif(btrim(new.verified_reason),'') is null))
  then raise exception 'tprm_rating' using errcode='23514'; end if;

  if new.state in ('submitted','decided') then
    if p.service_stage is null or length(btrim(coalesce(p.relationship_owner,''))) < 2 or new.inherent_likelihood is null
       or coalesce(new.scope->>'kind','') not in ('standard','outsourcing','managed')
       or coalesce(new.scope->>'access','') not in ('none','standard','privileged')
    then raise exception 'tprm_scope' using errcode='23514'; end if;
    foreach key in array array['data','service_impact','sensitive','cloud','subcontractors','remote_soc'] loop
      if jsonb_typeof(new.scope->key) is distinct from 'boolean' then raise exception 'tprm_scope' using errcode='23514'; end if;
    end loop;
    if ((new.scope->>'remote_soc')::boolean and new.scope->>'kind' <> 'managed')
       or ((new.scope->>'subcontractors')::boolean and nullif(btrim(new.scope->>'subcontractor_details'),'') is null)
       or ((new.scope->>'sensitive')::boolean and nullif(btrim(new.scope->>'system_reference'),'') is null)
       or ((new.scope->>'cloud')::boolean and nullif(btrim(new.scope->>'hosting_location'),'') is null)
       or ((new.scope->>'data')::boolean and coalesce(new.scope->>'data_class','') not in ('public','restricted','secret','top_secret'))
    then raise exception 'tprm_scope' using errcode='23514'; end if;


  end if;

  if new.state='draft' then
    new.service_snapshot := null; new.submitted_at := null; new.submitted_by := null;
  elsif new.state='submitted' then
    new.service_snapshot := jsonb_build_object('name',p.name,'service',p.service,'owner',p.relationship_owner,
      'stage',p.service_stage,'contract_reference',p.contract_reference,'contract_number',p.contract_number,
      'contract_signed_on',p.contract_signed_on,'contract_document_ref',p.contract_document_ref,
      'business_unit',p.business_unit,'service_criticality',p.service_criticality,'business_purpose',p.business_purpose,
      'external_contact',p.external_contact);
    if new.rule_version<>'cgp_tprm_v2' or new.review_trigger is null
      or (new.review_trigger='regulatory_change' and nullif(btrim(new.trigger_reference),'') is null)
    then raise exception 'tpra_cycle' using errcode='23514'; end if;
    if new.review_trigger in ('initial','renewal') and new.scope->>'kind' in ('outsourcing','managed')
      and nullif(btrim(coalesce(p.contract_number,p.contract_reference,'') ),'') is null
    then raise exception 'tpra_contract_identity' using errcode='23514'; end if;
    new.submitted_at := clock_timestamp(); new.submitted_by := actor;
  end if;

  if new.state='decided' then
    if nullif(btrim(new.decision_authority),'') is null or nullif(btrim(new.decision_reference),'') is null
      or nullif(btrim(new.decision_reason),'') is null or new.decision is null
    then raise exception 'tprm_decision' using errcode='23514'; end if;
    if new.decision in ('approved','conditional') then
      if new.rule_version<>'cgp_tprm_v2' then raise exception 'tpra_cycle' using errcode='23514'; end if;
      -- A checked box cannot satisfy a control. The evidence must match the current scope and risk where relevant.
      foreach key in array (private.tpra_required_keys(new.scope)
        || case when new.verified_likelihood is not null then array['residual'] else array[]::text[] end) loop
        if not exists(select 1 from public.third_party_assessment_evidence e where e.assessment_id=new.id
          and e.check_key=key and e.state='accepted' and e.verification_context=private.tpra_context(new,p,key))
        then raise exception 'tprm_blocker' using errcode='23514'; end if;
      end loop;
      if new.decision='conditional' then
        select * into action from public.third_party_assessment_actions t
          where t.assessment_id=new.id and t.state<>'closed' order by t.due_on,t.id limit 1;
        if not found or exists(select 1 from public.third_party_assessment_actions t
          where t.assessment_id=new.id and t.state<>'closed' and (t.due_on<=today or t.due_on>new.review_due))
        then raise exception 'tpra_condition_action' using errcode='23514'; end if;
        new.condition_plan:=action.description; new.condition_owner:=action.owner; new.condition_due:=action.due_on;
      end if;
      if new.decision='approved' and exists(select 1 from public.third_party_assessment_actions t where t.assessment_id=new.id and t.state<>'closed')
      then raise exception 'tpra_actions_open' using errcode='23514'; end if;
      if new.review_due is null or new.review_due<=today then raise exception 'tprm_review_due' using errcode='23514'; end if;
      if new.decision='approved' and new.verified_likelihood is null then raise exception 'tprm_verification' using errcode='23514'; end if;
      if new.decision='conditional' and ((new.expected_likelihood is null and new.verified_likelihood is null)
        or nullif(btrim(new.condition_plan),'') is null or nullif(btrim(new.condition_owner),'') is null
        or new.condition_due is null or new.condition_due<=today or new.condition_due>new.review_due)
      then raise exception 'tprm_condition' using errcode='23514'; end if;
    else
      new.review_due := null;
    end if;
    if new.decision<>'conditional' then new.condition_plan := null; new.condition_owner := null; new.condition_due := null; end if;
    new.decided_by := actor; new.decided_at := clock_timestamp();
  else
    new.decision := null; new.decision_authority := null; new.decision_reference := null; new.decision_reason := null;
    new.condition_plan := null; new.condition_owner := null; new.condition_due := null; new.review_due := null;
    new.decided_by := null; new.decided_at := null;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
