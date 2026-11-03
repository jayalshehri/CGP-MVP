-- REVIEW-ONLY PROPOSAL — NOT AN AUTOMATIC MIGRATION.
-- Target: dedicated CGP-QA only, after security approval and backup.
-- The operator must independently verify the target project before running.
-- Preserves function definitions, triggers, RLS and business data.
-- PostgreSQL DML triggers do not require API users to hold direct EXECUTE on trigger helpers.
begin;

revoke execute on function public.audit_cyber_risk_change()
  from public, anon, authenticated;
revoke execute on function public.log_data_governance_request_submission()
  from public, anon, authenticated;

-- Preserve expected signed-in calls; the function still enforces active profile role,
-- transition rules, and approval separation.
revoke execute on function public.transition_data_governance_request(bigint, text, text)
  from public, anon;
grant execute on function public.transition_data_governance_request(bigint, text, text)
  to authenticated;

-- Fail closed INSIDE the transaction, before COMMIT, if effective grants mismatch.
do $verify$
declare
  v_anon boolean;
  v_auth boolean;
  v_name text;
  v_expected_auth boolean;
begin
  for v_name, v_expected_auth in
    select 'audit_cyber_risk_change()', false
    union all select 'log_data_governance_request_submission()', false
    union all select 'transition_data_governance_request(bigint,text,text)', true
  loop
    select has_function_privilege('anon', ('public.' || v_name)::regprocedure, 'EXECUTE'),
           has_function_privilege('authenticated', ('public.' || v_name)::regprocedure, 'EXECUTE')
      into v_anon, v_auth;
    if v_anon is distinct from false or v_auth is distinct from v_expected_auth then
      raise exception 'QA privilege verification failed for %', v_name;
    end if;
  end loop;
end
$verify$;
commit;

-- After approval and execution, separately validate:
-- 1. anon/authenticated direct RPC grants as above, through SQL and API.
-- 2. trigger audit inserts from synthetic QA records still work.
-- 3. authenticated governance team transitions pass and unauthorized roles fail.
-- 4. NO statements are run against production until separately approved.
