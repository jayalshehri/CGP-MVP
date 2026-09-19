-- Daily sweep that recomputes controls.evidence_status for any control whose
-- current (or shared-linked, accepted) evidence has crossed its valid_until
-- date. This never touches evidence rows, evidence_reviews, control_assessments,
-- or control_review_cycles — it only re-runs the existing, already-reviewed
-- private.grc_refresh_evidence_summary() rollup, which already treats expired
-- evidence as "expired" when computing controls.evidence_status. Idempotent:
-- re-running finds nothing to change once a control's status already reflects
-- expiry, and grc_refresh_evidence_summary itself is a pure recompute. The
-- existing private.grc_audit trigger on public.controls only logs a row when
-- the UPDATE actually changes a value, so a no-op sweep produces no audit noise.

create or replace function private.grc_expire_evidence_sweep() returns integer
    language plpgsql
    security definer
    set search_path to ''
    as $$
declare cid bigint; n integer := 0;
begin
  for cid in
    select control_id from public.evidence
    where is_current and status = 'accepted' and valid_until is not null
      and valid_until < (now() at time zone 'Asia/Riyadh')::date
    union
    select l.control_id from public.evidence_control_links l
    join public.evidence e on e.id = l.evidence_id
    where l.status = 'accepted' and e.is_current and e.valid_until is not null
      and e.valid_until < (now() at time zone 'Asia/Riyadh')::date
  loop
    perform private.grc_refresh_evidence_summary(cid);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function private.grc_expire_evidence_sweep() from public;

create extension if not exists pg_cron with schema extensions;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'grc-evidence-expiry-daily') then
    perform cron.schedule(
      'grc-evidence-expiry-daily',
      '5 0 * * *',
      $sql$select private.grc_expire_evidence_sweep();$sql$
    );
  end if;
end;
$$;
