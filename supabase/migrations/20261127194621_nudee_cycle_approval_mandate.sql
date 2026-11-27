-- Delegation is scoped to one cycle. An office role records an external decision only when nominated.
create table public.nudee_approval_rules(
 cycle_id bigint primary key references public.nudee_cycles,authority text not null check(authority in ('executive','committee')),
 delegate_id uuid not null references auth.users,mandate text not null,recorded_by uuid not null references auth.users,created_at timestamptz not null default now()
);
create table public.nudee_action_signoffs(
 id bigint generated always as identity primary key,action_id bigint not null references public.nudee_improvements,
 submission_id bigint not null references public.nudee_submissions,decision_ref text not null,decision_date date not null,
 recorded_by uuid not null references auth.users,created_at timestamptz not null default now(), unique(action_id,submission_id)
);
alter table public.nudee_approval_rules enable row level security;
alter table public.nudee_action_signoffs enable row level security;
create policy office_rules_read on public.nudee_approval_rules for select to authenticated using((select public.nudee_is_office()));
create policy office_signoffs_read on public.nudee_action_signoffs for select to authenticated using((select public.nudee_is_office()));
revoke all on public.nudee_approval_rules,public.nudee_action_signoffs from anon,public,authenticated;
grant select on public.nudee_approval_rules,public.nudee_action_signoffs to authenticated;

create function public.nudee_approval_officers() returns table(user_id uuid,display_name text) language sql stable security definer set search_path='' as $$
 select p.user_id,p.display_name from public.profiles p where public.nudee_is_office() and p.is_active and p.role in ('data_governance_team','admin') order by p.display_name,p.user_id
$$;
revoke all on function public.nudee_approval_officers() from public,anon,authenticated;
grant execute on function public.nudee_approval_officers() to authenticated;

alter function private.nudee_office_record(text,jsonb) rename to nudee_record_assessment_event;
revoke all on function private.nudee_record_assessment_event(text,jsonb) from public,anon,authenticated;
create function private.nudee_office_record(p_action text,p_data jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); id_cycle bigint:=(p_data->>'cycle')::bigint; item public.nudee_improvements; rule public.nudee_approval_rules;
 delegated uuid; authority text:=p_data->>'authority'; mandate text:=btrim(p_data->>'mandate'); ref text:=btrim(p_data->>'reference');
 reviewed bigint; result bigint;
begin
 if uid is null or not public.nudee_is_office() then raise exception 'Office role required' using errcode='42501';end if;
 if p_action='cycle' then
  result:=private.nudee_record_assessment_event(p_action,p_data);
  if coalesce(authority,'office')<>'office' then
   delegated:=(p_data->>'delegate')::uuid;
   if authority not in ('executive','committee') or nullif(mandate,'') is null or length(mandate)>1600 or not exists(select from public.profiles p where p.user_id=delegated and p.is_active and p.role in ('data_governance_team','admin')) then raise exception 'Invalid approval mandate';end if;
   insert into public.nudee_approval_rules(cycle_id,authority,delegate_id,mandate,recorded_by) values(result,authority,delegated,mandate,uid);
  end if;
  return result;
 end if;
 if p_action in ('close','signoff','snapshot') then
  perform 1 from public.nudee_cycles where id=id_cycle for update;
  select * into rule from public.nudee_approval_rules where cycle_id=id_cycle;
 end if;
 if p_action in ('close','signoff') then
  select * into strict item from public.nudee_improvements where id=(p_data->>'action_id')::bigint and cycle_id=id_cycle and closed_at is null for update;
  select approved_version into reviewed from public.nudee_evidence_mapping where requirement_id=item.requirement_id;
  if p_action='signoff' then
   if rule.delegate_id is distinct from uid or uid=item.owner_id then raise exception 'Nominated recorder required' using errcode='42501';end if;
   if reviewed is null or reviewed is distinct from (p_data->>'version')::bigint then raise exception 'Reviewed evidence changed';end if;
   if nullif(ref,'') is null or length(ref)>1600 or (p_data->>'date')::date is null or (p_data->>'date')::date>(now() at time zone 'Asia/Riyadh')::date then raise exception 'Decision reference and date required';end if;
   insert into public.nudee_action_signoffs(action_id,submission_id,decision_ref,decision_date,recorded_by) values(item.id,reviewed,ref,(p_data->>'date')::date,uid) returning id into result;return result;
  end if;
  if rule.cycle_id is not null and not exists(select from public.nudee_action_signoffs s where s.action_id=item.id and s.submission_id=reviewed) then raise exception 'Approval decision required for this version';end if;
 end if;
 result:=private.nudee_record_assessment_event(p_action,p_data);
 if p_action='snapshot' then
  update public.nudee_cycle_events set payload=payload||jsonb_build_object('approval_rule',to_jsonb(rule),'signoffs',(select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb) from public.nudee_action_signoffs s join public.nudee_improvements i on i.id=s.action_id where i.cycle_id=id_cycle)) where id=result;
 end if;
 return result;
end $$;
create or replace function public.nudee_office_record(p_action text,p_data jsonb) returns bigint language sql security invoker set search_path='' as $$
 select private.nudee_office_record(p_action,p_data);
$$;
revoke all on function private.nudee_office_record(text,jsonb) from public,anon,authenticated;
grant execute on function private.nudee_office_record(text,jsonb) to authenticated;
notify pgrst,'reload schema';
