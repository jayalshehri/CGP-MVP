-- REVIEW-ONLY PROPOSAL — NOT AN AUTOMATIC MIGRATION.
-- Target: dedicated CGP-QA only, after security approval and backup.
-- Does not alter function definitions, triggers, RLS or business data.
-- PostgreSQL trigger execution remains triggered by table DML; direct RPC EXECUTE grants are not needed.
begin;

-- Stop direct API invocation of privileged trigger helpers.
revoke execute on function public.audit_cyber_risk_change() from public, anon, authenticated;
revoke execute on function public.log_data_governance_request_submission() from public, anon, authenticated;

-- Allow only a signed-in API caller to reach the already role-guarded transition function.
revoke execute on function public.transition_data_governance_request(bigint, text, text) from public, anon;
grant execute on function public.transition_data_governance_request(bigint, text, text) to authenticated;

-- Validate intended ACL before committing, using the separate read-only verification query.
commit;

-- Post-change review (should return: false false false for anon, false false true for authenticated).
select p.proname,
       has_function_privilege('anon',p.oid,'EXECUTE') as anonymous_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as signed_in_can_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'audit_cyber_risk_change',
    'log_data_governance_request_submission',
    'transition_data_governance_request'
  )
order by p.proname;

-- Important: independently test real trigger audit events on synthetic QA records and
-- authorized/non-authorized request transitions with separate roles before approval.
-- Do not run against the database backing production without a separately approved rollout.
