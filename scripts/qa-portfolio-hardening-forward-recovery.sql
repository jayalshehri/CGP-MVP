-- FORWARD RECOVERY for 20261007185235_portfolio_identity_audit_hardening.
-- DO NOT RUN unless the post-check fails or an approved incident requires
-- reverting the hardening. Run on QA as postgres. Removes exactly the objects
-- the migration created; it changes no business data (the migration changed
-- none). Rows created while the hardening was active keep their
-- session-stamped created_by/archived_by values, which are correct.
-- If this is used, add the same SQL to the repository as a NEW migration
-- (never edit or delete 20261007185235) and record that one version only.
begin;
set local lock_timeout = '10s';

do $recovery_preflight$
begin
  if current_user <> 'postgres' then raise exception 'Run as postgres'; end if;
  if to_regprocedure('private.stamp_portfolio_creator()') is null
     or to_regprocedure('private.stamp_project_archive()') is null then
    raise exception 'Hardening functions not present; nothing to recover';
  end if;
end;
$recovery_preflight$;

drop policy if exists portfolio_audit_events_restrict on public.grc_audit_events;
drop policy if exists portfolio_audit_events_team on public.grc_audit_events;
drop trigger if exists stamp_project_archive on public.cybersecurity_projects;
drop trigger if exists stamp_portfolio_creator on public.cybersecurity_projects;
drop trigger if exists stamp_portfolio_creator on public.portfolio_import_batches;
drop trigger if exists stamp_portfolio_creator on public.portfolio_import_projects;
drop trigger if exists stamp_portfolio_creator on public.portfolio_mapping_reviews;
drop function private.stamp_project_archive();
drop function private.stamp_portfolio_creator();

do $recovery_postcondition$
begin
  if exists(select 1 from pg_trigger where tgname in ('stamp_portfolio_creator', 'stamp_project_archive'))
     or exists(select 1 from pg_policies where tablename = 'grc_audit_events' and policyname like 'portfolio_audit_events_%')
     or (select count(*) from pg_policies where tablename = 'grc_audit_events') <> 5 then
    raise exception 'Recovery postcondition failed';
  end if;
end;
$recovery_postcondition$;

commit;
