# Retained QA assessment lifecycle fixture — RC `b7cf0ac9d864942e8668706e2ee7b998344a11f6`

This fixture is intentionally retained in **CGP-QA only** for a subsequent read-only audit. It is not Production promotion data. Do not clean it before the auditor inspects it. No credentials or personal Auth data are recorded here.

## Exact identifiers and lifecycle

- QA project: `lkozjnpfufdpzqtzdxhe`; framework: `QA_SYNTH` (active synthetic QA-only framework).
- Cycle `assessment_cycles.id = 5`, scope name `QA REGRESSION TEST — RC b7cf0ac — 2026-09-23`.
- Scoped scoring item `assessment_items.id = 23`, synthetic control `QA-C-01`; unscored snapshot items `24` and `25` remain for history.
- Gap/action `assessment_findings.id = 2`, status `open`, owner/due date/action plan present.
- Scoring item result `not_implemented`, review status `accepted`; this demonstrates an assessed gap with a corrective action rather than claiming regulatory compliance.
- Cycle transition: `draft → in_progress → under_review → completed → approved → closed`; final status `closed`, revision `8`, `approved_at` and immutable `approved_snapshot` present; next review date `2026-11-23`.
- Assessor, reviewer, and approver are **three distinct** active principals. The approver is a QA-only no-login Auth-ID/profile fixture `5dc52502-e2f2-48cb-b9f7-7a95ae24a913`, with no email, password, or Auth identity; it cannot sign in. Existing QA admin and cybersecurity-team principals performed assessment and independent review, respectively. The control-owner principal owns the corrective action. Their IDs are inspectable from the cycle and finding rows, not copied into this artifact.
- Commands used the actual `public.cgp_assessment_command` RPC under `SET LOCAL ROLE authenticated` and the applicable `auth.uid()` JWT-claim context. This exercises the database authorization path; the synthetic approver was not issued a real login token. Direct assessment-row writes were not used for the lifecycle.
- Negative SoD tests: reviewer attempted `save` and assessor attempted `review` and `approve`; each returned authorization error, with unchanged item/cycle revisions on privileged readback.
- Audit: `grc_audit_events` contains 13 cycle events, including one each for `start`, `submit`, `complete`, `approve`, `close`; item insert/update and finding insert audit events are also present. Reviewer and approval timestamps, actor separation, final snapshot and status were read back.

## Executive metric isolation

Before fixture creation, `public.cgp_assessment_summary()` included `QA_SYNTH` and would have exposed this synthetic cycle to the executive assessment portfolio. That was an actual QA-only contamination gap. The narrow QA-only function change in [`qa-only-regression-assessment-summary-isolation.sql`](qa-only-regression-assessment-summary-isolation.sql) excludes only `QA_SYNTH`; it leaves all scoring expressions unchanged. QA migration ledger version `20260923000701`, name `qa_regression_exclude_synthetic_assessment_summary`. The SQL contains a QA-only guard requiring both the synthetic framework and QA-only migration `20260922000000`. It is outside `supabase/migrations/` and the Production manifest and **must never be promoted**.

The executive summary digest was `923d221774c2930b29a6d386e1f8b51e` before this fixture and remained exactly that value after the cycle closed. The summary has no `QA_SYNTH` entry. The fixture is therefore excluded from this executive assessment metric; auditors should still inspect any other reporting path before treating it as regulatory data.

## Read-only auditor checks

```sql
select id, status, revision, assessor_id, reviewer_id, approver_id,
       approved_by, approved_at, next_review_date,
       approved_snapshot is not null as has_snapshot
from public.assessment_cycles where id = 5;
select id, control_code, is_scoring, compliance_status, review_status,
       reviewed_by, reviewed_at from public.assessment_items where cycle_id = 5;
select id, status, owner_id, due_date, action_plan
from public.assessment_findings where item_id = 23;
select action, actor_id, occurred_at from public.grc_audit_events
where entity_type = 'assessment_cycles' and entity_id = '5'
order by occurred_at, id;
select public.cgp_assessment_summary();
```

QA catalog/mapping pre- and post-fixture: ECC 108 base + 92 sub-controls; requirement mappings 205 active + 30 superseded; `authenticated` cannot UPDATE `controls.official_text_ar`; 19 direct archive guards and both retired ECC identities remain. No regulatory-catalog, mapping, or framework audit writes occurred during the fixture work. Production migration head remains `20260921205600`; its 566 controls, 200 mappings, and 4 assessment cycles are unchanged. The 14-migration Production manifest and scoring weights were not edited.
