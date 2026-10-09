# AIEO Phase 2 — QA and first agent (proposal)

## Current deliverable
Manual-only QA smoke workflow with read-only repository token and approved QA Supabase project. It **does not** start an AI agent or run automatically. No production deployments or migrations.

## Human setup needed
1. Create GitHub Environment `cgp-qa` with appropriate reviewers.
2. Set environment variables `CGP_QA_BASE_URL` (approved QA/Preview URL), `CGP_QA_SUPABASE_URL` (QA project lkozjnpfufdpzqtzdxhe), `CGP_QA_PUBLISHABLE_KEY`.
3. Set environment secrets `CGP_QA_EMAIL` and `CGP_QA_PASSWORD` for a dedicated least-privilege synthetic QA identity.
4. Verify the QA app is linked only to QA Supabase and no production data or credentials are accessible.
5. Run the workflow manually and inspect authenticated role/RLS results. Never substitute production secrets.

## First AI agent design — not yet enabled
- Trigger: labeled GitHub issue or failed CI run, after filtering untrusted text.
- Initial permissions: read-only repository, issue metadata and sanitized logs.
- Output: triage report as an artifact; no automatic code writes in initial mode.
- Later: short-lived isolated runner and scoped token for creating a **draft PR** only.
- Limits: one issue per run, max two attempts, bounded token budget, timeout, allowlisted tools, no production environment, no service-role keys.
- Promotion gate: green CI, verified QA behavior, security review, and explicit human approval.

## Known limitations
- Existing `scripts/qa-smoke.mjs` uses a route smoke test and a limited authenticated RLS check, not a comprehensive E2E test suite.
- The workflow's environment variables/secrets are not yet configured by this change.
- Branch protection and GitHub repository visibility still require separate human review.
