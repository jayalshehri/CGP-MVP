-- CGP-QA READ-ONLY post-check for 20261007100000_portfolio_identity_audit_hardening.
-- Run on QA as postgres immediately after applying. Every ok must be true and
-- section 5 fingerprints must equal the preflight values. Then run
-- scripts/qa-portfolio-audit-visibility-probe.sql and compare with its BEFORE run.
-- No writes: BEGIN READ ONLY ... ROLLBACK.
begin transaction read only;

select current_database() as db, current_user as executing_role, now() as checked_at;

-- 1) Ledger record of the hardening (version as recorded by the chosen apply path).
select version, name from supabase_migrations.schema_migrations
 where version = '20261007100000' or name ilike '%identity_audit_hardening%' order by version;

-- 2) New objects exist exactly as reviewed.
select item, ok from (values
  ('function stamp_portfolio_creator body', (select md5(prosrc) = 'b5bc03526d443fb72414be1b30c85e65' from pg_proc where oid = to_regprocedure('private.stamp_portfolio_creator()'))),
  ('function stamp_project_archive body', (select md5(prosrc) = 'ab5d0cc0139689a7e37065952d6e6116' from pg_proc where oid = to_regprocedure('private.stamp_project_archive()'))),
  ('functions are SECURITY INVOKER with empty search_path', (select bool_and(not prosecdef and proconfig = array['search_path=""']) from pg_proc
      where oid in (to_regprocedure('private.stamp_portfolio_creator()'), to_regprocedure('private.stamp_project_archive()')))),
  ('no EXECUTE for public/anon/authenticated', not exists(select 1 from (values ('public'), ('anon'), ('authenticated')) r(role), (values ('private.stamp_portfolio_creator()'), ('private.stamp_project_archive()')) f(fn)
      where case when r.role = 'public' then exists(select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = to_regprocedure(f.fn) and a.grantee = 0 and a.privilege_type = 'EXECUTE')
                 else has_function_privilege(r.role, f.fn, 'EXECUTE') end)),
  ('stamp_portfolio_creator on the 4 tables, enabled', (select count(*) = 4 and bool_and(tgenabled = 'O') from pg_trigger where tgname = 'stamp_portfolio_creator'
      and tgrelid in ('public.cybersecurity_projects'::regclass, 'public.portfolio_import_batches'::regclass, 'public.portfolio_import_projects'::regclass, 'public.portfolio_mapping_reviews'::regclass)
      and pg_get_triggerdef(oid) like 'CREATE TRIGGER stamp_portfolio_creator BEFORE INSERT OR UPDATE OF created_by ON public.% FOR EACH ROW EXECUTE FUNCTION private.stamp_portfolio_creator()')),
  ('stamp_project_archive on cybersecurity_projects, enabled', (select count(*) = 1 and bool_and(tgenabled = 'O') from pg_trigger where tgname = 'stamp_project_archive'
      and pg_get_triggerdef(oid) = 'CREATE TRIGGER stamp_project_archive BEFORE INSERT OR UPDATE OF archived_at, archived_by, archive_reason ON public.cybersecurity_projects FOR EACH ROW EXECUTE FUNCTION private.stamp_project_archive()')),
  ('policy portfolio_audit_events_team: permissive SELECT to authenticated', exists(select 1 from pg_policies where tablename = 'grc_audit_events' and policyname = 'portfolio_audit_events_team'
      and permissive = 'PERMISSIVE' and cmd = 'SELECT' and roles = '{authenticated}')),
  ('policy portfolio_audit_events_restrict: RESTRICTIVE SELECT to authenticated', exists(select 1 from pg_policies where tablename = 'grc_audit_events' and policyname = 'portfolio_audit_events_restrict'
      and permissive = 'RESTRICTIVE' and cmd = 'SELECT' and roles = '{authenticated}')),
  ('pre-existing grc_audit_events policies unchanged', (select count(*) = 5 from pg_policies where tablename = 'grc_audit_events' and policyname in
      ('grc_scoped_read', 'grc_assessment_cycle_events', 'grc_crosswalk_events', 'grc_finding_events_team', 'grc_finding_events_restrict'))),
  ('grc_audit_events policies = preflight inventory + the 2 new ones', (select count(*) from pg_policies where tablename = 'grc_audit_events'
      and policyname not in ('portfolio_audit_events_team', 'portfolio_audit_events_restrict')) = 5)
) as v(item, ok);

-- 3) Pre-existing guards and audit triggers are still in place.
select 'still present: ' || name || ' on ' || rel as item, exists(select 1 from pg_trigger where tgname = name and tgrelid = rel::regclass) as ok from (values
  ('guard_portfolio_activation', 'public.cybersecurity_projects'), ('prevent_project_hard_delete', 'public.cybersecurity_projects'), ('grc_audit', 'public.cybersecurity_projects'),
  ('guard_portfolio_batch', 'public.portfolio_import_batches'), ('grc_audit', 'public.portfolio_import_batches'),
  ('guard_portfolio_source', 'public.portfolio_import_projects'), ('grc_audit', 'public.portfolio_import_projects'),
  ('guard_portfolio_staging_review', 'public.portfolio_mapping_reviews'), ('guard_activated_portfolio_review', 'public.portfolio_mapping_reviews'), ('grc_audit', 'public.portfolio_mapping_reviews')
) as v(name, rel);

-- 4) Business counts unchanged (same expectations as the preflight).
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

-- 5) Fingerprints: must be byte-identical to preflight section 6.
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

rollback;
