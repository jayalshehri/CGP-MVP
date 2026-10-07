-- Portfolio identity and audit hardening on top of
-- 20261006102306_portfolio_phase2b_qa_cutover_guards. Applied migrations are
-- not edited. No business row is inserted, updated or deleted: existing
-- projects (including the 32 archived), the import batch, staged projects and
-- mapping reviews keep their stored created_by/archived_by values.
--
-- 1. created_by is stamped from the session (auth.uid()) on insert into
--    cybersecurity_projects and the three portfolio staging tables; any client
--    value is replaced. Without a session only postgres maintenance (migration
--    owner) may insert, and keeps its explicit value. created_by is immutable.
-- 2. archived_by is stamped from the session when archived_at goes NULL ->
--    value, is immutable while archived, and unarchive clears archived_at,
--    archived_by and archive_reason together.
-- 3. Audit events of the four portfolio entities are readable only by admin
--    and cybersecurity_team. A RESTRICTIVE policy stops grc_scoped_read from
--    exposing portfolio_mapping_reviews events (which carry control_id) to
--    control owners or external auditors. Other audit entities are unchanged.
-- Table RLS policies and grants are unchanged.
begin;
set local lock_timeout = '10s';

do $preflight$
begin
  if to_regprocedure('private.current_user_role()') is null
     or to_regclass('public.portfolio_import_batches') is null
     or to_regclass('public.portfolio_import_projects') is null
     or to_regclass('public.portfolio_mapping_reviews') is null
     or not exists (select 1 from pg_trigger where tgname = 'guard_portfolio_activation'
                    and tgrelid = 'public.cybersecurity_projects'::regclass) then
    raise exception 'Portfolio prerequisites (20261006102306) are missing';
  end if;
  if to_regprocedure('private.stamp_portfolio_creator()') is not null
     or to_regprocedure('private.stamp_project_archive()') is not null
     or exists (select 1 from pg_policies where tablename = 'grc_audit_events'
                and policyname in ('portfolio_audit_events_team', 'portfolio_audit_events_restrict')) then
    raise exception 'Portfolio identity/audit hardening objects already exist';
  end if;
end;
$preflight$;

-- Maintenance = the migration owner (postgres) acting without an authenticated
-- session. service_role and every API role are not maintenance. The check is
-- inlined so the triggers need no extra EXECUTE grant for API roles.
create function private.stamp_portfolio_creator() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
    elsif not (auth.uid() is null and current_user = 'postgres' and session_user = 'postgres') then
      raise exception 'An authenticated session is required to create % rows', tg_table_name using errcode = '42501';
    end if;
  elsif new.created_by is distinct from old.created_by and not (auth.uid() is null and current_user = 'postgres' and session_user = 'postgres') then
    raise exception 'created_by is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.stamp_portfolio_creator() from public, anon, authenticated;

create function private.stamp_project_archive() returns trigger
language plpgsql set search_path = '' as $$
declare was_archived boolean := tg_op = 'UPDATE' and old.archived_at is not null;
begin
  if new.archived_at is null then
    -- Active (or unarchived): archive attribution is always cleared together.
    new.archived_by := null;
    new.archive_reason := null;
  elsif not was_archived then
    -- NULL -> value: the archiving actor is the session, never the client.
    if auth.uid() is not null then
      new.archived_by := auth.uid();
    elsif not (auth.uid() is null and current_user = 'postgres' and session_user = 'postgres') then
      raise exception 'An authenticated session is required to archive a project' using errcode = '42501';
    end if;
  elsif new.archived_by is distinct from old.archived_by and not (auth.uid() is null and current_user = 'postgres' and session_user = 'postgres') then
    raise exception 'archived_by is immutable while the project is archived' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.stamp_project_archive() from public, anon, authenticated;

-- BEFORE triggers fire in name order; "stamp_*" runs after the existing
-- "guard_*" triggers, so their checks still see the client-submitted row.
create trigger stamp_portfolio_creator before insert or update of created_by on public.cybersecurity_projects
  for each row execute function private.stamp_portfolio_creator();
create trigger stamp_portfolio_creator before insert or update of created_by on public.portfolio_import_batches
  for each row execute function private.stamp_portfolio_creator();
create trigger stamp_portfolio_creator before insert or update of created_by on public.portfolio_import_projects
  for each row execute function private.stamp_portfolio_creator();
create trigger stamp_portfolio_creator before insert or update of created_by on public.portfolio_mapping_reviews
  for each row execute function private.stamp_portfolio_creator();
create trigger stamp_project_archive before insert or update of archived_at, archived_by, archive_reason on public.cybersecurity_projects
  for each row execute function private.stamp_project_archive();

-- Audit visibility for portfolio entities: team only, including events that
-- carry a control_id (portfolio_mapping_reviews), which grc_scoped_read would
-- otherwise expose to whoever can read that control.
create policy portfolio_audit_events_team on public.grc_audit_events
  for select to authenticated
  using (entity_type in ('cybersecurity_projects', 'portfolio_import_batches', 'portfolio_import_projects', 'portfolio_mapping_reviews')
    and (select private.current_user_role()) in ('admin', 'cybersecurity_team'));
create policy portfolio_audit_events_restrict on public.grc_audit_events
  as restrictive for select to authenticated
  using (entity_type not in ('cybersecurity_projects', 'portfolio_import_batches', 'portfolio_import_projects', 'portfolio_mapping_reviews')
    or (select private.current_user_role()) in ('admin', 'cybersecurity_team'));

commit;
