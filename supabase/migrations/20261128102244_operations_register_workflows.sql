-- No existing records are updated or reclassified. Old registrations retain the legacy method
-- until a documented, new inherent assessment is recorded.
set local lock_timeout = '5s';

alter table public.assets
  alter column asset_code set default ('AST-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  alter column data_classification drop not null,
  alter column data_classification drop default,
  alter column criticality drop not null,
  alter column criticality drop default,
  add column business_service text,
  add column technical_identifier text,
  add column make_model text,
  add column dependencies text,
  add column regulatory_scope text;

alter table public.cyber_risks
  alter column risk_code set default ('RISK-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  alter column risk_cause drop not null,
  alter column threat drop not null,
  alter column risk_analysis drop not null,
  alter column assessment_date drop not null,
  alter column assessment_date drop default,
  alter column last_assessment_date drop not null,
  alter column last_assessment_date drop default,
  alter column inherent_likelihood drop not null,
  alter column inherent_impact drop not null,
  alter column treatment_type drop not null,
  alter column treatment_description drop not null,
  alter column treatment_owner drop not null,
  alter column residual_risk_description drop not null,
  alter column residual_likelihood drop not null,
  alter column residual_impact drop not null,
  alter column next_steps drop not null,
  add column risk_title text check (risk_title is null or length(btrim(risk_title)) between 2 and 200),
  add column risk_method text not null default 'legacy_nca_workbook' check (risk_method in ('legacy_nca_workbook','nfcrm_1_2025')),
  add column treatment_result text,
  add column decision_reference text,
  add column decision_reason text,
  add column decision_review_date date;

alter table public.vulnerabilities
  alter column vulnerability_code set default ('VUL-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  alter column threat_severity drop not null,
  alter column threat_severity drop default,
  alter column likelihood drop not null,
  alter column likelihood drop default,
  alter column risk_severity drop not null,
  alter column risk_severity drop default,
  drop constraint vulnerabilities_status_check,
  add constraint vulnerabilities_status_check check (status in ('open','in_progress','on_hold','awaiting_verification','resolved','exception')),
  add column discovery_source text check (discovery_source is null or discovery_source in ('scan','pentest','report','review','other')),
  add column remediation_priority text check (remediation_priority is null or remediation_priority in ('urgent','high','medium','low')),
  add column priority_reason text,
  add column remediation_summary text,
  add column verification_method text check (verification_method is null or verification_method in ('retest','rescan','approved_alternative')),
  add column verification_reference text,
  add column verification_notes text,
  add column verified_at timestamptz,
  add column verified_by uuid references auth.users(id) on delete set null,
  add column exception_reference text,
  add column exception_reason text,
  add column exception_expiry_date date,
  add column hold_until date,
  add column hold_reason text;

create function private.guard_ops_register_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  today date := (current_timestamp at time zone 'Asia/Riyadh')::date;
  actor uuid := auth.uid();
  new_state text;
  old_state text;
begin
  if tg_op = 'UPDATE' then
    new.updated_at := clock_timestamp();
  end if;
  if tg_table_name = 'assets' then return new; end if;

  if tg_table_name = 'cyber_risks' then
    if tg_op = 'UPDATE' then old_state := old.risk_status; end if;
    new_state := new.risk_status;
    if new.risk_method = 'nfcrm_1_2025' and (
      (new.inherent_likelihood is null) <> (new.inherent_impact is null)
      or (new.residual_likelihood is null) <> (new.residual_impact is null)
      or (new.inherent_likelihood is not null and (
        nullif(btrim(new.risk_cause),'') is null or nullif(btrim(new.threat),'') is null
        or nullif(btrim(new.risk_analysis),'') is null or new.assessment_date is null or new.last_assessment_date is null
      ))
      or (new.residual_likelihood is not null and (
        new.inherent_likelihood is null or nullif(btrim(new.residual_risk_description),'') is null
        or nullif(btrim(new.treatment_description),'') is null or nullif(btrim(new.treatment_result),'') is null or new.last_assessment_date is null
      ))
    ) then raise exception 'risk_assessment' using errcode='23514'; end if;

    if tg_op = 'INSERT' and new_state <> 'open' then raise exception 'status_transition' using errcode='23514'; end if;
    if new_state is distinct from old_state then
      if old_state in ('accepted','closed') and nullif(btrim(new.decision_reason),'') is null then raise exception 'risk_closure' using errcode='23514'; end if;
      if old_state in ('accepted','closed') and new_state <> 'open' then raise exception 'status_transition' using errcode='23514'; end if;
      if new_state in ('treatment_in_progress','closed') and (
        new.inherent_likelihood is null or new.treatment_type is null or nullif(btrim(new.treatment_description),'') is null
        or nullif(btrim(new.treatment_owner),'') is null or new.action_due_date is null
      ) then raise exception 'risk_closure' using errcode='23514'; end if;
      if new_state = 'accepted' and (
        actor is null or coalesce(private.current_user_role(),'') <> 'admin'
        or new.risk_method is distinct from 'nfcrm_1_2025' or new.treatment_type is distinct from 'accept' or new.residual_likelihood is null
        or nullif(btrim(new.decision_reference),'') is null or nullif(btrim(new.decision_reason),'') is null
        or new.decision_review_date is null or new.decision_review_date <= today
      ) then raise exception 'risk_approval' using errcode='23514'; end if;
      if new_state = 'closed' and (
        old_state is distinct from 'treatment_in_progress'
        or new.risk_method is distinct from 'nfcrm_1_2025' or new.residual_likelihood is null or nullif(btrim(new.decision_reason),'') is null
      ) then raise exception 'risk_closure' using errcode='23514'; end if;
      if new_state = 'closed' then new.closed_at := clock_timestamp(); new.closed_by := actor;
      elsif old_state = 'closed' then new.closed_at := null; new.closed_by := null;
      end if;
    elsif old_state in ('closed','accepted') then
      if row(new.decision_reference,new.decision_reason,new.decision_review_date,new.closed_at,new.closed_by,
             new.inherent_likelihood,new.inherent_impact,new.residual_likelihood,new.residual_impact,new.risk_method)
         is distinct from row(old.decision_reference,old.decision_reason,old.decision_review_date,old.closed_at,old.closed_by,
             old.inherent_likelihood,old.inherent_impact,old.residual_likelihood,old.residual_impact,old.risk_method)
      then raise exception 'status_transition' using errcode='23514'; end if;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then old_state := old.status; end if;
  new_state := new.status;
  if tg_op = 'INSERT' and new_state <> 'open' then raise exception 'status_transition' using errcode='23514'; end if;
  if new.discovery_source is not null and new.asset_id is null and nullif(btrim(new.affected_assets),'') is null
  then raise exception 'vuln_scope' using errcode='23514'; end if;
  if new.discovery_source is not null and (new.first_observed_date > today or (new.likelihood is null) <> (new.risk_severity is null))
  then raise exception 'vuln_assessment' using errcode='23514'; end if;
  if new.remediation_priority is not null and nullif(btrim(new.priority_reason),'') is null
  then raise exception 'vuln_priority' using errcode='23514'; end if;
  if new_state is distinct from old_state then
    if old_state in ('resolved','exception') and new_state <> 'open' then raise exception 'status_transition' using errcode='23514'; end if;
    if new_state in ('in_progress','awaiting_verification') and (nullif(btrim(new.owner_name),'') is null or new.due_date is null)
    then raise exception 'vuln_assignment' using errcode='23514'; end if;
    if new_state = 'on_hold' and (nullif(btrim(new.hold_reason),'') is null or new.hold_until is null or new.hold_until <= today)
    then raise exception 'vuln_hold' using errcode='23514'; end if;
    if new_state = 'awaiting_verification' and (old_state is distinct from 'in_progress' or nullif(btrim(new.remediation_summary),'') is null)
    then raise exception 'vuln_verification' using errcode='23514'; end if;
    if new_state not in ('resolved','exception') then
      new.resolved_date := null; new.verified_at := null; new.verified_by := null;
      new.verification_method := null; new.verification_reference := null; new.verification_notes := null;
    end if;
    if new_state = 'resolved' then
      if new.first_observed_date > today or old_state is distinct from 'awaiting_verification' or actor is null or new.verification_method is null
         or nullif(btrim(new.verification_reference),'') is null or nullif(btrim(new.verification_notes),'') is null
      then raise exception 'vuln_verification' using errcode='23514'; end if;
      new.verified_by := actor; new.verified_at := clock_timestamp(); new.resolved_date := today;
    elsif new_state = 'exception' then
      if actor is null or coalesce(private.current_user_role(),'') <> 'admin'
         or nullif(btrim(new.exception_reference),'') is null or nullif(btrim(new.exception_reason),'') is null
         or new.exception_expiry_date is null or new.exception_expiry_date <= today
      then raise exception 'vuln_exception' using errcode='23514'; end if;
    end if;
  elsif old_state not in ('resolved','exception') then
    if row(new.verified_by,new.verified_at,new.verification_method,new.verification_reference,new.verification_notes,new.resolved_date)
       is distinct from row(old.verified_by,old.verified_at,old.verification_method,old.verification_reference,old.verification_notes,old.resolved_date)
    then raise exception 'vuln_verification' using errcode='23514'; end if;
  elsif old_state in ('resolved','exception') then
    if row(new.verified_by,new.verified_at,new.verification_method,new.verification_reference,new.verification_notes,
           new.resolved_date,new.exception_reference,new.exception_reason,new.exception_expiry_date)
       is distinct from row(old.verified_by,old.verified_at,old.verification_method,old.verification_reference,old.verification_notes,
           old.resolved_date,old.exception_reference,old.exception_reason,old.exception_expiry_date)
    then raise exception 'status_transition' using errcode='23514'; end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_ops_register_write() from public, anon, authenticated;
create trigger ops_register_asset_guard before insert or update on public.assets for each row execute function private.guard_ops_register_write();
create trigger ops_register_risk_guard before insert or update on public.cyber_risks for each row execute function private.guard_ops_register_write();
create trigger ops_register_vulnerability_guard before insert or update on public.vulnerabilities for each row execute function private.guard_ops_register_write();

-- Keep the proof and disposition when a record is reopened. Only the team can read this journal.
create table public.vulnerability_register_events (
  id bigint generated always as identity primary key,
  vulnerability_id bigint not null references public.vulnerabilities(id) on delete cascade,
  previous_status text,
  new_status text not null,
  actor_id uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default clock_timestamp(),
  decision_details jsonb not null
);
create index vulnerability_register_events_record_idx on public.vulnerability_register_events(vulnerability_id,id desc);
alter table public.vulnerability_register_events enable row level security;
revoke all on public.vulnerability_register_events from anon, authenticated;
grant select on public.vulnerability_register_events to authenticated;
create policy vulnerability_register_events_team on public.vulnerability_register_events
  for select to authenticated using ((select private.current_user_role()) in ('admin','cybersecurity_team'));

create function private.audit_vulnerability_register_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'UPDATE' or new.status is distinct from old.status then
    insert into public.vulnerability_register_events(vulnerability_id,previous_status,new_status,actor_id,decision_details)
    values(new.id,case when tg_op='UPDATE' then old.status end,new.status,auth.uid(), jsonb_strip_nulls(jsonb_build_object(
      'verification_reference',case when new.status='resolved' then new.verification_reference end,
      'verification_notes',case when new.status='resolved' then new.verification_notes end,
      'verification_method',case when new.status='resolved' then new.verification_method end,
      'exception_reference',case when new.status='exception' then new.exception_reference end,
      'exception_reason',case when new.status='exception' then new.exception_reason end,
      'exception_expiry_date',case when new.status='exception' then new.exception_expiry_date end,
      'hold_reason',case when new.status='on_hold' then new.hold_reason end,
      'hold_until',case when new.status='on_hold' then new.hold_until end,
      'remediation_summary',case when new.status='awaiting_verification' then new.remediation_summary end
    )));
  end if;
  return new;
end;
$$;
revoke all on function private.audit_vulnerability_register_status() from public, anon, authenticated;
create trigger ops_register_vulnerability_audit after insert or update on public.vulnerabilities for each row execute function private.audit_vulnerability_register_status();
