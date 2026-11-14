# CGP-QA live execution evidence — 2026-11-01

## Scope and limitations
All evidence below was collected from real connected GitHub, Vercel and Supabase services. It is **not** a signed UAT, authenticated end-to-end run, or permission to deploy.

## Executed
- GitHub Actions CGP Required CI #41299861392: **PASS** (npm ci, ESLint, QA negative guards, Next typegen, TypeScript, synthetic build).
- Vercel Preview `https://cgp-cr2yciv06-grc13.vercel.app` (READY deployment on earlier commit `e800f1cb...`): real unauthenticated HTTP fetches returned **200** for all 10 routes: `/`, `/login`, `/controls`, `/tasks`, `/evidence`, `/review`, `/reports`, `/executive`, `/change-password`, and `/risks`. HTTP 200 is only a route smoke result; it does not demonstrate authenticated client-side rendering, data access, workflow correctness or RBAC.
- Supabase CGP-QA project state: **ACTIVE_HEALTHY**.
- Public ordinary tables: catalog RLS **enabled**; `storage.objects` RLS **enabled**. Policy enforcement for distinct identities has not been proven by a browser/client session.
- Role profile inventory: 1 admin, 2 cybersecurity_team, 3 control_owner; 0 external_auditor.
- Direct `anon` SQL table grants: on 31 public tables for INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES and 33 for SELECT. This is a hardening **blocker**, despite RLS being enabled.
- QA advisor: three elevated SECURITY DEFINER functions have direct EXECUTE grants to both `anon` and `authenticated`. Two are trigger helpers; the transition function contains internal role/state checks. Privilege remediation proposals are prepared but **not applied**.
- Leaked-password protection: disabled in QA.

## Blocking prerequisites and reasons
1. **Authenticated QA:** The Vercel environment inventory contains public Supabase connection variables, but no configured `QA_EMAIL`/`QA_PASSWORD`/role-specific test secret. Do not extract or copy real user passwords or production identities; provision QA-only protected accounts/secrets instead. Without these, login and negative cross-role tests cannot honestly be marked PASS.
2. **Actual latest release:** READY preview observed above is an earlier commit, not the current head of PR #109. Exact-head application validation is still required.
3. **Data hardening:** No independently verified backup/restore test and no approved change window or rollback evidence was available. Do not execute blanket privilege revocations as a substitute for testing.
4. **External auditor:** No such QA profile exists for role-matrix execution.
5. **Full functional/UAT:** CRUD/evidence lifecycle, approvals, real browser interactions, auditor segregation and restore require approved, isolated synthetic QA data and dedicated identities.

## Go / No-Go
**NO-GO.** The live route checks and CI are real successes; the authenticated permission matrix, privilege cleanup, and exact-head UAT remain unverified. No database write, migration, account creation, merge or production deploy was executed.
