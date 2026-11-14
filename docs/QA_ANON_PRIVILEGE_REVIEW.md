# QA anonymous table privilege drift — release blocker

Date: 2026-11-01. Read-only catalogue inspection against **CGP-QA** (not a live attack simulation):

- `anon`: 31 public tables with INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER and REFERENCES; 33 with SELECT.
- All public ordinary tables showed RLS enabled; `pg_policies` returned zero policies with direct `anon` or `public` role assignment.
- **Critical distinction:** TRUNCATE is a table-level operation not governed by row-level security. The direct grants are overly broad even though normal PostgREST endpoints do not expose TRUNCATE as a standard CRUD operation.
- The analogous direct-grant inventory on the connected project named **CGP-DEV**, which Vercel production currently references, returned zero. QA configuration has drifted from that baseline.
- This observation does **not** establish exploitability of the deployed application's endpoints or prove that an unauthorized actor can obtain direct SQL connectivity.

## Proposed remediation

The separately reviewed and **unapplied** SQL file `QA_ANON_TABLE_GRANTS_REMEDIATION_PROPOSAL.sql` removes direct `anon` grants from public tables, in a transaction with a pre-commit verification. It is not yet a migration; do not execute until an approved backup, change review, and test plan are available.

## Evidence needed before release

1. Review whether public reads were ever intentionally required; no anonymous RLS policies were detected, but evaluate views/functions separately.
2. Review all direct public/anon grants on views, sequences, functions and storage separately.
3. Verify QA test identities, including external_auditor, using protected credentials.
4. Exercise anonymous denial and authenticated positive flows, evidence lifecycle, risk audit triggers and data governance approvals.
5. Review SQL privilege changes as a separate change; execute on QA only after authorization, measure effect, and document rollback.
6. Verify exact-head Preview deployment points to QA, record CI and UAT approvals.

**Status: BLOCKER.** No SQL has been executed and no production configuration has changed.
