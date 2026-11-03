# CGP-MVP — Production Database Separation Runbook (pre-approval)
Date: 2026-11-03
Status: **PLAN ONLY — NO-GO / no project creation, data copy, secret inspection, merge, deployment or production configuration changes.**
Scope: launch CGP-MVP first; AIEO remains disabled for the launch.

## 1. Verified read-only baseline

| Item | Existing state |
| --- | --- |
| Current Vercel production Supabase URL project | `ahfindosbawqfvhbcplq` (named **CGP-DEV**) |
| Existing preview Supabase URL project | `lkozjnpfufdpzqtzdxhe` (named **CGP-QA**) |
| Dedicated production Supabase project | **Not identified** among accessible projects |
| Existing production Vercel release | `main`, SHA `59a97f263318c04d36142f239380e95b95592d6c`; Vercel reported READY |
| Release gate | [PR #109](https://github.com/jayalshehri/CGP-MVP/pull/109), still Draft; GitHub Required CI passed for prior PR HEAD `cc8ddf4b71bf2ad3a6f3d3002872bc60960a4faa` |
| GitHub code repository | Currently public; review classification before publishing any confidential code or artifacts |
| Vercel project-level access controls | No password, SSO or trusted IP protection enabled in inspected settings; application auth separately requires verification |

Read-only SQL snapshot taken 2026-11-03 (counts may change):

| Measure | CGP-DEV (currently used by Vercel Production) | CGP-QA |
| --- | ---: | ---: |
| public tables | 50 | 50 |
| public tables with RLS enabled | 50 | 50 |
| public RLS policies | 96 | 96 |
| auth users | 9 | 6 |
| profile rows | 9 | 6 |
| controls | 664 | 667 |
| cybersecurity_projects | 85 | 75 |
| Storage buckets | 1 | 1 |
| Storage objects | 9 | 17 |
| SECURITY DEFINER functions executable by anon | 0 | 3 |

**Interpretation:** Both environments contain nonempty, different data. Do **not** clone QA into production and do **not** discard/replace DEV; the current production target uses DEV. The counts do not classify records as real vs synthetic or prove what users have entered.

## 2. Conditions for approving a new CGP-PROD Supabase project

- [ ] Owner confirms the actual operational owner and data classification (personal lab vs organization data); no organization data into a personally owned environment without permission.
- [ ] Approve region, service plan, projected recurring cost and retention. Project creation can incur costs and must be approved separately.
- [ ] Confirm intended baseline schema migration set and current app release SHA; compare QA/DEV migration histories, extensions, enum values, functions, RLS, grants, triggers, bucket policies.
- [ ] Determine whether existing DEV rows (including auth identities and 9 stored files) are legitimate production data, test data or mixed. Make a **written data selection decision**; do not export user records, secrets or files for generic testing.
- [ ] Document application external dependencies (Auth, Storage, Realtime, scheduled jobs, SMTP/SSO, webhooks, API keys) before designing the cutover.
- [ ] Confirm source/target backups and a separately tested restore. Current review does **not** verify automated backups, PITR availability, successful restore, or recovery point/objective.
- [ ] Fix or formally accept actionable security advisory findings; verify role-specific positive **and negative** API tests. QA currently has 3 anon-callable SECURITY DEFINER functions (2 are trigger functions), despite all tables having RLS enabled.
- [ ] Confirm GitHub branch protections, private-source handling, access controls for the public deployment, MFA, key rotation/least privilege, and no AIEO production activation.

## 3. Migration and verification phases (future; do not execute until explicitly authorized)

**Phase A — Non-destructive blueprint:** freeze release candidate; identify source of truth; create a versioned, redacted catalog of schema/migrations/grants/storage policies; inventory Auth and Storage **counts**, without exporting private contents. Record target architecture and approved data selection. Store sensitive backups in protected storage, never GitHub or workflow artifacts.

**Phase B — Separate target:** only after owner approval, provision a dedicated CGP-PROD Supabase project with reviewed region, plan, minimal admin accounts, MFA, network/access restrictions and independent secrets. Existing DEV and QA remain unchanged.

**Phase C — Rehearse with synthetic data:** rebuild reviewed schema in CGP-PROD or a separate isolated rehearsal database as approved; compare schema signatures and RLS/grants; import only approved synthetic/test data first. Validate application flows, negative permission tests, Storage and Auth handling. A database dump alone does not guarantee a complete Auth/Storage/service configuration migration.

**Phase D — Data migration (only if approved):** obtain encrypted backup of approved source; verify checksum, restore and retention; migrate selected records with stable foreign keys; handle Auth users and Storage binary objects/policies through a separate tested procedure. Plan session reset/password reset where appropriate. Validate row counts and referential integrity, and independently test protected evidence access.

**Phase E — Controlled cutover:** plan downtime/write freeze or dual-write reconciliation; select immutable release commit and verified destination; capture old environment IDs/rollback path securely. Only after final Go authorization change the Vercel Production environment mapping to the new project and deploy the approved version. Confirm authenticated smoke, evidence file access, role-matrix authorization, logs, and data integrity. Do not assume a Vercel READY state means user acceptance.

**Phase F — Rollback:** if gates fail, stop writes, triage any new records created after cutover and reconcile **before** restoring old environment mappings; re-deploy the known-good version only after owner authorization. A blind env-var rollback may lose newly written data. Keep the old DB intact until agreed retention expires.

## 4. Go / No-Go evidence checklist

- [ ] Dedicated Production project and owner confirmed, pricing approved
- [ ] Exact release SHA approved (not simply latest PR)
- [ ] Production database mapping is independently verified
- [ ] Database roles/RLS/SECURITY DEFINER, Storage policies and Auth are validated
- [ ] Authenticated QA smoke on exact approved QA preview is PASS (not SKIP)
- [ ] Admin, Cybersecurity Team, Control Owner, External Auditor positive/negative tests PASS
- [ ] Evidence upload/download, assessment, risk, reporting, audit trails, RTL/mobile accepted
- [ ] Backup and **restore drill** independently PASS with measured RPO/RTO
- [ ] Deployment access, monitoring, alerts and secrets rotations approved
- [ ] Formal Security, QA, Business and release-owner signoff
- [ ] Separate explicit approval for any production DB/environment operation
- [ ] AIEO remains unactivated for initial CGP-MVP production release

## References

- [Official Supabase backup/restore migration guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Supabase Storage guidance](https://supabase.com/docs/guides/storage)
- [Supabase advisory: anonymous invocation of SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [Existing internal release gate](./INTERNAL_RELEASE_READINESS.md)

**Critical:** This document is a plan, not permission to create a project, copy user data, inspect secrets, modify Vercel environment variables, run a migration, merge code, or deploy Production.
