-- CGP-QA READ-ONLY ledger reconciliation evidence. No writes; ends in ROLLBACK.
-- Run on QA (lkozjnpfufdpzqtzdxhe) only. NEVER on Production.
-- Purpose: decide a ledger-only `supabase migration repair` without re-running
-- any already-applied DDL/DML. Expected values come from a local replay of the
-- repository lineage (claude/qa-portfolio-integration).
begin transaction read only;

select current_database() as db, version() as postgres_version, now() as checked_at;

-- 1) Full QA ledger (compare against `ls supabase/migrations` in the repo).
select count(*) as ledger_rows, min(version) as first_version, max(version) as head from supabase_migrations.schema_migrations;
select version, name from supabase_migrations.schema_migrations order by version;

-- 2) The two QA-only originals and their production-safe equivalents.
select v.version, v.role, m.version is not null as in_qa_ledger, m.name as ledger_name
from (values
  ('20260922000000', 'QA-only original: open_cycle guard'),
  ('20260922010000', 'prod-safe equivalent (identical SQL)'),
  ('20260922040000', 'QA-only original: A-02 mapping review'),
  ('20260922041000', 'prod-safe equivalent (+ ORDER BY for 35 inserts)')
) as v(version, role)
left join supabase_migrations.schema_migrations m on m.version = v.version
order by v.version;

-- 3) Effects already present (both versions produce the same end state).
--    Expected from local replay: guard present = true; prosrc md5 = c5893acf851f536dbad5175c6a3b9465.
select pg_get_functiondef('private.grc_command(text,bigint,jsonb)'::regprocedure)
         like '%An open review cycle already exists for this control%' as open_cycle_guard_present,
       (select md5(prosrc) from pg_proc where oid = 'private.grc_command(text,bigint,jsonb)'::regprocedure) as grc_command_prosrc_md5;
--    Expected from local replay: 107 marked rows (72 annotated + 35 inserted), 77 still active
--    after the later superseded-mapping lifecycle migration.
select count(*) as a02_marked_rows,
       count(*) filter (where mapping_status = 'active') as a02_marked_active
from public.cybersecurity_requirement_controls
where notes like '%[Master-Catalog review 2026-09-21]%';

-- 4) Repository versions (83 files on claude/qa-portfolio-integration,
--    including 20261007185235, applied on QA 2026-10-07) missing from the QA ledger.
with repo_versions(version) as (values
  ('20260903000000'),
  ('20260903070000'),
  ('20260903222239'),
  ('20260903222506'),
  ('20260906000000'),
  ('20260906231500'),
  ('20260906233500'),
  ('20260907001500'),
  ('20260907013000'),
  ('20260907023000'),
  ('20260907033000'),
  ('20260907043000'),
  ('20260907060000'),
  ('20260908195919'),
  ('20260908213000'),
  ('20260908235500'),
  ('20260910010000'),
  ('20260910100000'),
  ('20260911090000'),
  ('20260911100000'),
  ('20260911120000'),
  ('20260911230000'),
  ('20260911231000'),
  ('20260911300000'),
  ('20260911301000'),
  ('20260911310000'),
  ('20260911320000'),
  ('20260911330000'),
  ('20260911340000'),
  ('20260911350000'),
  ('20260911360000'),
  ('20260911361000'),
  ('20260911362000'),
  ('20260911370000'),
  ('20260914010000'),
  ('20260914020000'),
  ('20260914021000'),
  ('20260915000000'),
  ('20260915010000'),
  ('20260915020000'),
  ('20260915030000'),
  ('20260915040000'),
  ('20260915050000'),
  ('20260915120000'),
  ('20260916101814'),
  ('20260916190939'),
  ('20260919120000'),
  ('20260919130000'),
  ('20260919150000'),
  ('20260920000000'),
  ('20260920010000'),
  ('20260920020000'),
  ('20260920030000'),
  ('20260920040000'),
  ('20260920050000'),
  ('20260920051000'),
  ('20260920060000'),
  ('20260920070000'),
  ('20260921000000'),
  ('20260921010000'),
  ('20260922010000'),
  ('20260922020000'),
  ('20260922030000'),
  ('20260922041000'),
  ('20260922050000'),
  ('20260922182000'),
  ('20260922183000'),
  ('20260922184730'),
  ('20260922193112'),
  ('20260922194306'),
  ('20260922200059'),
  ('20260922225351'),
  ('20260922230019'),
  ('20260922230300'),
  ('20260926142039'),
  ('20260926160317'),
  ('20260926163224'),
  ('20260926220727'),
  ('20260928004709'),
  ('20261006095402'),
  ('20261006095409'),
  ('20261006102306'),
  ('20261007185235')
)
select r.version as repo_version_not_in_qa_ledger
from repo_versions r left join supabase_migrations.schema_migrations m on m.version = r.version
where m.version is null order by 1;
-- QA ledger versions not present in the repository (e.g. the two QA-only originals).
with repo_versions(version) as (values
  ('20260903000000'),
  ('20260903070000'),
  ('20260903222239'),
  ('20260903222506'),
  ('20260906000000'),
  ('20260906231500'),
  ('20260906233500'),
  ('20260907001500'),
  ('20260907013000'),
  ('20260907023000'),
  ('20260907033000'),
  ('20260907043000'),
  ('20260907060000'),
  ('20260908195919'),
  ('20260908213000'),
  ('20260908235500'),
  ('20260910010000'),
  ('20260910100000'),
  ('20260911090000'),
  ('20260911100000'),
  ('20260911120000'),
  ('20260911230000'),
  ('20260911231000'),
  ('20260911300000'),
  ('20260911301000'),
  ('20260911310000'),
  ('20260911320000'),
  ('20260911330000'),
  ('20260911340000'),
  ('20260911350000'),
  ('20260911360000'),
  ('20260911361000'),
  ('20260911362000'),
  ('20260911370000'),
  ('20260914010000'),
  ('20260914020000'),
  ('20260914021000'),
  ('20260915000000'),
  ('20260915010000'),
  ('20260915020000'),
  ('20260915030000'),
  ('20260915040000'),
  ('20260915050000'),
  ('20260915120000'),
  ('20260916101814'),
  ('20260916190939'),
  ('20260919120000'),
  ('20260919130000'),
  ('20260919150000'),
  ('20260920000000'),
  ('20260920010000'),
  ('20260920020000'),
  ('20260920030000'),
  ('20260920040000'),
  ('20260920050000'),
  ('20260920051000'),
  ('20260920060000'),
  ('20260920070000'),
  ('20260921000000'),
  ('20260921010000'),
  ('20260922010000'),
  ('20260922020000'),
  ('20260922030000'),
  ('20260922041000'),
  ('20260922050000'),
  ('20260922182000'),
  ('20260922183000'),
  ('20260922184730'),
  ('20260922193112'),
  ('20260922194306'),
  ('20260922200059'),
  ('20260922225351'),
  ('20260922230019'),
  ('20260922230300'),
  ('20260926142039'),
  ('20260926160317'),
  ('20260926163224'),
  ('20260926220727'),
  ('20260928004709'),
  ('20261006095402'),
  ('20261006095409'),
  ('20261006102306'),
  ('20261007185235')
)
select m.version as qa_ledger_version_not_in_repo, m.name
from supabase_migrations.schema_migrations m left join repo_versions r on r.version = m.version
where r.version is null order by 1;

rollback;
