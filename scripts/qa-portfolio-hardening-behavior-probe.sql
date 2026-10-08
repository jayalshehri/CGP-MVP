-- CGP-QA behavior probe for 20261007185235_portfolio_identity_audit_hardening.
-- QA ONLY (lkozjnpfufdpzqtzdxhe), as postgres. Every fixture and mutation
-- probe ROLLS BACK: no business row persists. (Like the existing QA probes,
-- identity sequences of audit events may advance; no data is retained.)
-- Expected output: one row per behavior, all passed = true.
begin;
set local statement_timeout = '60s';
create temporary table hardening_results(test text, passed boolean) on commit drop;
create function pg_temp.expect_failure(command text, expected text) returns void language plpgsql as $$
declare actual text;
begin
  begin execute command;
  exception when others then
    get stacked diagnostics actual = returned_sqlstate;
    if actual = expected then return; end if;
    raise exception 'Expected %, got %: %', expected, actual, sqlerrm;
  end;
  raise exception 'Unexpected success: %', command;
end; $$;
do $$
declare admin_id uuid; team_id uuid; batch uuid := gen_random_uuid(); fixture bigint := -910299; r record;
begin
  if current_user <> 'postgres' then raise exception 'Run as postgres'; end if;
  select user_id into strict admin_id from public.profiles where role = 'admin' and is_active order by user_id limit 1;
  select user_id into strict team_id from public.profiles where role = 'cybersecurity_team' and is_active order by user_id limit 1;

  -- Spoofed created_by is replaced by the session (admin), on staging and projects.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.portfolio_import_batches(id, source_filename, source_sha256, status, created_by)
    values (batch, 'QA-HARDENING-PROBE.xlsx', md5(batch::text) || md5(reverse(batch::text)), 'staging', team_id);
  insert into public.cybersecurity_projects(id, project_code, name_ar, portfolio_priority, duration_value, duration_unit, work_type, executive_owner_code, created_by)
    overriding system value values (fixture, 'QA-HARDENING-PROBE', 'QA hardening probe ' || fixture, 'P3', 1, 'week', 'assessment', 'it', team_id);
  perform set_config('role', 'postgres', true);
  insert into hardening_results values
    ('batch created_by stamped from session (spoof ignored)', (select created_by = admin_id from public.portfolio_import_batches where id = batch)),
    ('project created_by stamped from session (spoof ignored)', (select created_by = admin_id from public.cybersecurity_projects where id = fixture));

  -- created_by immutable for API sessions.
  perform set_config('role', 'authenticated', true);
  perform pg_temp.expect_failure(format('update public.cybersecurity_projects set created_by = %L where id = %s', team_id, fixture), '23514');
  -- Archive: archived_by stamped from the session, immutable while archived, cleared on unarchive.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', team_id, 'role', 'authenticated')::text, true);
  update public.cybersecurity_projects set archived_at = now(), archive_reason = 'QA hardening probe', archived_by = admin_id where id = fixture;
  perform set_config('role', 'postgres', true);
  select archived_by, archive_reason, status into r from public.cybersecurity_projects where id = fixture;
  insert into hardening_results values ('archive stamps archived_by = session (spoof ignored); status unchanged', r.archived_by = team_id and r.status = 'planned');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform pg_temp.expect_failure(format('update public.cybersecurity_projects set archived_by = %L where id = %s', admin_id, fixture), '23514');
  update public.cybersecurity_projects set archived_at = null, archived_by = admin_id, archive_reason = 'left behind' where id = fixture;
  perform set_config('role', 'postgres', true);
  insert into hardening_results values
    ('created_by immutable; archived_by immutable while archived', true),
    ('unarchive clears archived_at, archived_by and archive_reason', (select archived_at is null and archived_by is null and archive_reason is null from public.cybersecurity_projects where id = fixture));

  -- No authenticated session: service_role cannot create or archive.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'service_role', true);
  perform pg_temp.expect_failure($q$insert into public.portfolio_import_batches(source_filename, source_sha256) values ('svc.xlsx', repeat('e', 64))$q$, '42501');
  perform pg_temp.expect_failure(format('update public.cybersecurity_projects set archived_at = now(), archive_reason = %L where id = %s', 'svc', fixture), '42501');
  perform set_config('role', 'postgres', true);
  insert into hardening_results values ('no-session (service_role) create/archive rejected', true);
end; $$;
select test, passed from hardening_results order by test;
rollback;
