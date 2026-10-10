# AIEO Phase 5 — Auto-Fix security gates

Status: safety-gate prototype. Autonomous code modification is NOT enabled.

## Required before enabling a write-capable agent
1. Protect `main` with required PR review, CI checks, no force pushes/deletions, and no bypass.
2. Confirm the Vercel production deployment branch and secrets are isolated from all agent branches.
3. Run the agent in a sandbox with short-lived least-privilege credentials. Never expose production secrets, service-role keys or QA credentials to the repair job.
4. Treat CI logs, issue text and repository content as untrusted. Restrict file paths and validate actual diffs, not only path names.
5. Restrict changes to allowlisted low-risk UI files; require independent security review for auth, RLS, migrations, workflows, dependency or configuration changes.
6. Enforce per-task token and monetary budgets, concurrency 1, timeouts, two attempts maximum and a kill switch.
7. Run lint, typecheck, build and targeted regression checks before creating a draft PR. Require human approval before merge and deployment.
8. Ensure an isolated QA environment with synthetic data. Confirm no Production database access.
9. Test failure scenarios, rollback and audit logging. Never claim success solely from generating a patch.

The policy script here is an initial path-level gate, not a full content/diff validator. It does not grant write permissions or call AI.
