# P2-B5.2 decision safety policy

Baseline: `8d1088a042bf6239827b05c4c9a6e263fb36501d`. No database/security changes.

| Work type | Policy | Contract/context basis |
| --- | --- | --- |
| EVIDENCE_REVIEW | INLINE_SAFE **only for direct evidence after material inspection** | Exact version/file preview/download, full control context, current state, responsibility, mandatory reason and explicit confirmation. Shared evidence remains open-record because link/target-cycle context differs. |
| ASSESSMENT_ITEM_REVIEW | OPEN_RECORD_REQUIRED | Official requirement, result, rationale and eligible evidence must be examined in the item workspace. |
| ASSESSMENT_REVIEW_COMPLETION | OPEN_RECORD_REQUIRED | Whole-cycle scope, item reviews and readiness, not the queue summary. |
| ASSESSMENT_APPROVAL | OPEN_RECORD_REQUIRED | High-impact approved snapshot/history, approver/SoD, readiness and reassessment decision. |
| CORRECTIVE_ACTION_VERIFICATION | OPEN_RECORD_REQUIRED | Action implementation, completion evidence and independent verifier context. |
| FINDING_VERIFICATION | OPEN_RECORD_REQUIRED | Full finding, all actions and eligible evidence; completion does not verify a finding. |
| FINDING_CLOSURE | OPEN_RECORD_REQUIRED | Explicit closure by recorded verifier after fresh action/evidence checks; separate from verification. |
| PERIODIC_REVIEW_FOLLOWUP | NO_MUTATION | Navigate to the existing periodic workflow in Control 360. |

## Existing authority, not a new engine

- `20260903222239_secure_cgp_workflow.sql`: `public.cgp_review_evidence(bigint,text,text)` locks the control and updates only a current pending/under-review version.
- `20260916101814_grc_review_lifecycle.sql`: `private.cgp_prepare_evidence` rechecks active role, uploader independence, reviewer assignment, state, reason and acceptance expiry. No admin SoD override. The shared-link command has different link/open-cycle checks and is deliberately not inline.
- The same migration's `private.cgp_sync_evidence` records `evidence_reviews` and refreshes evidence/request summaries. Existing `grc_audit` triggers record before/after data. No frontend audit writes or replacement commands.
- `20260916190939_unified_assessment_engine.sql`: item review/completion/approval and snapshot transitions stay in their existing assessment workspace/RPC.
- `20260926163224_shared_findings_corrective_actions.sql`: action completion, independent verification and explicit closure stay separate. P2-B3, P2-B4.2 and P2A1 contracts are unchanged.

## Inline guard and uncertainty handling

Only admin/cybersecurity-team can open the direct-evidence decision dialog; control owners and external auditors receive no mutation action. The dialog reads the authorized register and full control context, then reauthenticates and rereads the same version immediately before invoking the existing RPC. A fingerprint mismatch prevents the call. The frontend fingerprint is **not** an atomic revision parameter: backend locking/state/SoD checks remain authoritative, and no new CAS contract is claimed.

All decisions require a reason and explicit acknowledgement of inspecting the exact file/version. Acceptance is not selected by default. Opening the dialog never claims/assigns work. Assigned and independent-team labels remain distinct. The UI does not claim it can prove a human actually read a file.

Authorization, SoD, stale, input validation, network uncertainty and other backend failures have separate sanitized messages. No raw database text, automatic retry or apparent success after rejection. A network failure may have an uncertain outcome, so the user must inspect fresh record state before retrying. Successful command execution remains reported as saved even if subsequent reads fail.

After a decision, only the shared evidence input is refreshed and dependent queue projections rebuilt; other cached categories are not reset. Read failure means unavailable counts, not zero. Filter/paging URL is untouched (page display may clamp if its last row disappears). Full-record return links retain the review context.

## Certification boundary

`scripts/test-review-inline-decisions.mjs` executes mocked production adapters, decision guards, failure paths, freshness checks, rendered queue/modal assertions and refresh behavior; no live service is contacted. Existing B5.1 and compliance UI suites remain regression gates. Live QA mutation certification requires separate authorization after visual review. This package contains no migration, RPC definition, RLS/grant, scheduler, scoring or lifecycle change.
