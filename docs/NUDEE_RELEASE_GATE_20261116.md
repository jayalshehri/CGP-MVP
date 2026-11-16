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


## QA follow-up — 2026-11-16 (next verification pass)
- Re-read PR #237 directly from GitHub: still **open, draft, unmerged** at head `74dad4f5347a0aade6b3d55b6a88d72c0753e7e1`.
- Re-verified CGP-QA via Supabase: **364** requirements, **364** distinct source rows, **14** domains; **0** assignments, submissions and evidence objects.
- Deployed the existing PR-branch `admin-invite-user` source **only to CGP-QA** (`lkozjnpfufdpzqtzdxhe`). Supabase confirms function `ACTIVE`, version **1**, `verify_jwt=true`. No invitations were issued and no end-user login was attempted. Production Edge Functions were not changed.
- Rechecked QA RLS policy inventory: each Nudee public table has an authenticated SELECT policy; `nudee-evidence` Storage has authenticated SELECT and INSERT policies. This inventory does **not** replace real binary upload/download tests.
- Confirmed required CI for previous PR head `74dad4f...` completed successfully (GitHub run `43916423274`). Vercel Preview for that head (`cgp-arf7jo6xv-grc13.vercel.app`) was **READY**.
- **QA invitation configuration blocker:** the function currently defaults `CGP_APP_ORIGIN` to the production URL if the environment secret is absent. A safe QA Preview origin/redirect and corresponding Auth redirect allow-list must be explicitly verified before sending QA invitations. Deployment alone is not a successful invitation test.
- Attempted to locate the original workbook in accessible conversation/library files; no relevant workbook was found. The **CSV-to-QA 18-column validation remains evidenced**, but chart/formula reconciliation against the original Excel workbook remains open.
- Browser-authenticated mobile/desktop screenshot checks and actual signed-URL binary Storage E2E are still **NOT RUN**; this environment lacks a usable authenticated interactive browser session. Keep PR draft and production unchanged.

## QA security and invitation routing — 2026-11-16 (next pass)
- Discovered an orphan-file exposure path: after a successful Storage upload followed by a failed submission RPC, an unsent object could remain under the assignment folder and become readable by a replacement assignee. Added migration `20261116213000_nudee_orphan_evidence_cleanup.sql` to block reassignment while any evidence objects remain and to permit tightly scoped removal of unsent objects. Updated the Nudee upload page to verify ambiguous RPC responses and attempt orphan cleanup after a confirmed failed submission. **No live Storage API deletion/upload has been exercised.**
- Applied the orphan-evidence SQL migration **to CGP-QA only**. A transaction-scoped test with a fake Storage metadata row confirmed that reassignment is rejected while orphan metadata exists. The transaction was rolled back; QA retains 364 requirements, zero assignments, submissions or Nudee Storage objects. A separate attempted direct SQL delete failed with Supabase Storage's intentional `storage.protect_delete()` guard; cleanup must be tested through the actual Storage API before release.
- Inspected Vercel's public environment URLs: **Preview targets CGP-QA** (`lkozjnpfufdpzqtzdxhe`), while production targets CGP-DEV (`ahfindosbawqfvhbcplq`). Confirmed that the Vercel branch alias `cgp-mvp-git-feature-nudee-evidence-workflow-grc13.vercel.app` exists.
- Fixed the QA-only invitation origin selection in `admin-invite-user`: the QA project now points activation links to the stable branch alias, not production, while CORS supports the approved CGP QA preview naming pattern. Deployed the revised function **to CGP-QA only**: ACTIVE v2, `verify_jwt=true`. Production function and redirects were not touched. Supabase Auth's redirect allow-list and an actual invitation/first login are **still unverified**.
- GitHub required CI for the orphan upload UI fix commit `5fbab33f83d2b706d9dfb5f99fcfa6c00536d352` passed (run `43933044329`); its Preview was READY at `cgp-9v38tuh75-grc13.vercel.app`. CI for the later Edge Function fix must be verified separately.
- Library and conversation file search found **no original Nudee Excel workbook**; unrelated cybersecurity KPI spreadsheets were excluded. The original 18-column CSV reconciliation remains valid but does not establish Excel chart/formula parity.

## Not yet verified — BLOCKING
1. A **real binary** upload, signed-link download, and subsequent decision using separate authenticated QA owner/reviewer sessions. SQL `storage.objects` insertion does **not** test storage service file bytes, signed URLs, or browser permissions.
2. **Visual** RTL layout on real mobile and desktop viewport sizes after authentication, plus interactive error/retry paths.
3. Invitation and first login of dedicated `nudee_owner`: QA Edge Function v2 is deployed, but Auth redirect allow-list, real invitation and activation are **not tested**.
4. Confirm all original Excel dashboard charts/series against the source workbook beyond the 18-field CSV import.
5. Production migration and dataset import have **not** been applied. Before rollout, deploy/update `admin-invite-user` in production only after all QA gates are green.

## Release sequence
1. Finish remaining E2E/visual tests in QA; fix defects on this branch and rerun required CI.
2. Confirm production schema compatibility and backup; apply the six Nudee migrations in sequence.
3. Import **exactly 364** original CSV records through a controlled administrative data operation (never commit actual source CSV to the code repository). Verify counts, uniqueness, domains, and 18-column baseline consistency before any production edits to Nudee status.
4. Deploy the updated `admin-invite-user` Edge Function to production and verify account creation for `nudee_owner`.
5. Merge only after all gates pass; wait for Vercel production deployment **READY**, then verify `cgp-mvp-grc13.vercel.app` resolves to that exact production deployment and smoke-test both authenticated Nudee routes.

**Do not merge, alias, or announce completion while any blocking item remains.**
