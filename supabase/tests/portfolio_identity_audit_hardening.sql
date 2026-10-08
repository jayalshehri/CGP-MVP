-- 20261007185235_portfolio_identity_audit_hardening: identity stamping,
-- spoof resistance, archive/unarchive attribution and portfolio audit
-- visibility. Real PostgreSQL RLS context; every fixture rolls back.
begin;
create function pg_temp.rejects(statement text) returns void language plpgsql as $$ declare failed boolean := false; begin
  begin execute statement; exception when others then failed := true; end;
  if not failed then raise exception 'Expected rejection: %', statement; end if;
end $$;
create function pg_temp.assert(ok boolean, label text) returns void language plpgsql as $$ begin
  if ok is not true then raise exception 'Assertion failed: %', label; end if;
end $$;
create function pg_temp.as_user(id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.rejects(text), pg_temp.assert(boolean, text), pg_temp.as_user(text) to authenticated, service_role, anon;

-- Actors: A admin, T cybersecurity_team, O control owner, X external auditor,
-- G data governance, V victim whose identity a client tries to impersonate.
insert into auth.users(id) values
 ('70000000-0000-4000-8000-00000000000a'), ('70000000-0000-4000-8000-00000000000b'),
 ('70000000-0000-4000-8000-00000000000c'), ('70000000-0000-4000-8000-00000000000d'),
 ('70000000-0000-4000-8000-00000000000e'), ('70000000-0000-4000-8000-00000000000f');
insert into public.profiles(user_id, display_name, role, is_active) values
 ('70000000-0000-4000-8000-00000000000a', 'Sec admin', 'admin', true),
 ('70000000-0000-4000-8000-00000000000b', 'Sec team', 'cybersecurity_team', true),
 ('70000000-0000-4000-8000-00000000000c', 'Sec owner', 'control_owner', true),
 ('70000000-0000-4000-8000-00000000000d', 'Sec auditor', 'nca_external_auditor', true),
 ('70000000-0000-4000-8000-00000000000e', 'Sec governance', 'data_governance_team', true),
 ('70000000-0000-4000-8000-00000000000f', 'Victim', 'cybersecurity_team', true);
select set_config('private.catalog_maintenance', 'on', true),
       set_config('private.catalog_maintenance_reason', 'Rollback-only portfolio identity/audit test fixture', true);
insert into public.frameworks(id, code, name_ar, name_en, version) values (-970001, 'SECFX', 'اختبار', 'Test', 'v1');
insert into public.controls(id, framework_id, control_code, title_ar, domain_ar, control_owner_id)
  values (-970001, -970001, '9-9-9', 'Fixture control', 'QA', '70000000-0000-4000-8000-00000000000c');
select set_config('private.catalog_maintenance', 'off', true);
insert into public.external_auditor_framework_scopes(auditor_id, framework_id, ends_on, created_by)
  values ('70000000-0000-4000-8000-00000000000d', -970001, current_date + 30, '70000000-0000-4000-8000-00000000000a');
-- A pre-existing non-portfolio audit event on the owner's control (positive control for grc_scoped_read).
insert into public.grc_audit_events(control_id, entity_type, entity_id, action, actor_id)
  values (-970001, 'evidence', '-970001', 'insert', '70000000-0000-4000-8000-00000000000c');

set local role authenticated;
select pg_temp.as_user('70000000-0000-4000-8000-00000000000a');

-- 1) created_by is stamped from the session on every table; client values are ignored.
insert into public.portfolio_import_batches(id, source_filename, source_sha256, status, created_by)
  values ('70000000-0000-4000-8000-0000000000b1', 'synthetic.xlsx', repeat('d', 64), 'validated', '70000000-0000-4000-8000-00000000000f');
insert into public.portfolio_import_projects(id, batch_id, source_sheet, source_row, source_project_name, priority, duration_value, duration_unit, work_type, executive_owner_code, created_by)
  values ('70000000-0000-4000-8000-0000000000c1', '70000000-0000-4000-8000-0000000000b1', 'S', 2, 'SEC — مشروع', 'P1', 6, 'month', 'technical_project', 'it', '70000000-0000-4000-8000-00000000000f');
insert into public.portfolio_mapping_reviews(id, staged_project_id, source_reference, source_framework, source_control_code, control_id, match_status, created_by)
  values ('70000000-0000-4000-8000-0000000000d1', '70000000-0000-4000-8000-0000000000c1', 'SECFX 9-9-9', 'SECFX', '9-9-9', -970001, 'exact_match', '70000000-0000-4000-8000-00000000000f');
-- The existing QA owner_other check still applies: 'other' needs text.
select pg_temp.rejects($q$insert into public.cybersecurity_projects(project_code, name_ar, status, portfolio_priority, work_type, executive_owner_code, duration_value, duration_unit) values ('SEC-1', 'SEC — مشروع يدوي', 'planned', 'P2', 'assessment', 'other', 1, 'year')$q$);
insert into public.cybersecurity_projects(project_code, name_ar, status, portfolio_priority, work_type, executive_owner_code, executive_owner_other, duration_value, duration_unit, created_by)
  values ('SEC-1', 'SEC — مشروع يدوي', 'planned', 'P2', 'assessment', 'other', 'جهة اختبار', 1, 'year', '70000000-0000-4000-8000-00000000000f');
reset role;
select pg_temp.assert((select created_by from public.portfolio_import_batches where id = '70000000-0000-4000-8000-0000000000b1') = '70000000-0000-4000-8000-00000000000a', 'batch created_by = session, not spoofed victim');
select pg_temp.assert((select created_by from public.portfolio_import_projects where id = '70000000-0000-4000-8000-0000000000c1') = '70000000-0000-4000-8000-00000000000a', 'staged project created_by = session');
select pg_temp.assert((select created_by from public.portfolio_mapping_reviews where id = '70000000-0000-4000-8000-0000000000d1') = '70000000-0000-4000-8000-00000000000a', 'mapping review created_by = session');
select pg_temp.assert((select created_by from public.cybersecurity_projects where project_code = 'SEC-1') = '70000000-0000-4000-8000-00000000000a', 'project created_by = session');

-- created_by is immutable (pending review has no other guard; this proves the new one).
set local role authenticated;
select pg_temp.as_user('70000000-0000-4000-8000-00000000000b');
select pg_temp.rejects($q$update public.portfolio_mapping_reviews set created_by = '70000000-0000-4000-8000-00000000000f' where id = '70000000-0000-4000-8000-0000000000d1'$q$);
select pg_temp.rejects($q$update public.portfolio_mapping_reviews set created_by = null where id = '70000000-0000-4000-8000-0000000000d1'$q$);
select pg_temp.rejects($q$update public.cybersecurity_projects set created_by = '70000000-0000-4000-8000-00000000000f' where project_code = 'SEC-1'$q$);
select pg_temp.rejects($q$update public.portfolio_import_batches set created_by = '70000000-0000-4000-8000-00000000000f' where id = '70000000-0000-4000-8000-0000000000b1'$q$);
select pg_temp.rejects($q$update public.portfolio_import_projects set created_by = '70000000-0000-4000-8000-00000000000f' where id = '70000000-0000-4000-8000-0000000000c1'$q$);
-- Ordinary edits remain available and keep the creator.
update public.cybersecurity_projects set description_ar = 'تعديل عادي', progress_percent = 10 where project_code = 'SEC-1';
update public.portfolio_mapping_reviews set review_status = 'approved', decision_note = 'Exact catalog identity confirmed' where id = '70000000-0000-4000-8000-0000000000d1';
reset role;
select pg_temp.assert((select created_by = '70000000-0000-4000-8000-00000000000a' and reviewed_by = '70000000-0000-4000-8000-00000000000b' from public.portfolio_mapping_reviews where id = '70000000-0000-4000-8000-0000000000d1'), 'creator kept; reviewer stamped by existing guard');

-- No authenticated session: only postgres maintenance may create rows.
set local role service_role;
select set_config('request.jwt.claims', '', true);
select pg_temp.rejects($q$insert into public.portfolio_import_batches(source_filename, source_sha256, created_by) values ('svc.xlsx', repeat('e', 64), '70000000-0000-4000-8000-00000000000f')$q$);
select pg_temp.rejects($q$insert into public.cybersecurity_projects(project_code, name_ar, portfolio_priority, created_by) values ('SEC-SVC', 'svc', 'P1', '70000000-0000-4000-8000-00000000000f')$q$);
select pg_temp.rejects($q$update public.cybersecurity_projects set archived_at = now(), archive_reason = 'svc' where project_code = 'SEC-1'$q$);
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.portfolio_import_batches(id, source_filename, source_sha256, created_by)
  values ('70000000-0000-4000-8000-0000000000b2', 'maintenance.xlsx', repeat('f', 64), '70000000-0000-4000-8000-00000000000b');
select pg_temp.assert((select created_by from public.portfolio_import_batches where id = '70000000-0000-4000-8000-0000000000b2') = '70000000-0000-4000-8000-00000000000b', 'postgres maintenance keeps explicit attribution');

-- 2) archived_by: stamped on archive, immutable while archived, cleared on unarchive.
set local role authenticated;
select pg_temp.as_user('70000000-0000-4000-8000-00000000000b');
update public.cybersecurity_projects set archived_at = now(), archive_reason = 'Superseded', archived_by = '70000000-0000-4000-8000-00000000000f' where project_code = 'SEC-1';
reset role;
select pg_temp.assert((select archived_by = '70000000-0000-4000-8000-00000000000b' and status = 'planned' from public.cybersecurity_projects where project_code = 'SEC-1'), 'archived_by = session (spoofed victim ignored); status untouched');
set local role authenticated;
select pg_temp.as_user('70000000-0000-4000-8000-00000000000a');
select pg_temp.rejects($q$update public.cybersecurity_projects set archived_by = '70000000-0000-4000-8000-00000000000a' where project_code = 'SEC-1'$q$);
select pg_temp.rejects($q$update public.cybersecurity_projects set archived_by = null where project_code = 'SEC-1'$q$);
update public.cybersecurity_projects set archive_reason = 'Superseded by new portfolio', description_ar = 'وصف' where project_code = 'SEC-1';
reset role;
select pg_temp.assert((select archived_by from public.cybersecurity_projects where project_code = 'SEC-1') = '70000000-0000-4000-8000-00000000000b', 'archived_by unchanged by later edits');
set local role authenticated;
select pg_temp.as_user('70000000-0000-4000-8000-00000000000a');
update public.cybersecurity_projects set archived_at = null, archived_by = '70000000-0000-4000-8000-00000000000f', archive_reason = 'left behind' where project_code = 'SEC-1';
reset role;
select pg_temp.assert((select archived_at is null and archived_by is null and archive_reason is null from public.cybersecurity_projects where project_code = 'SEC-1'), 'unarchive clears archived_at, archived_by and archive_reason');
set local role authenticated;
select pg_temp.as_user('70000000-0000-4000-8000-00000000000a');
update public.cybersecurity_projects set archived_by = '70000000-0000-4000-8000-00000000000f', archive_reason = 'not archived' where project_code = 'SEC-1';
reset role;
select pg_temp.assert((select archived_by is null and archive_reason is null from public.cybersecurity_projects where project_code = 'SEC-1'), 'active project cannot carry archive attribution');
set local role authenticated;
select pg_temp.as_user('70000000-0000-4000-8000-00000000000a');
update public.cybersecurity_projects set archived_at = now(), archive_reason = 'Re-archived' where project_code = 'SEC-1';
reset role;
select pg_temp.assert((select archived_by from public.cybersecurity_projects where project_code = 'SEC-1') = '70000000-0000-4000-8000-00000000000a', 're-archive stamps the new session actor');
-- A control owner cannot archive (existing project write RLS) and gains nothing from the trigger.
set local role authenticated;
select pg_temp.as_user('70000000-0000-4000-8000-00000000000c');
update public.cybersecurity_projects set archived_at = null where project_code = 'SEC-1';
reset role;
select pg_temp.assert((select archived_at is not null from public.cybersecurity_projects where project_code = 'SEC-1'), 'owner update filtered by existing RLS');

-- 3) Audit visibility matrix.
select pg_temp.assert((select count(*) from public.grc_audit_events where entity_type = 'portfolio_mapping_reviews' and control_id = -970001) > 0, 'mapping review events carry control_id');
create function pg_temp.visible(entity text) returns bigint language sql as $$ select count(*) from public.grc_audit_events where entity_type = entity $$;
create function pg_temp.visible_control_event() returns bigint language sql as $$ select count(*) from public.grc_audit_events where entity_type = 'evidence' and control_id = -970001 $$;
grant execute on function pg_temp.visible(text), pg_temp.visible_control_event() to authenticated;
set local role authenticated;
select pg_temp.as_user('70000000-0000-4000-8000-00000000000a');
select pg_temp.assert(pg_temp.visible('cybersecurity_projects') > 0 and pg_temp.visible('portfolio_import_batches') > 0 and pg_temp.visible('portfolio_import_projects') > 0 and pg_temp.visible('portfolio_mapping_reviews') > 0, 'admin reads all portfolio audit events');
select pg_temp.assert(exists(select 1 from public.grc_audit_events where entity_type = 'cybersecurity_projects' and previous_data->>'archived_at' is null and new_data->>'archived_at' is not null), 'admin reads archive events');
select pg_temp.assert(exists(select 1 from public.grc_audit_events where entity_type = 'cybersecurity_projects' and previous_data->>'archived_at' is not null and new_data->>'archived_at' is null), 'admin reads unarchive events');
select pg_temp.as_user('70000000-0000-4000-8000-00000000000b');
select pg_temp.assert(pg_temp.visible('cybersecurity_projects') > 0 and pg_temp.visible('portfolio_mapping_reviews') > 0 and pg_temp.visible('portfolio_import_batches') > 0 and pg_temp.visible('portfolio_import_projects') > 0, 'cybersecurity_team reads all portfolio audit events');
select pg_temp.as_user('70000000-0000-4000-8000-00000000000c');
select pg_temp.assert(pg_temp.visible('portfolio_mapping_reviews') = 0, 'control owner cannot read mapping review events on own control');
select pg_temp.assert(pg_temp.visible('cybersecurity_projects') + pg_temp.visible('portfolio_import_batches') + pg_temp.visible('portfolio_import_projects') = 0, 'control owner reads no portfolio events');
select pg_temp.assert(pg_temp.visible_control_event() = 1, 'control owner still reads non-portfolio events on own control');
select pg_temp.as_user('70000000-0000-4000-8000-00000000000d');
select pg_temp.assert(pg_temp.visible('portfolio_mapping_reviews') + pg_temp.visible('cybersecurity_projects') + pg_temp.visible('portfolio_import_batches') + pg_temp.visible('portfolio_import_projects') = 0, 'external auditor reads no portfolio events');
select pg_temp.assert(pg_temp.visible_control_event() = 1, 'external auditor still reads in-scope non-portfolio control events');
select pg_temp.as_user('70000000-0000-4000-8000-00000000000e');
select pg_temp.assert(pg_temp.visible('portfolio_mapping_reviews') + pg_temp.visible('cybersecurity_projects') + pg_temp.visible('portfolio_import_batches') + pg_temp.visible('portfolio_import_projects') = 0, 'other roles read no portfolio events');
-- Audit rows stay append-only for API roles.
select pg_temp.as_user('70000000-0000-4000-8000-00000000000a');
select pg_temp.rejects($q$delete from public.grc_audit_events where entity_type = 'cybersecurity_projects'$q$);
select pg_temp.rejects($q$update public.grc_audit_events set actor_id = null where entity_type = 'cybersecurity_projects'$q$);
reset role;
set local role anon;
select pg_temp.rejects($q$select 1 from public.grc_audit_events$q$);
reset role;
rollback;
select 'PASS: session-stamped created_by/archived_by, spoof and no-session rejection, immutability, unarchive clearing, portfolio audit visible to admin/team only';
