-- P2-B4: additive shared Findings and Corrective Actions.
-- The legacy assessment_findings table and assessment_items remediation fields
-- remain untouched; no historic assessment row is transformed or reinterpreted.
begin;
set local lock_timeout = '10s';

create table public.grc_findings (
  id bigint generated always as identity primary key,
  reference_code text not null unique default ('FND-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  source_type text not null check (source_type in ('assessment', 'internal_audit', 'risk', 'vulnerability')),
  source_record_id bigint not null,
  assessment_item_id bigint references public.assessment_items(id),
  assessment_cycle_id bigint references public.assessment_cycles(id),
  risk_id bigint references public.cyber_risks(id),
  vulnerability_id bigint references public.vulnerabilities(id),
  framework_id bigint references public.frameworks(id),
  control_id bigint references public.controls(id),
  title text not null check (length(btrim(title)) between 2 and 300),
  description text not null check (length(btrim(description)) > 0),
  severity text not null default 'unclassified'
    check (severity in ('unclassified', 'low', 'medium', 'high', 'critical')),
  owner_id uuid references public.profiles(user_id),
  status text not null default 'open'
    check (status in ('open', 'in_treatment', 'pending_verification', 'closed')),
  due_date date,
  identified_date date not null default current_date,
  verification_status text not null default 'not_submitted'
    check (verification_status in ('not_submitted', 'pending', 'accepted', 'rejected')),
  verification_evidence_id bigint references public.evidence(id),
  verification_reason text,
  verified_by uuid references public.profiles(user_id),
  verified_at timestamptz,
  closure_reason text,
  closed_by uuid references public.profiles(user_id),
  closed_at timestamptz,
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(user_id),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  constraint grc_findings_source_shape check (
    (source_type = 'assessment' and assessment_item_id is not null
      and source_record_id = assessment_item_id
      and assessment_cycle_id is not null and risk_id is null and vulnerability_id is null)
    or (source_type = 'risk' and risk_id is not null and source_record_id = risk_id
      and assessment_item_id is null and assessment_cycle_id is null and vulnerability_id is null)
    or (source_type = 'vulnerability' and vulnerability_id is not null
      and source_record_id = vulnerability_id
      and assessment_item_id is null and assessment_cycle_id is null and risk_id is null)
    or (source_type = 'internal_audit' and assessment_item_id is null
      and assessment_cycle_id is null and risk_id is null and vulnerability_id is null)
  ),
  constraint grc_findings_closed_state check (
    (status = 'closed') = (closed_at is not null)
    and (status <> 'closed' or verification_status = 'accepted')
  )
);
create index grc_findings_source_idx on public.grc_findings(source_type, source_record_id, id desc);
create index grc_findings_assessment_item_idx on public.grc_findings(assessment_item_id, id desc)
  where assessment_item_id is not null;
create index grc_findings_owner_status_idx on public.grc_findings(owner_id, status, due_date);
create index grc_findings_open_due_idx on public.grc_findings(due_date, id)
  where status <> 'closed';
create index grc_findings_control_idx on public.grc_findings(control_id, id desc);

create table public.grc_corrective_actions (
  id bigint generated always as identity primary key,
  finding_id bigint not null references public.grc_findings(id) on delete restrict,
  control_id bigint references public.controls(id),
  title text not null check (length(btrim(title)) between 2 and 300),
  description text not null check (length(btrim(description)) > 0),
  owner_id uuid not null references public.profiles(user_id),
  due_date date,
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed')),
  completed_at timestamptz,
  completed_by uuid references public.profiles(user_id),
  completion_note text,
  verification_status text not null default 'not_submitted'
    check (verification_status in ('not_submitted', 'pending', 'accepted', 'rejected')),
  verification_evidence_id bigint references public.evidence(id),
  reference_note text,
  verification_reason text,
  verified_by uuid references public.profiles(user_id),
  verified_at timestamptz,
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(user_id),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  constraint grc_action_completion_state check (
    (status = 'completed') = (completed_at is not null)
    and (status <> 'completed' or completed_by is not null)
    and (verification_status <> 'accepted' or status = 'completed')
  )
);
create index grc_actions_finding_idx on public.grc_corrective_actions(finding_id, id);
create index grc_actions_owner_due_idx on public.grc_corrective_actions(owner_id, due_date)
  where status <> 'completed';
create index grc_actions_evidence_idx on public.grc_corrective_actions(verification_evidence_id)
  where verification_evidence_id is not null;

-- Neither the Data API nor ordinary application roles may mutate these tables.
alter table public.grc_findings enable row level security;
alter table public.grc_corrective_actions enable row level security;
revoke all on public.grc_findings, public.grc_corrective_actions from public, anon, authenticated;
grant select on public.grc_findings, public.grc_corrective_actions to authenticated;
grant select, insert, update, delete on public.grc_findings, public.grc_corrective_actions to service_role;
revoke all on sequence public.grc_findings_id_seq, public.grc_corrective_actions_id_seq
  from public, anon, authenticated;
grant usage, select on sequence public.grc_findings_id_seq, public.grc_corrective_actions_id_seq
  to service_role;

-- The source vocabulary is ready for internal_audit, but no independent audit
-- engagement record exists yet. It is deliberately not creatable today.
create function private.grc_validate_finding_source() returns trigger
language plpgsql security definer set search_path = '' as $guard$
declare source_control bigint; source_cycle bigint; source_framework bigint;
begin
  if tg_op = 'UPDATE' then
    if row(new.source_type, new.source_record_id, new.assessment_item_id,
           new.assessment_cycle_id, new.risk_id, new.vulnerability_id,
           new.control_id, new.framework_id)
       is distinct from
       row(old.source_type, old.source_record_id, old.assessment_item_id,
           old.assessment_cycle_id, old.risk_id, old.vulnerability_id,
           old.control_id, old.framework_id) then
      raise exception 'Finding source and regulatory context are immutable' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.source_type = 'assessment' then
    select i.control_id, i.cycle_id, a.framework_id
      into source_control, source_cycle, source_framework
    from public.assessment_items i
    join public.assessment_cycles a on a.id = i.cycle_id
    where i.id = new.source_record_id and a.status not in ('approved', 'closed');
    if not found then
      raise exception 'Assessment source is missing or already approved/closed' using errcode = '23503';
    end if;
    new.assessment_item_id := new.source_record_id;
    new.assessment_cycle_id := source_cycle;
    new.risk_id := null;
    new.vulnerability_id := null;
    new.control_id := source_control;
    new.framework_id := source_framework;
  elsif new.source_type = 'risk' then
    if not exists (select 1 from public.cyber_risks r where r.id = new.source_record_id) then
      raise exception 'Risk source is missing' using errcode = '23503';
    end if;
    new.risk_id := new.source_record_id;
    new.assessment_item_id := null;
    new.assessment_cycle_id := null;
    new.vulnerability_id := null;
    -- The current risk register has no governed risk-to-control relation.
    -- Never accept an arbitrary client-supplied regulatory association.
    new.control_id := null;
  elsif new.source_type = 'vulnerability' then
    select v.linked_control_id into source_control
    from public.vulnerabilities v where v.id = new.source_record_id;
    if not found then
      raise exception 'Vulnerability source is missing' using errcode = '23503';
    end if;
    new.vulnerability_id := new.source_record_id;
    new.assessment_item_id := null;
    new.assessment_cycle_id := null;
    new.risk_id := null;
    new.control_id := source_control;
  elsif new.source_type = 'internal_audit' then
    raise exception 'Internal audit source records are not implemented yet' using errcode = '0A000';
  end if;

  if new.control_id is not null then
    select c.framework_id into source_framework
    from public.controls c join public.frameworks f on f.id = c.framework_id
    where c.id = new.control_id and f.is_active;
    if not found then
      raise exception 'Finding control must be active' using errcode = '42501';
    end if;
    new.framework_id := source_framework;
  else
    new.framework_id := null;
  end if;
  return new;
end
$guard$;
revoke all on function private.grc_validate_finding_source() from public, anon, authenticated;
create trigger grc_finding_source_guard before insert or update of
  source_type, source_record_id, assessment_item_id, assessment_cycle_id,
  risk_id, vulnerability_id, control_id, framework_id
  on public.grc_findings for each row execute function private.grc_validate_finding_source();

create function private.grc_validate_action_context() returns trigger
language plpgsql security definer set search_path = '' as $guard$
declare parent_control bigint; parent_status text;
begin
  if tg_op = 'UPDATE' and new.finding_id is distinct from old.finding_id then
    raise exception 'Corrective action cannot move between findings' using errcode = '42501';
  end if;
  select control_id, status into parent_control, parent_status
  from public.grc_findings where id = new.finding_id;
  if not found or parent_status = 'closed' then
    raise exception 'Corrective action requires an open finding' using errcode = '42501';
  end if;
  if parent_control is not null and exists (
    select 1 from public.controls c join public.frameworks f on f.id = c.framework_id
    where c.id = parent_control and not f.is_active
  ) then
    raise exception 'Archived controls cannot receive corrective actions'
      using errcode = '42501';
  end if;
  new.control_id := parent_control;
  return new;
end
$guard$;
revoke all on function private.grc_validate_action_context() from public, anon, authenticated;
create trigger grc_action_context_guard before insert or update on public.grc_corrective_actions
  for each row execute function private.grc_validate_action_context();

-- Shared finding identity and its action trail are historical records. Closing
-- is a state transition, never a physical removal (including for service_role).
create function private.grc_prevent_finding_delete() returns trigger
language plpgsql security definer set search_path = '' as $guard$
begin
  raise exception 'Finding and corrective-action history cannot be deleted'
    using errcode = '42501';
end
$guard$;
revoke all on function private.grc_prevent_finding_delete() from public, anon, authenticated;
create trigger grc_finding_no_delete before delete on public.grc_findings
  for each row execute function private.grc_prevent_finding_delete();
create trigger grc_action_no_delete before delete on public.grc_corrective_actions
  for each row execute function private.grc_prevent_finding_delete();

-- Reuse the certified archived-control and before/after audit mechanisms.
create trigger archived_control_mutation_guard before insert or update or delete
  on public.grc_findings for each row
  execute function private.guard_archived_control_mutation('control_id');
create trigger archived_control_mutation_guard before insert or update or delete
  on public.grc_corrective_actions for each row
  execute function private.guard_archived_control_mutation('control_id');
create trigger grc_finding_audit after insert or update or delete on public.grc_findings
  for each row execute function private.grc_audit();
create trigger grc_action_audit after insert or update or delete on public.grc_corrective_actions
  for each row execute function private.grc_audit();

create function private.grc_finding_can_read(p_finding_id bigint) returns boolean
language sql stable security definer set search_path = '' as $read$
  select auth.uid() is not null and exists (
    select 1 from public.grc_findings f
    where f.id = p_finding_id and (
      private.current_user_role() in ('admin', 'cybersecurity_team')
      or (private.current_user_role() = 'control_owner' and (
        (f.source_type = 'assessment' and exists (
          select 1 from public.assessment_items i
          where i.id = f.assessment_item_id and i.owner_id = auth.uid()))
        or (f.source_type = 'risk' and exists (
          select 1 from public.cyber_risks r
          where r.id = f.risk_id and r.assigned_to = auth.uid()))
        or (f.source_type = 'vulnerability' and exists (
          select 1 from public.vulnerabilities v
          where v.id = f.vulnerability_id and
            (v.assigned_to = auth.uid() or exists (
              select 1 from public.controls c
              where c.id = v.linked_control_id and c.control_owner_id = auth.uid()))))
      ))
      or (private.current_user_role() = 'nca_external_auditor'
        and f.source_type = 'assessment'
        and exists (select 1 from public.assessment_cycles a
          where a.id = f.assessment_cycle_id and a.status in ('approved', 'closed'))
        and private.can_external_auditor_view_control(f.control_id))
    )
  );
$read$;
revoke all on function private.grc_finding_can_read(bigint) from public, anon;
grant execute on function private.grc_finding_can_read(bigint) to authenticated;
create policy grc_finding_read on public.grc_findings for select to authenticated
  using (private.grc_finding_can_read(id));
create policy grc_action_read on public.grc_corrective_actions for select to authenticated
  using (private.grc_finding_can_read(finding_id));

-- The central audit log keeps complete history; new business event details
-- are team-only, including events without a control FK.
create policy grc_finding_events_team on public.grc_audit_events for select to authenticated
  using (entity_type in ('grc_findings', 'grc_corrective_actions')
    and private.current_user_role() in ('admin', 'cybersecurity_team'));
create policy grc_finding_events_restrict on public.grc_audit_events as restrictive
  for select to authenticated using (
    entity_type not in ('grc_findings', 'grc_corrective_actions')
    or private.current_user_role() in ('admin', 'cybersecurity_team'));

create function private.grc_finding_evidence_valid(
  p_evidence_id bigint, p_control_id bigint, p_verifier uuid
) returns boolean language sql stable security definer set search_path = '' as $evidence$
  select p_evidence_id is null or (
    p_control_id is not null and exists (
      select 1 from public.evidence e
      where e.id = p_evidence_id and e.control_id = p_control_id
        and e.is_current and e.status in ('accepted', 'approved')
        and (e.valid_until is null or e.valid_until >= (now() at time zone 'Asia/Riyadh')::date)
        and e.uploaded_by is not null and e.uploaded_by <> p_verifier
    )
  );
$evidence$;
revoke all on function private.grc_finding_evidence_valid(bigint,bigint,uuid)
  from public, anon, authenticated;

-- All application mutations use one explicit, audited command. No direct
-- table INSERT/UPDATE/DELETE is granted to anon or authenticated.
create function private.grc_finding_command(
  p_action text, p_finding_id bigint, p_data jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $command$
declare
  actor uuid := auth.uid();
  actor_role text := private.current_user_role();
  team_role boolean;
  f public.grc_findings%rowtype;
  a public.grc_corrective_actions%rowtype;
  source_kind text;
  source_id bigint;
  proposed_owner uuid;
  evidence_id bigint;
  expected_revision integer;
  decision_reason text;
begin
  team_role := actor_role in ('admin', 'cybersecurity_team');
  if actor is null or actor_role is null
     or actor_role not in ('admin', 'cybersecurity_team', 'control_owner') then
    raise exception 'Active CGP work role required' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Command data must be a JSON object' using errcode = '22023';
  end if;

  if p_action = 'create_finding' then
    source_kind := nullif(btrim(p_data->>'source_type'), '');
    source_id := nullif(p_data->>'source_record_id', '')::bigint;
    proposed_owner := nullif(p_data->>'owner_id', '')::uuid;
    if source_kind is null
       or source_kind not in ('assessment', 'risk', 'vulnerability', 'internal_audit')
       or source_id is null then
      raise exception 'Choose a supported source record' using errcode = '22023';
    end if;
    if source_kind = 'internal_audit' then
      raise exception 'Internal audit source is reserved until its record model exists'
        using errcode = '0A000';
    end if;
    if not team_role then
      if source_kind <> 'assessment' or proposed_owner is distinct from actor
         or not exists (
           select 1 from public.assessment_items i
           join public.assessment_cycles c on c.id = i.cycle_id
           where i.id = source_id and i.owner_id = actor
             and c.status in ('draft','in_progress','evidence_collection')
         ) then
        raise exception 'Finding source outside assigned assessment scope'
          using errcode = '42501';
      end if;
    end if;
    if proposed_owner is not null then
      if not exists (select 1 from public.profiles p where p.user_id = proposed_owner
                     and p.is_active and p.role in ('admin','cybersecurity_team','control_owner')) then
        raise exception 'Finding owner must be an active CGP work role' using errcode = '42501';
      end if;
      if exists (select 1 from public.profiles p where p.user_id = proposed_owner
                 and p.role = 'control_owner') and not (
        (source_kind = 'assessment' and exists (
          select 1 from public.assessment_items i
          where i.id = source_id and i.owner_id = proposed_owner))
        or (source_kind = 'risk' and exists (
          select 1 from public.cyber_risks r
          where r.id = source_id and r.assigned_to = proposed_owner))
        or (source_kind = 'vulnerability' and exists (
          select 1 from public.vulnerabilities v
          where v.id = source_id and (v.assigned_to = proposed_owner or exists (
            select 1 from public.controls c where c.id = v.linked_control_id
              and c.control_owner_id = proposed_owner))))
      ) then
        raise exception 'Finding owner is outside source visibility' using errcode = '42501';
      end if;
    end if;
    insert into public.grc_findings (
      source_type, source_record_id, control_id, title, description, severity,
      owner_id, due_date, identified_date, created_by, updated_by
    ) values (
      source_kind, source_id, nullif(p_data->>'control_id','')::bigint,
      btrim(coalesce(p_data->>'title','')),
      btrim(coalesce(p_data->>'description','')),
      coalesce(nullif(p_data->>'severity',''),'unclassified'), proposed_owner,
      nullif(p_data->>'due_date','')::date,
      coalesce(nullif(p_data->>'identified_date','')::date,current_date), actor, actor
    ) returning * into f;
    return jsonb_build_object('id',f.id,'reference_code',f.reference_code,'revision',f.revision);
  end if;

  if p_finding_id is null then
    raise exception 'Finding id required' using errcode = '22023';
  end if;
  select * into f from public.grc_findings where id = p_finding_id for update;
  if not found or not (team_role or
      (actor_role = 'control_owner' and f.owner_id = actor
       and private.grc_finding_can_read(f.id))) then
    raise exception 'Finding outside authorized scope' using errcode = '42501';
  end if;
  expected_revision := nullif(p_data->>'finding_revision','')::integer;
  if expected_revision is null or expected_revision <> f.revision then
    raise exception 'Finding revision changed; reload before editing' using errcode = '40001';
  end if;

  if p_action = 'update_finding' then
    if f.status not in ('open','in_treatment') then
      raise exception 'Finding is no longer editable' using errcode = '42501';
    end if;
    update public.grc_findings set
      title = btrim(coalesce(p_data->>'title',f.title)),
      description = btrim(coalesce(p_data->>'description',f.description)),
      severity = case when team_role then coalesce(nullif(p_data->>'severity',''),f.severity)
                      else f.severity end,
      due_date = case when p_data ? 'due_date' then nullif(p_data->>'due_date','')::date
                      else f.due_date end,
      revision = revision + 1, updated_by = actor, updated_at = now()
    where id = f.id returning * into f;

  elsif p_action = 'start_treatment' then
    if f.status <> 'open' then
      raise exception 'Only an open finding can enter treatment' using errcode = '42501';
    end if;
    update public.grc_findings set status = 'in_treatment',
      revision = revision + 1, updated_by = actor, updated_at = now()
    where id = f.id returning * into f;

  elsif p_action = 'add_action' then
    if f.status not in ('open','in_treatment') then
      raise exception 'Cannot add an action during verification or after closure'
        using errcode = '42501';
    end if;
    proposed_owner := nullif(p_data->>'owner_id','')::uuid;
    if proposed_owner is null or not exists (
      select 1 from public.profiles p where p.user_id = proposed_owner and p.is_active
        and p.role in ('admin','cybersecurity_team','control_owner')) then
      raise exception 'Action owner must be an active CGP work role' using errcode = '42501';
    end if;
    if (not team_role and proposed_owner <> actor)
       or (exists (select 1 from public.profiles p where p.user_id = proposed_owner
                   and p.role = 'control_owner')
           and proposed_owner is distinct from f.owner_id) then
      raise exception 'Action owner is outside finding scope' using errcode = '42501';
    end if;
    insert into public.grc_corrective_actions (
      finding_id, control_id, title, description, owner_id, due_date,
      reference_note, created_by, updated_by
    ) values (
      f.id, f.control_id, btrim(coalesce(p_data->>'title','')),
      btrim(coalesce(p_data->>'description','')), proposed_owner,
      nullif(p_data->>'due_date','')::date,
      nullif(btrim(p_data->>'reference_note'),''), actor, actor
    ) returning * into a;
    update public.grc_findings set revision = revision + 1,
      updated_by = actor, updated_at = now() where id = f.id returning * into f;

  elsif p_action = 'update_action' then
    select * into a from public.grc_corrective_actions
      where id = nullif(p_data->>'action_id','')::bigint and finding_id = f.id for update;
    if not found or a.status = 'completed' or f.status not in ('open','in_treatment')
       or not (team_role or a.owner_id = actor) then
      raise exception 'Action is not editable in this scope' using errcode = '42501';
    end if;
    if nullif(p_data->>'action_revision','')::integer is distinct from a.revision then
      raise exception 'Action revision changed; reload before editing' using errcode = '40001';
    end if;
    update public.grc_corrective_actions set
      title = btrim(coalesce(p_data->>'title',a.title)),
      description = btrim(coalesce(p_data->>'description',a.description)),
      due_date = case when p_data ? 'due_date' then nullif(p_data->>'due_date','')::date
                      else a.due_date end,
      status = case when p_data->>'status' = 'in_progress' then 'in_progress'
                    else a.status end,
      revision = revision + 1, updated_by = actor, updated_at = now()
    where id = a.id returning * into a;
    update public.grc_findings set revision = revision + 1,
      updated_by = actor, updated_at = now() where id = f.id returning * into f;

  elsif p_action = 'complete_action' then
    select * into a from public.grc_corrective_actions
      where id = nullif(p_data->>'action_id','')::bigint and finding_id = f.id for update;
    if not found or a.status = 'completed' or f.status not in ('open','in_treatment')
       or not (team_role or a.owner_id = actor) then
      raise exception 'Action cannot be completed in this scope' using errcode = '42501';
    end if;
    if nullif(p_data->>'action_revision','')::integer is distinct from a.revision then
      raise exception 'Action revision changed; reload before editing' using errcode = '40001';
    end if;
    if nullif(btrim(p_data->>'completion_note'),'') is null then
      raise exception 'Completion note required' using errcode = '22023';
    end if;
    evidence_id := nullif(p_data->>'evidence_id','')::bigint;
    if evidence_id is not null and not exists (
      select 1 from public.evidence e where e.id = evidence_id
        and e.control_id = f.control_id) then
      raise exception 'Action evidence must belong to the finding control'
        using errcode = '42501';
    end if;
    update public.grc_corrective_actions set status = 'completed',
      completed_at = now(), completed_by = actor,
      completion_note = btrim(p_data->>'completion_note'),
      verification_status = 'pending', verification_evidence_id = evidence_id,
      verification_reason = null, verified_by = null, verified_at = null,
      revision = revision + 1, updated_by = actor, updated_at = now()
    where id = a.id returning * into a;
    update public.grc_findings set revision = revision + 1,
      updated_by = actor, updated_at = now() where id = f.id returning * into f;

  elsif p_action = 'submit_verification' then
    if f.status not in ('open','in_treatment') or exists (
      select 1 from public.grc_corrective_actions x
      where x.finding_id = f.id and x.status <> 'completed') then
      raise exception 'Complete all actions before submitting the finding'
        using errcode = '42501';
    end if;
    decision_reason := nullif(btrim(p_data->>'reason'),'');
    if decision_reason is null then
      raise exception 'Submission reason required' using errcode = '22023';
    end if;
    update public.grc_findings set status = 'pending_verification',
      verification_status = 'pending', verification_reason = decision_reason,
      verified_by = null, verified_at = null,
      revision = revision + 1, updated_by = actor, updated_at = now()
    where id = f.id returning * into f;

  elsif p_action in ('verify_action','reject_action') then
    if not team_role or f.status <> 'pending_verification' then
      raise exception 'Independent team verification required' using errcode = '42501';
    end if;
    select * into a from public.grc_corrective_actions
      where id = nullif(p_data->>'action_id','')::bigint and finding_id = f.id for update;
    if not found or a.status <> 'completed' or a.verification_status <> 'pending'
       or a.owner_id = actor
       or a.completed_by = actor or f.created_by = actor then
      raise exception 'Action verification conflicts with separation of duties'
        using errcode = '42501';
    end if;
    if nullif(p_data->>'action_revision','')::integer is distinct from a.revision then
      raise exception 'Action revision changed; reload before verifying' using errcode = '40001';
    end if;
    decision_reason := nullif(btrim(p_data->>'reason'),'');
    if decision_reason is null then
      raise exception 'Verification reason required' using errcode = '22023';
    end if;
    if p_action = 'verify_action' then
      if not private.grc_finding_evidence_valid(a.verification_evidence_id,f.control_id,actor) then
        raise exception 'Action evidence is not current, accepted and independent'
          using errcode = '42501';
      end if;
      update public.grc_corrective_actions set verification_status = 'accepted',
        verification_reason = decision_reason, verified_by = actor, verified_at = now(),
        revision = revision + 1, updated_by = actor, updated_at = now()
      where id = a.id returning * into a;
    else
      update public.grc_corrective_actions set status = 'in_progress',
        completed_at = null, completed_by = null,
        verification_status = 'rejected', verification_reason = decision_reason,
        verified_by = actor, verified_at = now(),
        revision = revision + 1, updated_by = actor, updated_at = now()
      where id = a.id returning * into a;
      update public.grc_findings set status = 'in_treatment',
        verification_status = 'rejected', verification_reason = decision_reason,
        verified_by = actor, verified_at = now(),
        revision = revision + 1, updated_by = actor, updated_at = now()
      where id = f.id returning * into f;
    end if;
    if p_action = 'verify_action' then
      update public.grc_findings set revision = revision + 1,
        updated_by = actor, updated_at = now() where id = f.id returning * into f;
    end if;

  elsif p_action in ('verify_finding','reject_finding') then
    if not team_role or f.status <> 'pending_verification'
       or f.verification_status <> 'pending'
       or f.created_by = actor or f.owner_id = actor
       or exists (select 1 from public.grc_corrective_actions x
         where x.finding_id = f.id and (x.owner_id = actor or x.completed_by = actor)) then
      raise exception 'Independent finding verification required'
        using errcode = '42501';
    end if;
    decision_reason := nullif(btrim(p_data->>'reason'),'');
    if decision_reason is null then
      raise exception 'Verification reason required' using errcode = '22023';
    end if;
    if p_action = 'verify_finding' then
      if exists (select 1 from public.grc_corrective_actions x
        where x.finding_id = f.id and
          (x.status <> 'completed' or x.verification_status <> 'accepted')) then
        raise exception 'Every corrective action needs independent acceptance'
          using errcode = '42501';
      end if;
      evidence_id := nullif(p_data->>'evidence_id','')::bigint;
      if not private.grc_finding_evidence_valid(evidence_id,f.control_id,actor) then
        raise exception 'Finding evidence is not current, accepted and independent'
          using errcode = '42501';
      end if;
      update public.grc_findings set verification_status = 'accepted',
        verification_evidence_id = evidence_id,
        verification_reason = decision_reason, verified_by = actor,
        verified_at = now(), revision = revision + 1,
        updated_by = actor, updated_at = now()
      where id = f.id returning * into f;
    else
      update public.grc_findings set status = 'in_treatment',
        verification_status = 'rejected', verification_reason = decision_reason,
        verified_by = actor, verified_at = now(),
        revision = revision + 1, updated_by = actor, updated_at = now()
      where id = f.id returning * into f;
    end if;

  elsif p_action = 'close_finding' then
    if not team_role or f.status <> 'pending_verification'
       or f.verification_status <> 'accepted' or f.verified_by is distinct from actor then
      raise exception 'Only the independent verifier may close an accepted finding'
        using errcode = '42501';
    end if;
    decision_reason := nullif(btrim(p_data->>'reason'),'');
    if decision_reason is null then
      raise exception 'Closure decision required' using errcode = '22023';
    end if;
    if not private.grc_finding_evidence_valid(f.verification_evidence_id,f.control_id,actor)
       or exists (select 1 from public.grc_corrective_actions x
          where x.finding_id = f.id and
            (x.status <> 'completed' or x.verification_status <> 'accepted'
             or not private.grc_finding_evidence_valid(
               x.verification_evidence_id,f.control_id,actor))) then
      raise exception 'Reverify current evidence and all actions before closure'
        using errcode = '42501';
    end if;
    update public.grc_findings set status = 'closed', closure_reason = decision_reason,
      closed_by = actor, closed_at = now(), revision = revision + 1,
      updated_by = actor, updated_at = now()
    where id = f.id returning * into f;

  else
    raise exception 'Unsupported finding command' using errcode = '22023';
  end if;
  return jsonb_build_object('id',f.id,'reference_code',f.reference_code,
                            'revision',f.revision,'action_id',a.id);
end
$command$;
revoke all on function private.grc_finding_command(text,bigint,jsonb)
  from public, anon;
grant execute on function private.grc_finding_command(text,bigint,jsonb)
  to authenticated;

create function public.cgp_finding_command(
  p_action text, p_finding_id bigint default null, p_data jsonb default '{}'
) returns jsonb language sql security invoker set search_path = '' as $wrapper$
  select private.grc_finding_command(p_action,p_finding_id,p_data);
$wrapper$;
revoke all on function public.cgp_finding_command(text,bigint,jsonb)
  from public, anon;
grant execute on function public.cgp_finding_command(text,bigint,jsonb)
  to authenticated;

commit;
