-- QA-ONLY REVIEW PROPOSAL. DO NOT RUN WITHOUT CHANGE APPROVAL AND VERIFIED BACKUP.
-- Baseline (2026-11-01): QA has anonymous table privileges across 31 public tables;
-- the connected DEV database's matching information_schema query returned zero.
-- This proposal revokes direct anon table privileges on the dedicated QA project.
-- Review the precise diff and test auth flows before applying; this does NOT
-- change auth schema, authenticated grants, RLS, roles, policies, or data.
begin;

do $qa_revoke$
declare
  r record;
begin
  for r in
    select distinct table_schema, table_name
    from information_schema.role_table_grants
    where table_schema='public' and grantee='anon'
  loop
    execute format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM anon',r.table_schema,r.table_name);
  end loop;
end
$qa_revoke$;

-- Fail closed before commit if ANY direct anon table grant remains on public objects.
do $qa_verify$
declare
  v_remaining integer;
begin
  select count(*) into v_remaining
    from information_schema.role_table_grants
    where table_schema='public' and grantee='anon';
  if v_remaining <> 0 then
    raise exception 'QA anonymous direct table grants remain: %',v_remaining;
  end if;
end
$qa_verify$;

commit;

-- Post-change: verify 0 direct anon grants on public tables and verify all
-- public table RLS remains enabled. Then run application regression tests
-- against QA-only accounts, including anonymous denial and authenticated flows.
-- Do NOT execute against the database backing live production.
