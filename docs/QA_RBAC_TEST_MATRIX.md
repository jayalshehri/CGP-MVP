# CGP-QA authorization matrix — execution required

**Status: NOT EXECUTED.** The database has 1 admin, 2 cybersecurity_team and 3 control_owner profiles; no external_auditor profile currently. These are profile records, not proof of usable test credentials.

The matrix must run against exact-head QA preview and approved QA Supabase with **dedicated accounts**, using synthetic records only. Capture HTTP status, response body classification, current user role, expected outcome, and audit event ID without logging credentials or evidence contents.

| Operation | Admin | Cybersecurity Team | Control Owner | External Auditor |
|---|---|---|---|---|
| View permitted controls | Allow | Allow | Own assigned only | Only scoped assigned frameworks |
| View other owner's controls | Allow | Allow | Deny | Deny unless explicitly scoped |
| Edit controls implementation state | Only governed workflow | Only governed workflow | Deny direct mutation | Deny |
| View cyber risks | Allow | Allow | Assigned only | Deny unless separately authorized |
| Create or modify cyber risks | Allow | Allow | Deny | Deny |
| Submit evidence to own control | Test policy | Test policy | Test policy | Deny |
| Review evidence | Allow | Allow | Deny | Deny |
| Access approved shared evidence | Scope test | Scope test | Scope test | Scope test |
| Transition data governance requests | Allow with valid state | Deny | Deny | Deny |
| Approve own data governance request | Deny | Deny | Deny | Deny |
| Upload/read external auditor evidence | Test separately | Test separately | Deny | Scoped only |

Do not treat this table as implemented authorization; expectations must be reconciled against policy requirements and actual RLS/GRANT logic before testing.

## Prerequisites
1. Provision authorized *QA-only* external_auditor test identity, or mark that role as BLOCKED.
2. Review database grants and RLS; run negative checks through actual authenticated Supabase sessions, not administrative SQL.
3. Validate trigger-function restrictions on a copied set of synthetic QA risk and governance requests.
4. Use the QA-only release gate and require authenticated PASS with zero SKIP.
5. Do not merge/deploy or execute database changes without independent security approval.

## Current findings
- `anon` has direct EXECUTE grants on three SECURITY DEFINER functions in QA, explicitly confirmed by catalog ACL inspection.
- The trigger-helper functions are bound to risk and data-governance tables. They should remain callable by PostgreSQL's trigger machinery after removing direct API grants, but that must be regression-tested.
- The governance transition function has `auth.uid()`, active profile role checks, state constraints, and creator-approval separation. Direct anonymous EXECUTE should still be removed as least privilege; real negative-role testing is outstanding.
- Existing RLS policy predicates on controls, cyber_risks, evidence and governance requests are scoped by role, owner, or related accessible controls, but no real negative-user execution has yet been observed.
