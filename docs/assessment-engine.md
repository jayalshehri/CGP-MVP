# Unified framework assessments

CSCC, DCC, TCC and OSMACC use `AssessmentWorkspace` and the same database commands. The framework catalog remains the source of requirement text. Each cycle snapshots its catalog, version, scope and scoring units; imported results retain the original row in `legacy_source` and remain drafts.

## Operating workflow

1. Select a cycle or create a scoped draft. CSCC also requires a system.
2. Assign an assessor, reviewer and approver and set the due date. The assessor cannot be the reviewer or approver. The reviewer may also approve.
3. Confirm the scoring requirements. Leaf requirements are proposed, but a human must confirm scope; a parent and its descendants cannot both count.
4. Start the assessment. Save each result explicitly, with rationale and, for partial/noncompliance, an owner, action and due date.
5. Use the central evidence register to submit and review versioned evidence. Link the specific version to the assessment item.
6. Submit for independent review. Accept or request changes with a reason. Implemented/partial results need current, unexpired, centrally accepted evidence uploaded by someone other than the reviewer.
7. Complete review, then approve with a reason and the next review date. Approval freezes results, evidence references and a snapshot. Later evidence expiry is visible as follow-up, without rewriting historical compliance.
8. Track findings independently. Closing a finding requires the assigned independent reviewer, a reason and current accepted evidence. Completing a project or linking a control never closes a finding or grants compliance.
9. Reassessment creates a linked blank cycle. It preserves scope/version and prior history, and requires fresh role assignment and scope confirmation.

## Calculation contract

- Total = confirmed scoring requirements; parents selected only for context do not count.
- Completion = entered scoring results / total, including proposed not-applicable results. This is not compliance.
- Approved not-applicable = accepted NA results in an approved/closed cycle only.
- Approved compliance = accepted implemented scoring results / (total - approved not-applicable) × 100.
- Partial results do not receive invented fractional credit. Unassessed results stay in the applicable denominator.
- Draft/in-review compliance and zero denominators return null, rendered as “—”, never as 0% or 100%.
- Trend compares only linked approved cycles with equal framework version, scope name and scoring-code signature. Separate CSCC system scopes are not averaged.
- Browser display rounds at presentation only. SQL keeps numeric precision. Deadlines use Asia/Riyadh.

## Crosswalks

Existing imported mappings start pending. Review the complete reference, version and coverage boundaries, then obtain approval from another active team member. New links use the same workflow. Coverage types are reference, supports, partial and equivalent within a documented scope. None propagates a compliance decision. New evidence sharing requires an approved relationship and separate evidence review on the target control. Assessment acceptance rechecks both evidence and the relationship.

## Permissions and preservation

Direct authenticated writes to assessment records and crosswalks are disabled. Public invoker RPCs call private commands that validate the active actor, assignment, state and optimistic revision. Owners see only their assigned requirements/findings; external auditors see only approved cycles entirely within their authorized framework scope. No anonymous access is granted. Every write is recorded in the existing GRC audit store.

Legacy result tables are retained read-only. No production result/evidence is deleted or fabricated. Global control verification remains the existing independent GRC workflow; scoped assessment approval does not overwrite it.

## Verification

- `node scripts/test-assessment-metrics.mjs`: 12 calculation assertions.
- Run `supabase/tests/assessment_engine.sql`, `assessment_import_crosswalk.sql`, and `grc_lifecycle.sql` on an isolated database with the migration. Tests roll back their fixtures.
- The import test needs `assessment_legacy_seed.sql` **before migration in an isolated test database only**. Never seed production.
- Browser QA: local auth + isolated PostgREST; create draft, assign roles/due date, confirm scope, start and save a result; all five pages; desktop/mobile layout; reports.
- TypeScript, focused ESLint and Next production build.

## Release / rollback

Take schema/public-data backups first. Apply the additive database migration and release the matching UI together. Old clients cannot continue changing legacy results. If application rollback is needed, retain the new tables and audit history; do not drop them or restore legacy write grants blindly. A forward fix or a reviewed compatibility adapter is safer than reconciling two write paths.
