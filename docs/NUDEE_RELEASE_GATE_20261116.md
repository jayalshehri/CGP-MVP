# Nudee release gate — 2026-11-16

This checklist describes evidence for PR #237. It is **not a production approval**.

## Confirmed checks (QA only)
- Isolated CGP-QA database has **364** Nudee requirements, with 364 unique source rows (2–365) in **14** domains.
- The imported QA data matches the preserved `nudee_requirements_import.csv` on **all 18 columns** by ordered aggregate MD5 comparisons. Empty strings and NULLs were normalized equivalently; progress is compared numerically.
- QA includes the initial workflow schema, requirement visibility fix, bulk-assignment RPC, and the dedicated `nudee_owner` role plus `nudee_assignees()` directory migration.
- A SQL transaction using impersonated `authenticated` sessions passed: unassigned owner sees no Nudee requirements; owner sees exactly its own assigned requirement; other owners see none; owner cannot view cybersecurity controls/projects or self-assign; office can assign, review, return for changes, and approve; audit history and reassignment guards work. A simulated `storage.objects` row confirmed database RLS and submission linkage. **All transaction effects were rolled back** and QA was checked again: zero assignments, submissions, audit rows, and storage objects remained.
- The current branch passed the **CGP Required CI** GitHub workflow, and the Vercel Preview for that SHA was **READY**. Both Nudee page paths returned HTTP 200 with `<html dir="rtl">`.


## Security follow-up — 2026-11-16 (automation run 5)
- Found and fixed an inconsistent inactive-account guard: `nudee_submissions_read` and `nudee_audit_read` previously checked assignment ownership but did not require `profiles.is_active`, unlike requirements, assignments and Storage.
- Added `20261116200000_nudee_inactive_assignee_visibility.sql` on the PR branch; applied the corresponding migration to **CGP-QA only** (success).
- Ran transaction-scoped RLS regression with two temporary QA principals and one temporary assignment, submission and audit event. Under `authenticated`, active assigned user successfully read exactly one submission and one audit entry; after marking the principal inactive, the user could read **zero** submissions, audits and requirements. The transaction ended with `ROLLBACK`.
- Post-check QA confirmed: **364** requirements, **0** assignments, **0** submissions, **0** Nudee audit rows and **0** `nudee-evidence` Storage objects.
- GitHub required CI for commit `877a616649dd2352075992997c3eb1dd48da397f` passed (run `43915246846`). The corresponding Vercel Preview was reported **READY**; this is not a visual/authenticated E2E check.
- Queried all QA `storage.objects` policies: Nudee read and upload are bucket-scoped, and other file policies are scoped to the separate `evidence-files` bucket. Actual binary upload/download through the Storage API remains **untested**.
- QA's `admin-invite-user` Edge Function is **not deployed** (QA currently lists no Edge Functions). Invitation and first-login tests remain a release blocker.
- Production schema, import, Edge Function, merge and alias are unchanged.

## Not yet verified — BLOCKING
1. A **real binary** upload, signed-link download, and subsequent decision using separate authenticated QA owner/reviewer sessions. SQL `storage.objects` insertion does **not** test storage service file bytes, signed URLs, or browser permissions.
2. **Visual** RTL layout on real mobile and desktop viewport sizes after authentication, plus interactive error/retry paths.
3. Invitation and first login of dedicated `nudee_owner`: the Edge Function source is updated in the branch, but the QA Edge Function has not been deployed or exercised.
4. Confirm all original Excel dashboard charts/series against the source workbook beyond the 18-field CSV import.
5. Production migration and dataset import have **not** been applied. Before rollout, deploy/update `admin-invite-user` in production only after all QA gates are green.

## Release sequence
1. Finish remaining E2E/visual tests in QA; fix defects on this branch and rerun required CI.
2. Confirm production schema compatibility and backup; apply the five Nudee migrations in sequence.
3. Import **exactly 364** original CSV records through a controlled administrative data operation (never commit actual source CSV to the code repository). Verify counts, uniqueness, domains, and 18-column baseline consistency before any production edits to Nudee status.
4. Deploy the updated `admin-invite-user` Edge Function to production and verify account creation for `nudee_owner`.
5. Merge only after all gates pass; wait for Vercel production deployment **READY**, then verify `cgp-mvp-grc13.vercel.app` resolves to that exact production deployment and smoke-test both authenticated Nudee routes.

**Do not merge, alias, or announce completion while any blocking item remains.**
