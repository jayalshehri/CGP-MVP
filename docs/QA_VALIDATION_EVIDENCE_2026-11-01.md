# QA validation evidence — 2026-11-01

Scope: **read-only** connected-service inspection. **Not** UAT sign-off, authenticated QA validation, or proof that production data is isolated in a browser session.

## Checks completed

| Check | Result | Evidence / qualification |
|---|---|---|
| QA database available | PASS | Supabase `CGP-QA` (`lkozjnpfufdpzqtzdxhe`): ACTIVE_HEALTHY |
| Public table RLS enabled | PASS (configuration only) | Read-only `pg_class` inventory: every public ordinary table returned `relrowsecurity = true` |
| QA profiles exist | PASS (inventory only) | 6 profile records; no credential-based login or role authorization verification |
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
