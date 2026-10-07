-- CGP-QA READ-ONLY audit visibility probe. Run once BEFORE and once AFTER
-- 20261007185235 (as postgres), in the same quiet window as preflight/post-check.
-- Simulates one existing active user per role through RLS and counts the
-- grc_audit_events rows each can read. Reads only; SET LOCAL/set_config are
-- transaction-scoped; ends in ROLLBACK.
-- Expected AFTER: admin/team portfolio_events > 0 (all four entities);
-- control_owner / nca_external_auditor / data_governance_team portfolio_events = 0;
-- other_events per role IDENTICAL to the BEFORE run (no other audit trail changes).
begin transaction read only;
-- Representative users (chosen deterministically; a role with no user shows NULL):
select set_config('cgp_probe.admin', coalesce((select user_id::text from public.profiles where role = 'admin' and is_active order by user_id limit 1), ''), true),
       set_config('cgp_probe.team', coalesce((select user_id::text from public.profiles where role = 'cybersecurity_team' and is_active order by user_id limit 1), ''), true),
       -- Prefer an owner of a control referenced by a portfolio mapping review (the exposure path).
       set_config('cgp_probe.owner', coalesce((select c.control_owner_id::text from public.portfolio_mapping_reviews r join public.controls c on c.id = r.control_id
         join public.profiles p on p.user_id = c.control_owner_id and p.is_active and p.role = 'control_owner' order by c.control_owner_id limit 1),
         (select user_id::text from public.profiles where role = 'control_owner' and is_active order by user_id limit 1), ''), true),
       set_config('cgp_probe.auditor', coalesce((select user_id::text from public.profiles where role = 'nca_external_auditor' and is_active order by user_id limit 1), ''), true),
       set_config('cgp_probe.governance', coalesce((select user_id::text from public.profiles where role = 'data_governance_team' and is_active order by user_id limit 1), ''), true);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', nullif(current_setting('cgp_probe.admin'), ''), 'role', 'authenticated')::text, true);
select 'admin' as role, current_setting('cgp_probe.admin') <> '' as has_user,
  count(*) filter (where entity_type in ('cybersecurity_projects', 'portfolio_import_batches', 'portfolio_import_projects', 'portfolio_mapping_reviews')) as portfolio_events,
  count(*) filter (where entity_type = 'portfolio_mapping_reviews') as mapping_review_events,
  count(*) filter (where entity_type = 'cybersecurity_projects') as project_events,
  count(*) filter (where entity_type not in ('cybersecurity_projects', 'portfolio_import_batches', 'portfolio_import_projects', 'portfolio_mapping_reviews')) as other_events
  from public.grc_audit_events;
select set_config('request.jwt.claims', json_build_object('sub', nullif(current_setting('cgp_probe.team'), ''), 'role', 'authenticated')::text, true);
select 'cybersecurity_team', current_setting('cgp_probe.team') <> '',
  count(*) filter (where entity_type in ('cybersecurity_projects', 'portfolio_import_batches', 'portfolio_import_projects', 'portfolio_mapping_reviews')),
  count(*) filter (where entity_type = 'portfolio_mapping_reviews'), count(*) filter (where entity_type = 'cybersecurity_projects'),
  count(*) filter (where entity_type not in ('cybersecurity_projects', 'portfolio_import_batches', 'portfolio_import_projects', 'portfolio_mapping_reviews'))
  from public.grc_audit_events;
select set_config('request.jwt.claims', json_build_object('sub', nullif(current_setting('cgp_probe.owner'), ''), 'role', 'authenticated')::text, true);
select 'control_owner', current_setting('cgp_probe.owner') <> '',
  count(*) filter (where entity_type in ('cybersecurity_projects', 'portfolio_import_batches', 'portfolio_import_projects', 'portfolio_mapping_reviews')),
  count(*) filter (where entity_type = 'portfolio_mapping_reviews'), count(*) filter (where entity_type = 'cybersecurity_projects'),
  count(*) filter (where entity_type not in ('cybersecurity_projects', 'portfolio_import_batches', 'portfolio_import_projects', 'portfolio_mapping_reviews'))
  from public.grc_audit_events;
select set_config('request.jwt.claims', json_build_object('sub', nullif(current_setting('cgp_probe.auditor'), ''), 'role', 'authenticated')::text, true);
select 'nca_external_auditor', current_setting('cgp_probe.auditor') <> '',
  count(*) filter (where entity_type in ('cybersecurity_projects', 'portfolio_import_batches', 'portfolio_import_projects', 'portfolio_mapping_reviews')),
  count(*) filter (where entity_type = 'portfolio_mapping_reviews'), count(*) filter (where entity_type = 'cybersecurity_projects'),
  count(*) filter (where entity_type not in ('cybersecurity_projects', 'portfolio_import_batches', 'portfolio_import_projects', 'portfolio_mapping_reviews'))
  from public.grc_audit_events;
select set_config('request.jwt.claims', json_build_object('sub', nullif(current_setting('cgp_probe.governance'), ''), 'role', 'authenticated')::text, true);
select 'data_governance_team', current_setting('cgp_probe.governance') <> '',
  count(*) filter (where entity_type in ('cybersecurity_projects', 'portfolio_import_batches', 'portfolio_import_projects', 'portfolio_mapping_reviews')),
  count(*) filter (where entity_type = 'portfolio_mapping_reviews'), count(*) filter (where entity_type = 'cybersecurity_projects'),
  count(*) filter (where entity_type not in ('cybersecurity_projects', 'portfolio_import_batches', 'portfolio_import_projects', 'portfolio_mapping_reviews'))
  from public.grc_audit_events;
select set_config('request.jwt.claims', '', true);
reset role;
rollback;
