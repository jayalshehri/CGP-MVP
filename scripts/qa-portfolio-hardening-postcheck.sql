-- CGP-QA READ-ONLY post-check for 20261007185235_portfolio_identity_audit_hardening.
-- Run on QA as postgres immediately after applying. Every ok must be true and
-- section 5 fingerprints must equal the preflight values. Then run
-- scripts/qa-portfolio-audit-visibility-probe.sql (compare with its BEFORE run)
-- and, for actual behavior, scripts/qa-portfolio-hardening-behavior-probe.sql.
-- No writes: BEGIN READ ONLY ... ROLLBACK.
begin transaction read only;

select current_database() as db, current_user as executing_role, now() as checked_at;

-- 1) Ledger: the hardening is recorded exactly once, under the QA-applied version.
select item, ok from (values
  ('ledger: 20261007185235 portfolio_identity_audit_hardening', exists(select 1 from supabase_migrations.schema_migrations
      where version = '20261007185235' and name = 'portfolio_identity_audit_hardening')),
  ('ledger: recorded once (no duplicate under another version)', (select count(*) = 1 from supabase_migrations.schema_migrations where name ilike '%identity_audit_hardening%')),
  ('ledger: superseded draft version 20261007100000 absent', not exists(select 1 from supabase_migrations.schema_migrations where version = '20261007100000'))
) as v(item, ok);

-- 2) New objects, verified structurally (not by whitespace-sensitive raw text).
--    canon(f) = md5 of the body with -- comments removed, lower-cased and all
--    whitespace removed, so storage reformatting cannot cause a false failure.
with fn as (
  select p.oid, p.proname, p.prosecdef, p.proconfig, p.prolang, p.prorettype, p.pronargs, p.proretset, p.provolatile,
         md5(regexp_replace(lower(regexp_replace(p.prosrc, '--[^\n]*', '', 'g')), '\s+', '', 'g')) as canon,
         regexp_replace(lower(regexp_replace(p.prosrc, '--[^\n]*', '', 'g')), '\s+', ' ', 'g') as body
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname in ('stamp_portfolio_creator', 'stamp_project_archive')
)
select item, ok from (
  select 'functions exist (exactly 2, no overloads)' as item, (select count(*) = 2 from fn) as ok
  union all select 'functions: plpgsql trigger(), no args, not set-returning, volatile',
    (select bool_and(prolang = (select oid from pg_language where lanname = 'plpgsql') and prorettype = 'trigger'::regtype and pronargs = 0 and not proretset and provolatile = 'v') from fn)
  union all select 'functions: SECURITY INVOKER', (select bool_and(not prosecdef) from fn)
  union all select 'functions: search_path is empty', (select bool_and(array_length(proconfig, 1) = 1 and proconfig[1] in ('search_path=""', 'search_path=''''')) from fn)
  union all select 'stamp_portfolio_creator canonical body', (select canon = '1a8bd8891d2956a8dbcf77105a28498c' from fn where proname = 'stamp_portfolio_creator')
  union all select 'stamp_project_archive canonical body', (select canon = '7fbb29c9f2f7ce5fd813df4cb8249ba7' from fn where proname = 'stamp_project_archive')
  union all select 'creator: stamps auth.uid() and rejects no-session non-postgres',
    (select body like '%new.created_by := auth.uid()%' and body like '%current_user = ''postgres'' and session_user = ''postgres''%' and body like '%errcode = ''42501''%' from fn where proname = 'stamp_portfolio_creator')
  union all select 'creator: created_by immutable', (select body like '%created_by is immutable%' from fn where proname = 'stamp_portfolio_creator')
  union all select 'archive: stamps auth.uid(), clears on unarchive, immutable while archived',
    (select body like '%new.archived_by := auth.uid()%' and body like '%new.archived_by := null%' and body like '%new.archive_reason := null%'
       and body like '%archived_by is immutable while the project is archived%' from fn where proname = 'stamp_project_archive')
) checks
union all
select item, ok from (values
  ('no EXECUTE for public/anon/authenticated', not exists(select 1 from (values ('public'), ('anon'), ('authenticated')) r(role), (values ('private.stamp_portfolio_creator()'), ('private.stamp_project_archive()')) f(fn)
      where case when r.role = 'public' then exists(select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = to_regprocedure(f.fn) and a.grantee = 0 and a.privilege_type = 'EXECUTE')
                 else has_function_privilege(r.role, f.fn, 'EXECUTE') end)),
  ('stamp_portfolio_creator on the 4 tables, enabled', (select count(*) = 4 and bool_and(tgenabled = 'O') from pg_trigger where tgname = 'stamp_portfolio_creator'
      and tgrelid in ('public.cybersecurity_projects'::regclass, 'public.portfolio_import_batches'::regclass, 'public.portfolio_import_projects'::regclass, 'public.portfolio_mapping_reviews'::regclass)
      and pg_get_triggerdef(oid) like 'CREATE TRIGGER stamp_portfolio_creator BEFORE INSERT OR UPDATE OF created_by ON public.% FOR EACH ROW EXECUTE FUNCTION private.stamp_portfolio_creator()')),
  ('stamp_project_archive on cybersecurity_projects, enabled', (select count(*) = 1 and bool_and(tgenabled = 'O') from pg_trigger where tgname = 'stamp_project_archive'
      and pg_get_triggerdef(oid) = 'CREATE TRIGGER stamp_project_archive BEFORE INSERT OR UPDATE OF archived_at, archived_by, archive_reason ON public.cybersecurity_projects FOR EACH ROW EXECUTE FUNCTION private.stamp_project_archive()')),
  ('policy portfolio_audit_events_team: permissive SELECT to authenticated, team-only portfolio entities', exists(select 1 from pg_policies where tablename = 'grc_audit_events' and policyname = 'portfolio_audit_events_team'
      and permissive = 'PERMISSIVE' and cmd = 'SELECT' and roles = '{authenticated}' and with_check is null
      and regexp_replace(qual, '\s+', ' ', 'g') = '((entity_type = ANY (ARRAY[''cybersecurity_projects''::text, ''portfolio_import_batches''::text, ''portfolio_import_projects''::text, ''portfolio_mapping_reviews''::text])) AND (( SELECT private.current_user_role() AS current_user_role) = ANY (ARRAY[''admin''::text, ''cybersecurity_team''::text])))')),
  ('policy portfolio_audit_events_restrict: RESTRICTIVE SELECT to authenticated', exists(select 1 from pg_policies where tablename = 'grc_audit_events' and policyname = 'portfolio_audit_events_restrict'
      and permissive = 'RESTRICTIVE' and cmd = 'SELECT' and roles = '{authenticated}' and with_check is null
      and regexp_replace(qual, '\s+', ' ', 'g') = '((entity_type <> ALL (ARRAY[''cybersecurity_projects''::text, ''portfolio_import_batches''::text, ''portfolio_import_projects''::text, ''portfolio_mapping_reviews''::text])) OR (( SELECT private.current_user_role() AS current_user_role) = ANY (ARRAY[''admin''::text, ''cybersecurity_team''::text])))')),
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
