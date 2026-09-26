# P2-B4 isolated local certification (2026-09-26)

Scope: proposed `20260926163224_shared_findings_corrective_actions.sql`, SHA-256 `c88bdf87f23e01b374d24d55146b3133756e47657b9ff62ab8197ebeadc48667`.

This is local certification, **not** evidence that the migration has run on QA. The read-only QA baseline was 26 migrations, head `20260926160317`, with assessment cycles/items/item-evidence/legacy-findings counts `3/85/0/1` and the four legacy sector result counts `0/0/0/0`. P2-B3 grants were checked read-only: authenticated legacy writes false, anon assessment RPC EXECUTE false, authenticated assessment RPC EXECUTE true, direct `approved_snapshot` SELECT false. No QA write occurred.

Two independent local databases were cloned from one synthetic baseline (a local schema-only snapshot plus the existing archived-control guard). The proposed migration completed in both. The schema/security dump included functions, triggers, RLS policies and grants; with a fixed `pg_dump --restrict-key`, both outputs had the identical SHA-256:

`adc55ca1c40b475d68488ace04a0709753dc72c445b5cde7852f035248aef7ab`

Rollback-only synthetic checks passed in both clones:

- Direct anon/authenticated table writes denied; authenticated wrapper EXECUTE allowed and anon/PUBLIC denied.
- Control-owner assessment scope enforced; external auditor could not read an unapproved finding; `internal_audit` creation rejected until an independent source exists.
- One assessment item held two deliberately created shared findings; one finding held two corrective actions.
- Completing both actions left the finding open. Explicit submission, independent action verification, independent finding verification, and separate closure passed. Owner self-verification was rejected.
- A risk finding did not accept an arbitrary client-supplied control. A vulnerability finding inherited its existing linked control.
- Physical deletion and mutation of a finding after control archival were rejected; history remained readable.
- New finding/action inserts and a finding update produced central audit events with the expected entity IDs and before/after JSON values.
- Existing synthetic assessment cycle/item/legacy-finding/audit-event row counts were identical before and after migration and rollback-only tests.

Limitations: the local schema snapshot predates the latest QA schema and omits some runtime GRANTs; the test fixture supplied synthetic Auth rows and representative read grants. It is therefore not a certified exact-current-QA replay. Live QA migration application, post-application role tests, and authenticated visual review remain separate gates. No Production connection or write was made.
