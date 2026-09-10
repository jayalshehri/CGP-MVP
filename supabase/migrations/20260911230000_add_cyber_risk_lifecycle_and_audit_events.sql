-- Adds a controlled lifecycle and immutable event history to the cyber risk register.
alter table public.cyber_risks
  add column if not exists risk_status text not null default 'open'
    check (risk_status in ('open','treatment_in_progress','accepted','closed')),
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references auth.users(id) on delete set null;

create table if not exists public.cyber_risk_events (
  id bigint generated always as identity primary key,
  risk_id bigint not null references public.cyber_risks(id) on delete cascade,
  event_type text not null,
  previous_status text,
  new_status text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists cyber_risk_events_risk_id_created_at_idx on public.cyber_risk_events(risk_id, created_at desc);

alter table public.cyber_risk_events enable row level security;
revoke all on public.cyber_risk_events from anon, authenticated;
grant select on public.cyber_risk_events to authenticated;

drop policy if exists cyber_risk_events_read_scoped on public.cyber_risk_events;
create policy cyber_risk_events_read_scoped on public.cyber_risk_events for select to authenticated using (
  (select private.current_user_role()) in ('admin','cybersecurity_team')
  or exists (select 1 from public.cyber_risks r where r.id = risk_id and r.assigned_to = (select auth.uid()))
);

create or replace function public.audit_cyber_risk_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.cyber_risk_events(risk_id,event_type,new_status,actor_id) values (new.id,'created',new.risk_status,auth.uid());
  elsif old.risk_status is distinct from new.risk_status then
    insert into public.cyber_risk_events(risk_id,event_type,previous_status,new_status,actor_id) values (new.id,'status_changed',old.risk_status,new.risk_status,auth.uid());
  else
    insert into public.cyber_risk_events(risk_id,event_type,previous_status,new_status,actor_id) values (new.id,'updated',old.risk_status,new.risk_status,auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists cyber_risks_audit_event on public.cyber_risks;
create trigger cyber_risks_audit_event after insert or update on public.cyber_risks for each row execute function public.audit_cyber_risk_change();