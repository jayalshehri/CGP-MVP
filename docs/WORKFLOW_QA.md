# CGP live dashboard and workflow

The operational dashboard uses the `cgp_dashboard` security-invoker RPC. It aggregates all scoped rows in the database (no client row-limit truncation), refreshes every 30 seconds while visible, on window focus, and on demand. Failed reads hide KPIs instead of presenting zero as a successful result.

Control owners can read only assigned controls and their evidence/files. Active administrators and cybersecurity team members can read all controls. Anonymous and inactive users cannot read workflow data. Controls and control details now query using the authenticated browser session instead of the anonymous server client.

Compliance is implemented/compliant controls divided by scoped controls. Pending submissions count as awaiting review, not awaiting upload. A due date becomes overdue on the following calendar day in Asia/Riyadh. Empty scope returns zero and no domains.

Each new evidence submission becomes the current submission for that control; earlier files and decisions remain in history. The internal database triggers serialize by control, validate the uploader and file, and update the control in the same transaction. Review is restricted to admin/team and current pending evidence. Rejection requires notes. Acceptance sets implemented/accepted/verified; rejection sets in_progress/rejected/not_verified. Decisions store the authenticated reviewer UUID and an immutable audit entry. Stale or duplicate decisions fail without partial updates. Downloading evidence uses authenticated private storage access.

## Verification

- Production build and ESLint pass.
- Local HTTP smoke passes for /login, /, /controls, /tasks, /evidence, /review, /reports, /executive, /change-password.
- Browser confirms logged-out redirects to /login for protected routes; login renders with the existing RTL/navy/teal design.
- `supabase/tests/workflow.sql` passed against the connected database inside a transaction ending in ROLLBACK: owner/admin/team/inactive/anonymous scope, submission, rejection notes, resubmission, acceptance, control synchronization, reviewer audit, stale review prevention, live dashboard totals.
- Database tests use existing actors with transaction-local JWT claims and temporary fixture rows. They do not test real password login or physical Storage upload. All fixture/profile changes roll back; identity sequence gaps may remain.
- After explicit authorization, created two temporary QA accounts (owner and cybersecurity reviewer) and one fixture control. Real browser E2E on the local production build against connected Supabase PASSED: password login, task navigation, physical PDF upload, rejection requiring notes, owner visibility of rejection notes, resubmission, acceptance, control completion, and owner dashboard 100% compliance with zero overdue controls.
- Private Storage download returned bytes identical to the uploaded PDF. The in-app browser download event was not observable; the authenticated Storage API check verified content.
- Authenticated browser smoke rendered /controls, /evidence, /reports, /executive, and /change-password; owner access to /review redirected to the dashboard.
- Production deployment of e495275 is READY via GitHub main. Browser verification of production is pending temporary Vercel access authorization; HTTP checks currently encounter Vercel SSO redirects. Existing user accounts were not reset or used for test submissions.

Run `npm run qa` for route smoke. With NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, QA_EMAIL and QA_PASSWORD it also checks real sign-in, profile, unfiltered RLS reads, dashboard RPC and sign-out.

QA cleanup verified: both temporary auth accounts and sessions, the fixture control, both evidence records and their review entries, and both Storage files were removed. Original control and evidence records remain.

Remaining release acceptance check: browser smoke on the protected production URL when Vercel access is available. Automatic approval review rejected generating a temporary Vercel share URL; approval was requested separately. Production HTTP requests are redirected to Vercel SSO, so they are not claimed as successful authenticated application smoke tests.
