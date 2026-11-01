# CGP-MVP — Internal Release Gate (QA only)

This is a **release-candidate validation aid**, not approval to merge or deploy. The implementation stays separate from AIEO draft-agent development.

## Verified platform inventory (2026-11-01)

- Vercel project: `cgp-mvp`. A production-target deployment from `main` reported READY, but READY is **not** user acceptance or application security certification.
- Supabase project `CGP-DEV`: `ahfindosbawqfvhbcplq`, ACTIVE_HEALTHY.
- Dedicated Supabase project `CGP-QA`: `lkozjnpfufdpzqtzdxhe`, ACTIVE_HEALTHY.
- The connected Supabase account currently lists **only CGP-DEV and CGP-QA**; no separately named production Supabase project was visible. The actual database backing the live Vercel domain must be established via approved environment configuration review before internal go-live; do not infer it from historical naming.
- DEV security advisor warned about authenticated execution of a SECURITY DEFINER data-governance transition function; source inspection showed role checks and separation-of-duties checks. Independently verify all bypass paths and grants rather than treating the warning as automatically exploitable or cleared.
- DEV password-breach protection is disabled. Review rollout in every relevant environment.
- Vercel project details report no project-level password, SSO, or trusted-IP protection. Application login and RLS may still restrict data, but internal-only access needs a separately approved access policy.
- Performance advisor reported 69 unindexed foreign keys in DEV; prioritize by measured query impact, not indiscriminate indexing.
- The existing QA smoke script can skip authenticated validation when credentials are absent. This gate refuses to run in that condition.

## Execute on dedicated QA only

Use a synthetic or otherwise explicitly authorized QA account. Configure secret values in a protected CI/QA environment; never commit passwords or keys.

```sh
CGP_BASE_URL=https://<QA-preview>.vercel.app \
QA_EXPECTED_ORIGIN=https://<QA-preview>.vercel.app \
NEXT_PUBLIC_SUPABASE_URL=https://lkozjnpfufdpzqtzdxhe.supabase.co \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<QA-publishable-key> \
QA_EMAIL=<QA-test-user> QA_PASSWORD=<QA-password> \
npm run qa:release
```

The QA origin must be independently approved, not inferred from a preview URL. The script rejects absent credentials, unknown Supabase projects, explicit production domains and an unapproved origin. It then invokes the existing read-only QA smoke flow (HTTP routes, sign-in, user profile, owner scoping where applicable, and dashboard). This does **not** prove full role-matrix authorization.

## Internal launch go/no-go checklist

- [ ] Fix or formally accept all actionable security advisories in the actual intended release environment
- [ ] Independently test Admin, Cybersecurity Team, Control Owner and External Auditor access (positive and negative cases); include forbidden direct SQL/API transitions
- [ ] Verify evidence upload/download lifecycle, RLS, storage policies, expired evidence, and audit trails using isolated QA test records
- [ ] Run release gate and capture authenticated PASS (not SKIP) on exact release commit and approved QA preview
- [ ] Validate project/control/requirement mapping, assessment cycles, risk register, reports, Arabic RTL and mobile UI
- [ ] Confirm real production database/project mapping; DEV/QA references are not production evidence
- [ ] Verify backups, restore drill, rollback procedure and application monitoring
- [ ] Confirm SSO/MFA, authorized internal network access, Vercel deployment protection and secret management
- [ ] Obtain security/QA/business owner approval for exact release commit
- [ ] Authorize separately before merge or any production deployment

**No production database changes, migrations, environment changes, automatic merges or deployments are part of this PR.**
