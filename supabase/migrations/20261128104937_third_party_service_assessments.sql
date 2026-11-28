-- Third-party services use dated, versioned assessments. No legacy records are rewritten.
set local lock_timeout = '5s';

alter table public.third_parties
  add column service_code text unique,
  add column service_stage text check (service_stage in ('pre_contract','active','renewal','ended')),
  add column contract_reference text check (length(contract_reference) <= 300),
  alter column inherent_risk_score drop not null,
  alter column residual_risk_score drop not null,
  alter column likelihood drop not null,
  alter column impact drop not null,
  alter column control_effectiveness drop not null;

create table public.third_party_service_assessments (
  id bigint generated always as identity primary key,
  service_id bigint not null references public.third_parties(id) on delete restrict,
  state text not null default 'draft' check (state in ('draft','submitted','decided')),
  method text not null default 'nfcrm_1_2025' check (method = 'nfcrm_1_2025'),
  rule_version text not null default 'cgp_tprm_v1' check (rule_version = 'cgp_tprm_v1'),
  scope jsonb not null default '{}' check (jsonb_typeof(scope) = 'object' and octet_length(scope::text) <= 2500),
  checks jsonb not null default '{}' check (jsonb_typeof(checks) = 'object' and octet_length(checks::text) <= 24000),
  scenario text check (length(scenario) <= 3000),
  inherent_likelihood smallint check (inherent_likelihood between 1 and 5),
  inherent_impact smallint check (inherent_impact between 1 and 5),
  inherent_reason text check (length(inherent_reason) <= 3000),
  expected_likelihood smallint check (expected_likelihood between 1 and 5),
  expected_impact smallint check (expected_impact between 1 and 5),
  expected_reason text check (length(expected_reason) <= 3000),
  verified_likelihood smallint check (verified_likelihood between 1 and 5),
  verified_impact smallint check (verified_impact between 1 and 5),
  verified_reference text check (length(verified_reference) <= 300),
  verified_reason text check (length(verified_reason) <= 3000),
  inherent_score smallint generated always as (inherent_likelihood * inherent_impact) stored,
  expected_score smallint generated always as (expected_likelihood * expected_impact) stored,
  verified_score smallint generated always as (verified_likelihood * verified_impact) stored,
  service_snapshot jsonb,
  created_by uuid not null default auth.uid() references auth.users(id),
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision text check (decision in ('approved','conditional','rejected')),
  decision_authority text check (length(decision_authority) <= 200),
  decision_reference text check (length(decision_reference) <= 300),
  decision_reason text check (length(decision_reason) <= 3000),
  condition_plan text check (length(condition_plan) <= 3000),
  condition_owner text check (length(condition_owner) <= 200),
  condition_due date,
  review_due date,
  return_note text check (length(return_note) <= 3000),
  returned_by uuid references auth.users(id),
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index third_party_one_open_assessment on public.third_party_service_assessments(service_id) where state <> 'decided';
create index third_party_assessments_service_idx on public.third_party_service_assessments(service_id,id desc);
alter table public.third_party_service_assessments enable row level security;
revoke all on public.third_party_service_assessments from public, anon, authenticated;
grant select, insert, update on public.third_party_service_assessments to authenticated;
create policy third_party_assessments_read on public.third_party_service_assessments for select to authenticated
  using ((select private.current_user_role()) in ('admin','cybersecurity_team'));
create policy third_party_assessments_insert on public.third_party_service_assessments for insert to authenticated
  with check ((select private.current_user_role()) in ('admin','cybersecurity_team') and created_by=(select auth.uid()));
create policy third_party_assessments_update on public.third_party_service_assessments for update to authenticated
  using ((select private.current_user_role()) in ('admin','cybersecurity_team'))
  with check ((select private.current_user_role()) in ('admin','cybersecurity_team'));

create function private.guard_third_party_service_header() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='INSERT' then
    if new.service_stage is null or length(btrim(coalesce(new.relationship_owner,''))) not between 2 and 200
    then raise exception 'tprm_service' using errcode='23514'; end if;
    new.service_code := 'TPS-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
    new.inherent_risk_score := null; new.residual_risk_score := null;
    new.likelihood := null; new.impact := null; new.control_effectiveness := null;
    new.assessment_status := 'draft'; new.decision := 'pending';
    new.created_at := clock_timestamp();
  else
    -- Legacy assessment numbers and decisions are preserved, not edited through the header.
    if row(new.assessment_status,new.decision,new.inherent_risk_score,new.residual_risk_score,
        new.control_effectiveness,new.likelihood,new.impact,new.risk_scenario,new.risk_treatment,
        new.treatment_plan,new.next_review_date,new.created_by,new.created_at,new.service_code)
       is distinct from row(old.assessment_status,old.decision,old.inherent_risk_score,old.residual_risk_score,
        old.control_effectiveness,old.likelihood,old.impact,old.risk_scenario,old.risk_treatment,
        old.treatment_plan,old.next_review_date,old.created_by,old.created_at,old.service_code)
    then raise exception 'tprm_legacy_read_only' using errcode='23514'; end if;
    if new.service_stage is null or length(btrim(coalesce(new.relationship_owner,''))) not between 2 and 200
    then raise exception 'tprm_service' using errcode='23514'; end if;
    if exists(select 1 from public.third_party_service_assessments a where a.service_id=old.id and a.state='submitted')
       and to_jsonb(new)-'updated_at' is distinct from to_jsonb(old)-'updated_at'
    then raise exception 'tprm_submission_locked' using errcode='23514'; end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke all on function private.guard_third_party_service_header() from public, anon, authenticated;
create trigger tprm_service_header_guard before insert or update on public.third_parties
  for each row execute function private.guard_third_party_service_header();

create function private.guard_third_party_assessment() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_role text := private.current_user_role();
  today date := (statement_timestamp() at time zone 'Asia/Riyadh')::date;
  p public.third_parties%rowtype;
  key text;
  check_row jsonb;
  crosses_contract boolean;
  specialist boolean;
  needed text[] := array[]::text[];
begin
  if actor is null or coalesce(actor_role,'') not in ('admin','cybersecurity_team') then
    raise exception 'tprm_role' using errcode='42501';
  end if;
  if tg_op='INSERT' and new.state <> 'draft' then raise exception 'tprm_transition' using errcode='23514'; end if;
  if tg_op='UPDATE' then
    if old.state='decided' or row(new.id,new.service_id,new.method,new.rule_version,new.created_by,new.created_at)
      is distinct from row(old.id,old.service_id,old.method,old.rule_version,old.created_by,old.created_at)
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

    specialist := (new.scope->>'kind') in ('outsourcing','managed');
    crosses_contract := specialist or (new.scope->>'data')::boolean or (new.scope->>'service_impact')::boolean
      or new.scope->>'access'<>'none' or (new.scope->>'sensitive')::boolean or (new.scope->>'cloud')::boolean;
    if crosses_contract then needed := needed || array['confidentiality','secure_deletion','incident_response','policy']; end if;
    if specialist then needed := needed || array['risk_controls']; end if;
    if (new.scope->>'remote_soc')::boolean then needed := needed || array['local_soc']; end if;
    if (new.scope->>'sensitive')::boolean and specialist then needed := needed || array['vetting','national_provider']; end if;
    if (new.scope->>'cloud')::boolean then
      needed := needed || array['cloud_review'];
      if (new.scope->>'sensitive')::boolean then needed := needed || array['sensitive_hosting']; end if;
    end if;
  end if;

  if new.state='draft' then
    new.service_snapshot := null; new.submitted_at := null; new.submitted_by := null;
  elsif new.state='submitted' then
    new.service_snapshot := jsonb_build_object('name',p.name,'service',p.service,'owner',p.relationship_owner,
      'stage',p.service_stage,'contract_reference',p.contract_reference);
    new.submitted_at := clock_timestamp(); new.submitted_by := actor;
  end if;

  if new.state='decided' then
    if nullif(btrim(new.decision_authority),'') is null or nullif(btrim(new.decision_reference),'') is null
      or nullif(btrim(new.decision_reason),'') is null or new.decision is null
    then raise exception 'tprm_decision' using errcode='23514'; end if;
    if new.decision in ('approved','conditional') then
      foreach key in array needed loop
        check_row := new.checks->key;
        if (check_row->>'status') is distinct from 'met' or nullif(btrim(check_row->>'reference'),'') is null
        then raise exception 'tprm_blocker' using errcode='23514'; end if;
      end loop;
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
revoke all on function private.guard_third_party_assessment() from public, anon, authenticated;
create trigger tprm_assessment_guard before insert or update on public.third_party_service_assessments
  for each row execute function private.guard_third_party_assessment();
