# P2-B4 shared findings: compatibility and rollout boundary

The new `grc_findings` and `grc_corrective_actions` tables are additive. An assessment item may have any number of new findings, and each new finding may have any number of separately tracked actions. Their only normal application write path is `public.cgp_finding_command`.

## Legacy assessment state

- `assessment_findings` remains the unified engine's historical, at-most-one-per-item record. Its existing automatic creation and approved-cycle snapshots are not rewritten by P2-B4.
- `assessment_items.corrective_action`, expected compliance dates, legacy sector result rows, and current assessment exports/reports retain their existing meanings and write paths. P2-B4 does not backfill or infer new findings from partial/non-compliant results.
- The assessment item now links to a separate, deliberately created shared-finding workspace. A user may create zero or multiple new findings without changing the item's score, result, or approval history.
- Until an explicitly reviewed reporting transition, legacy findings and shared findings must be reported as distinct series. Do not sum them as one count or assume matching item IDs imply the same finding. An eventual migration needs reviewed identity mapping, deduplication rules, and preserved original audit IDs.

## Source and evidence boundaries

- `assessment` links to a real `assessment_items` row; the cycle, control, and framework are derived by the database.
- `risk` links to a real `cyber_risks` row. The current risk register has no governed control link, so no arbitrary regulatory control is inferred.
- `vulnerability` links to a real `vulnerabilities` row and uses its existing `linked_control_id` when present.
- `internal_audit` is reserved in the source vocabulary but rejected by the command and source guard until a genuine independent audit record exists. Periodic control reviews are not reclassified as internal audits.
- `accepted risk` / `exception` are not finding statuses in P2-B4. Existing risk/vulnerability governance already has separate concepts, but no shared approval authority for overriding finding verification was established. Adding such a transition requires a distinct decision and authorization design.
- Corrective-action/finding verification can reference an existing, current evidence version directly on the control or shared through an accepted evidence link and approved cross-control mapping. The same eligibility predicate drives the Findings selector and command; the source control must remain active. No evidence file is duplicated. An expired, obsolete, invalid or archived-source version, or evidence with unknown/same uploader, cannot satisfy independent evidence verification. A reasoned verification decision without an evidence ID remains possible where no evidence requirement has been established.

## Rollout and regression gate

The migration must follow the applied P2-B3 QA security migrations (`20260926142039`, `20260926160317`). Apply it once with its exact filename/version through the reviewed QA migration procedure; do not issue raw corrective SQL or mark history by hand. Before deployment, review the migration and run QA role, SoD, archive, evidence, audit, cardinality, and lifecycle checks. Production promotion is a separate authorization.
