-- Prevent direct RPC execution; this SECURITY DEFINER function is only invoked by its table trigger.
revoke all on function public.audit_cyber_risk_change() from public, anon, authenticated;

create index if not exists cyber_risk_events_actor_id_idx on public.cyber_risk_events(actor_id);
create index if not exists cyber_risks_closed_by_idx on public.cyber_risks(closed_by);