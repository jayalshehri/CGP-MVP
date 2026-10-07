-- CGP-QA READ-ONLY preflight for 20261007100000_portfolio_identity_audit_hardening.
-- Run on QA (lkozjnpfufdpzqtzdxhe) as postgres, immediately before applying.
-- Every row below must show ok = true. Record section 6 fingerprints and
-- compare them with the post-check. No writes: BEGIN READ ONLY ... ROLLBACK.
begin transaction read only;

-- 0) Environment
select current_database() as db, current_user as executing_role, version() as postgres_version, now() as checked_at;

-- 1) Ledger position: QA head is the cutover guards; hardening not yet recorded.
select 'ledger: 20261006102306 applied' as item, exists(select 1 from supabase_migrations.schema_migrations where version = '20261006102306') as ok
union all select 'ledger: 20261007100000 not yet applied', not exists(select 1 from supabase_migrations.schema_migrations where version = '20261007100000')
union all select 'ledger: no hardening recorded under another version', not exists(select 1 from supabase_migrations.schema_migrations where name ilike '%identity_audit_hardening%')
union all select 'ledger: nothing newer than 20261006102306', not exists(select 1 from supabase_migrations.schema_migrations where version > '20261006102306');

-- 2) Prerequisites the migration relies on.
select 'prereq: ' || label as item, ok from (values
  ('private.current_user_role()', to_regprocedure('private.current_user_role()') is not null),
  ('auth.uid()', to_regprocedure('auth.uid()') is not null),
  ('private.grc_audit()', to_regprocedure('private.grc_audit()') is not null),
  ('public.portfolio_import_batches', to_regclass('public.portfolio_import_batches') is not null),
  ('public.portfolio_import_projects', to_regclass('public.portfolio_import_projects') is not null),
  ('public.portfolio_mapping_reviews', to_regclass('public.portfolio_mapping_reviews') is not null),
  ('public.grc_audit_events', to_regclass('public.grc_audit_events') is not null),
  ('trigger guard_portfolio_activation', exists(select 1 from pg_trigger where tgname = 'guard_portfolio_activation' and tgrelid = 'public.cybersecurity_projects'::regclass)),
  ('constraint portfolio_archive_check', exists(select 1 from pg_constraint where conname = 'portfolio_archive_check' and conrelid = 'public.cybersecurity_projects'::regclass)),
  ('columns created_by on 4 tables', (select count(*) = 4 from information_schema.columns where table_schema = 'public' and column_name = 'created_by'
      and table_name in ('cybersecurity_projects', 'portfolio_import_batches', 'portfolio_import_projects', 'portfolio_mapping_reviews'))),
  ('columns archived_at/archived_by/archive_reason', (select count(*) = 3 from information_schema.columns where table_schema = 'public' and table_name = 'cybersecurity_projects'
      and column_name in ('archived_at', 'archived_by', 'archive_reason'))),
  ('RLS enabled on grc_audit_events', (select relrowsecurity from pg_class where oid = 'public.grc_audit_events'::regclass))
) as v(label, ok);

-- 3) Name collisions (all must be absent).
select 'collision: ' || label as item, not present as ok from (values
  ('function private.stamp_portfolio_creator()', to_regprocedure('private.stamp_portfolio_creator()') is not null),
  ('function private.stamp_project_archive()', to_regprocedure('private.stamp_project_archive()') is not null),
  ('any function named stamp_portfolio_creator/stamp_project_archive', exists(select 1 from pg_proc where proname in ('stamp_portfolio_creator', 'stamp_project_archive'))),
  ('any trigger named stamp_portfolio_creator/stamp_project_archive', exists(select 1 from pg_trigger where tgname in ('stamp_portfolio_creator', 'stamp_project_archive'))),
  ('policy portfolio_audit_events_team', exists(select 1 from pg_policies where tablename = 'grc_audit_events' and policyname = 'portfolio_audit_events_team')),
  ('policy portfolio_audit_events_restrict', exists(select 1 from pg_policies where tablename = 'grc_audit_events' and policyname = 'portfolio_audit_events_restrict'))
) as v(label, present);

-- 4) Current object inventory (for the record; post-check compares the delta).
select 'grc_audit_events policies' as inventory, string_agg(policyname || case when permissive = 'RESTRICTIVE' then ' (restrictive)' else '' end, ', ' order by policyname) as items
  from pg_policies where tablename = 'grc_audit_events'
union all
select 'triggers on ' || tgrelid::regclass::text, string_agg(tgname, ', ' order by tgname)
  from pg_trigger where not tgisinternal and tgrelid in ('public.cybersecurity_projects'::regclass, 'public.portfolio_import_batches'::regclass,
    'public.portfolio_import_projects'::regclass, 'public.portfolio_mapping_reviews'::regclass)
  group by tgrelid;

-- 5) Business counts that must not change (expected values from the approved QA state).
select item, actual, expected, actual = expected as ok from (values
  ('total projects', (select count(*) from public.cybersecurity_projects), 75),
  ('active projects', (select count(*) from public.cybersecurity_projects where archived_at is null), 43),
  ('archived projects', (select count(*) from public.cybersecurity_projects where archived_at is not null), 32),
  ('active P1', (select count(*) from public.cybersecurity_projects where archived_at is null and portfolio_priority = 'P1'), 18),
  ('active P2', (select count(*) from public.cybersecurity_projects where archived_at is null and portfolio_priority = 'P2'), 16),
  ('active P3', (select count(*) from public.cybersecurity_projects where archived_at is null and portfolio_priority = 'P3'), 9),
  ('staged projects', (select count(*) from public.portfolio_import_projects), 43),
  ('import batches validated', (select count(*) from public.portfolio_import_batches where status = 'validated'), 1),
  ('mapping reviews', (select count(*) from public.portfolio_mapping_reviews), 119),
  ('approved exact_match', (select count(*) from public.portfolio_mapping_reviews where match_status = 'exact_match' and review_status = 'approved'), 19),
  ('pending needs_review', (select count(*) from public.portfolio_mapping_reviews where match_status = 'needs_review' and review_status = 'pending'), 100),
  ('active exact project-control links', (select count(*) from public.cybersecurity_project_controls where mapping_review_id is not null), 19),
  ('historical project-requirement links', (select count(*) from public.cybersecurity_project_requirements), 58),
  ('archived rows with archived_by', (select count(*) from public.cybersecurity_projects where archived_at is not null and archived_by is not null), 32)
) as v(item, actual, expected);

-- 6) Fingerprints of stored business data (record; must be identical in the post-check).
select 'cybersecurity_projects' as fingerprint, count(*) as rows, md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text, '')) as md5 from public.cybersecurity_projects t
union all select 'portfolio_import_batches', count(*), md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text, '')) from public.portfolio_import_batches t
union all select 'portfolio_import_projects', count(*), md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text, '')) from public.portfolio_import_projects t
union all select 'portfolio_mapping_reviews', count(*), md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text, '')) from public.portfolio_mapping_reviews t
union all select 'cybersecurity_project_controls', count(*), md5(coalesce(jsonb_agg(to_jsonb(t) order by project_id, control_id)::text, '')) from public.cybersecurity_project_controls t
union all select 'cybersecurity_project_requirements', count(*), md5(coalesce(jsonb_agg(to_jsonb(t) order by project_id, requirement_id)::text, '')) from public.cybersecurity_project_requirements t
union all select 'table RLS policies (5 tables)', count(*), md5(string_agg(tablename || policyname || permissive || coalesce(qual, '') || coalesce(with_check, ''), '|' order by tablename, policyname)) from pg_policies
  where tablename in ('cybersecurity_projects', 'portfolio_import_batches', 'portfolio_import_projects', 'portfolio_mapping_reviews', 'cybersecurity_project_controls')
union all select 'table grants (5 tables + audit)', count(*), md5(string_agg(grantee || table_name || privilege_type, '|' order by grantee, table_name, privilege_type)) from information_schema.role_table_grants
  where table_name in ('cybersecurity_projects', 'portfolio_import_batches', 'portfolio_import_projects', 'portfolio_mapping_reviews', 'cybersecurity_project_controls', 'grc_audit_events');

-- 7) Apply window: no long-running transaction that the migration's short DDL locks would wait on.
select 'no transaction older than 60s' as item, not exists(select 1 from pg_stat_activity where xact_start < now() - interval '60 seconds' and pid <> pg_backend_pid()) as ok;

rollback;
