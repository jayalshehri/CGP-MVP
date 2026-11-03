# CGP-MVP — Production Database Separation Runbook (pre-approval)

Status: **Plan only / No-Go**. This is a public-repository-safe release checklist. Detailed infrastructure inventory, security findings, project identifiers, user counts and deployment links must remain in a restricted release record, **not in this public repository**.

## Purpose
- Launch CGP-MVP before activating AIEO.
- Separate development, QA and production data and credentials.
- Preserve the existing application and databases until cutover is approved, tested and reversible.
- Do not interpret passing CI or a READY deployment as business acceptance.

## Release gates
1. **Data ownership and classification:** authorized owner classifies current records, identities, uploaded evidence and secrets. Determine which records are legitimate production data versus fixtures. Never copy mixed data by default.
2. **Target approval:** owner approves dedicated Production project, selected region, costs and recurring budget. Creating a project is separately authorized.
3. **Source-of-truth review:** inventory database migrations, extensions, schemas, functions, grants, Row Level Security, Auth, Storage policies, scheduled jobs and integrations using read-only methods. Compare actual schema to immutable release commit.
4. **Backup + restore:** confirm source backup availability, encryption, retention, restore permissions and successful isolated restore drill. Define RPO and RTO before cutover.
5. **Separate environment:** provision Production with isolated service credentials, access restrictions, MFA, monitoring, and least-privilege permissions only after approval. Do not reuse DEV or QA keys.
6. **Synthetic rehearsal:** migrate reviewed schema and synthetic data into an isolated target; test Auth, Storage objects, foreign keys, role-level positive/negative API access, evidence lifecycle and audit trails.
7. **Selective migration:** only after an explicit data movement authorization, transfer approved data with encrypted backups and validated integrity. Auth identities, Storage binaries, secrets and service config need separate, verified procedures. Do not assume a SQL dump migrates them all.
8. **Controlled cutover:** freeze writes or establish reconciliation window; capture old configuration and rollback procedures securely. Update the Production environment only under final release approval, then run accepted authenticated smoke and security tests.
9. **Rollback:** stop writes, reconcile post-cutover records, validate rollback point, and restore the known-good application/environment mapping under authorization. Do not perform blind env-var reversal that could discard newly written data.
10. **Signoff:** require approved immutable release SHA and independent Security, QA, business, and release-owner decisions. Keep AIEO production disabled.

## Go / No-Go checklist
- [ ] Data owner and classification confirmed
- [ ] Dedicated Production project and estimated cost approved
- [ ] Source-of-truth migrations/RLS/functions/grants reviewed
- [ ] Security advisories resolved or formally risk accepted
- [ ] Full QA role authorization, evidence and audit trails tested
- [ ] Approved QA preview authenticated release gate PASS, not SKIP
- [ ] Production-specific Auth, Storage and access control settings verified
- [ ] Backup and **restore drill** independently validated
- [ ] Monitoring, incident response, change management and rollback documented
- [ ] Explicit production release and cutover approval granted

## References
- [Supabase project migration and backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Supabase Storage](https://supabase.com/docs/guides/storage)
- [Supabase Security Advisor](https://supabase.com/docs/guides/database/database-linter)
- [Existing internal QA readiness checklist](./INTERNAL_RELEASE_READINESS.md)

**No project creation, data export/copy, migration, secret access, Vercel configuration update, merge, production deployment or AIEO activation is authorized by this document.**
