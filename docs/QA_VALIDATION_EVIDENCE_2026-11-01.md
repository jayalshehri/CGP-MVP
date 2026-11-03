# QA validation evidence — 2026-11-01

Scope: **read-only** connected-service inspection. **Not** UAT sign-off, authenticated QA validation, or proof that production data is isolated in a browser session.

## Checks completed

| Check | Result | Evidence / qualification |
|---|---|---|
| QA database available | PASS | Supabase `CGP-QA` (`lkozjnpfufdpzqtzdxhe`): ACTIVE_HEALTHY |
| Public table RLS enabled | PASS (configuration only) | Read-only `pg_class` inventory: every public ordinary table returned `relrowsecurity = true` |
| QA profiles exist | PASS (inventory only) | 6 profile records: 1 admin, 2 cybersecurity_team, 3 control_owner; no external_auditor profile found, and no credential-based role authorization verification |
| Storage object RLS enabled | PASS (configuration only) | `storage.objects` reports RLS enabled; actual per-bucket access policies still require negative tests |
| Preview env database selection | PASS (project config only) | Vercel project preview `NEXT_PUBLIC_SUPABASE_URL` references CGP-QA, production variable references CGP-DEV; values not committed |
| CI static checks | PASS | [CGP Required CI](https://github.com/jayalshehri/CGP-MVP/actions/runs/41298175968) including 9 fail-closed QA gate negative tests |
| Authenticated smoke | NOT RUN | A dedicated QA account and protected secrets were not used in this review |
| Live HTTP route smoke | NOT VERIFIED | Browser/network probe unavailable; Vercel READY is build availability, not route/function test |
| Exact HEAD QA preview | NOT VERIFIED | Earlier READY preview deployments on this branch do not prove the current head was deployed |

## Security findings requiring follow-up

- **QA:** Supabase security advisor flags three `SECURITY DEFINER` functions granted to `anon` and `authenticated`:
  - `audit_cyber_risk_change()`
  - `log_data_governance_request_submission()`
  - `transition_data_governance_request(bigint,text,text)`
- Catalog inspection confirms the first two are invoked as table triggers. Their direct RPC execution grants need review and likely revocation for public roles **without changing trigger behavior**. Do not execute an unreviewed blanket revocation.
- The transition function's intended authenticated caller and internal authorization must be reviewed. At minimum, anonymous RPC execute access is inappropriate without a documented need.
- Leaked-password protection disabled in QA.
- RLS enabled on all public tables does **not** prove the RLS policies enforce proper cross-role and cross-owner isolation.
- Production uses an environment variable referencing the project named `CGP-DEV`; owner must confirm this is the intended production database and document the operational control.

## QA go/no-go blockers

1. Security review and approved remediation of privileged public function execute grants.
2. Explicit approval and verification of **exact-head** QA preview URL and QA Supabase configuration.
3. Successful login and negative authorization matrix for Admin, Cybersecurity Team, Control Owner and External Auditor; no production identities.
4. Evidence lifecycle, reports, risks, compliance control and audit log functional coverage.
5. Backup/restore proof, monitoring and approved release/rollback owner.

No database mutations, credential reads, account creation, merges, or deployments were performed.

## Follow-up review (read-only)

- Existing QA function ACLs were inspected directly. All three privileged functions have explicit EXECUTE grants to both `anon` and `authenticated` (in addition to privileged roles).
- The risk and submission logging functions are trigger helpers; their definitions write audit records and rely on trigger row context.
- The request transition function contains active-user role authorization, state-transition constraints, and self-approval prevention. These are useful internal checks but do not justify anonymous EXECUTE.
- RLS policy predicates on `controls`, `cyber_risks`, `evidence`, and `data_governance_requests` were inspected; they require real negative-role session tests before acceptance.
- Prepared **review-only**, unapplied privilege fix in [QA_FUNCTION_EXECUTE_REMEDIATION_PROPOSAL.sql](QA_FUNCTION_EXECUTE_REMEDIATION_PROPOSAL.sql) and test cases in [QA_RBAC_TEST_MATRIX.md](QA_RBAC_TEST_MATRIX.md).
- CI [41298643091](https://github.com/jayalshehri/CGP-MVP/actions/runs/41298643091) succeeded on previous commit; new documentation-only commits still require exact-head verification.
