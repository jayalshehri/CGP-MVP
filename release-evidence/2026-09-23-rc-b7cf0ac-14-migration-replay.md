# RC `b7cf0ac9d864942e8668706e2ee7b998344a11f6` — isolated Production replay evidence

Captured 2026-09-23 UTC. This is a sanitized evidence record, not an authorization to promote Production. Production and QA were not changed by either replay. The two replay databases and the baseline database are local to the `supabase_db_ahfindosbawqfvhbcplq` Docker container and are retained temporarily for the next read-only audit. No dumps, credentials, tokens, personal records, or raw business rows are in this file.

## Inputs and preflight

- Production project: `ahfindosbawqfvhbcplq`; application migration head: `20260921205600` (60 history rows).
- Final committed manifest: [`supabase/promotion/production_20260923.manifest.md`](../supabase/promotion/production_20260923.manifest.md); SHA-256 `bcc91d88fb9f7d30f24b438c6419ef32dab707ee331da2210d2d9ba0ba77172b`.
- Fresh supplied Production dump SHA-256 values, for provenance only: `production_schema.sql` `1dd10bb690bd2e8edce279c08e0c9f1f17a0d6f9c8ab35acaf8bd074a9f348fc`; `production_private_schema.sql` `dae849e21b0c699c14ef9c266f47086fa60674e4911782392ed22a4b84dc5691`; `production_data.sql` `0778bccc7625a88f203edf22af9f0992927bcc7c6772c3d82e1d676e4cba35f9`.
- The isolated baseline restored those dumps, the minimum seven Auth user **IDs only** for FK reconstruction, one Storage bucket, nine Storage object metadata rows, 73 Storage migration-history rows, and 60 application migration versions/names. No Auth password, email, identity, session, MFA, or token data was copied.
- Live Production and isolated-baseline structural fingerprints matched exactly after setting the local inspection `search_path` to Production's `"$user", public, extensions`. They covered columns/defaults (614, `a8cdc8bd9378d0adca8a535df68f0383`), constraints (312, `11349d037ae82295b5091372f907b85c`), functions (61, `22edcdd63905a9fc7e07f6be8eddd820`), indexes (162, `d394f13fb57b8ee67fa562b097ed1651`), policies (91, `6a0c052497b53d24d5bb673cff2c2f48`), RLS table states (53, `d68ef0b4762d80639632fa1799018fef`), and triggers (35, `ef5ca9a67f3361313e71693d5c4a2de0`). This includes the Production/Storage triggers previously missing from an older baseline.
- Counts and canonical JSON-content digests matched Production for `frameworks` (6), `controls` (566), `cybersecurity_requirements` (58), `cybersecurity_projects` (42), project↔requirement rows (58), requirement↔control rows (200), control crosswalk rows (72), shared-control mappings (141), `evidence` (3), `assessment_cycles` (4), audit events (1629), Storage buckets (1), Storage objects (9), and Storage migrations (73).
- Composite SHA-256 over the sorted structural count/MD5 records and sorted business-table count/MD5 records: **`74fc6e04480d5e2bd966e9f3a99fc99d26487ce432ffcd039d19e722e9a8dfe6`**, identical in live read-only Production and the isolated baseline.

## Exact execution order

All file SHA-256 values were rechecked against the committed files before execution. Each SQL file was executed in full, in order, with `psql -X -v ON_ERROR_STOP=1`; its version/name was registered in that replay database's local migration ledger only after success. `postgres` and `supabase_admin` runner roles follow the manifest. Both runs started as separate clones of the same verified baseline, owned by `postgres` as in Production.

| # | Version and SQL file | SHA-256 | Runner | Run 1 | Run 2 |
|---:|---|---|---|---|---|
| 1 | `20260922010000_prod_safe_review_schedule_open_cycle_guard.sql` | `d48d92a9af5c14e3eae80f016b1856d44b6a4cf7a562aa88f691a6e844163c23` | postgres | PASS | PASS |
| 2 | `20260922020000_official_catalog_hierarchy_schema.sql` | `47a56149300a6f070ed268891f7ffede64d1131fca60fa5213ef0637f73800b9` | postgres | PASS | PASS |
| 3 | `20260922030000_official_catalog_data_correction.sql` | `d48d957b54af0095313df5bcda322252f24a955081c85d7cf587edd9ed2be621` | postgres | PASS | PASS |
| 4 | `20260922041000_prod_deterministic_mapping_review.sql` | `223f0658e13f75b6e3ae0a511af0daa075a4e62d65d3b420dc03412f6ad6df46` | postgres | PASS | PASS |
| 5 | `20260922050000_official_catalog_display_title_fix.sql` | `99a3cfd9c57ab1af3d0ab80ad230abd858b547cbc72a8ac0ed4543f94ade7446` | postgres | PASS | PASS |
| 6 | `20260922182000_regulatory_catalog_integrity_hardening.sql` | `447d3e5fe871b360052e9f270bf3faf06e6cb3887b076e9b02c7dd18869fc56c` | postgres | PASS | PASS |
| 7 | `20260922183000_prod_legacy_ecc_reference_transition.sql` | `40c369f8073ef137b355c5ec7bd42357c205c041cef52aa10ad213a4bb27584a` | postgres | PASS | PASS |
| 8 | `20260922184730_ecc_current_source_reconciliation.sql` | `ea2e840029395874e40eab7b8d671172d8748a35f6b2a356b72c91e4ca217802` | postgres | PASS | PASS |
| 9 | `20260922193112_isolate_archived_regulatory_controls.sql` | `0a2f4217c1970ac0a058113aa29722726258250ef03c8190a6dc704cc73fdc3a` | supabase_admin | PASS | PASS |
| 10 | `20260922194306_guard_archived_indirect_activity.sql` | `982815ee2cb06f295fd79b00cf52978930559d28a1cb406d87c0e10126aafef0` | supabase_admin | PASS | PASS |
| 11 | `20260922200059_superseded_requirement_mapping_lifecycle.sql` | `5f481d8a9a2b79049b8d48c9f9310e103ab0aacbb49b57e016a9f88c4afb4106` | supabase_admin | PASS | PASS |
| 12 | `20260922225351_20260922201500_cscc_asset_display_title_correction.sql` | `68c52dba8d5ef7aef53538e2268fd0b34c2c7ca881306de89f2ef867caf596d0` | postgres | PASS | PASS |
| 13 | `20260922230019_ccc_official_display_title_normalization.sql` | `3aace89c5324ed87410ea332f0c2f871dc281374a469a8be56ba02be3bdce5e9` | postgres | PASS | PASS |
| 14 | `20260922230300_storage_policy_authenticated_scope.sql` | `f5d7b79e749e9854bfb50c3ca27e6c81cb4b49ab00a98ec63e8e4a7a73ebb220` | supabase_admin | PASS | PASS |

Run databases: `cgp_rc_run1_20260923`, `cgp_rc_run2_20260923`; baseline: `cgp_rc_baseline_20260923`. Both local ledgers contain exactly these 14 post-head versions and neither QA-only `20260922000000` nor QA historical `20260922040000`. An earlier disposable clone failed at step 2 because its database owner was not `postgres`; both certified run databases were **recreated from the clean baseline with the Production owner** before the runs reported above. That discarded attempt is not counted as a replay pass.

## Post-run independent checks

Each row below matched exactly between Run 1 and Run 2. Fingerprints are MD5 of sorted catalog/mapping representations or PostgreSQL object definitions, not raw data exports.

| Category | Count | Both-run fingerprint |
|---|---:|---|
| Columns/defaults | 624 | `cbf30a47f026bd79aeabb11f05deaa02` |
| Constraints | 321 | `ff3d27af474fd42dc6c3fe891ba28fb9` |
| Functions | 65 | `912619059a2c9be66dd62f97aad96cdb` |
| Indexes | 167 | `d482a5be6b27f9ee7a5df5a5e48d30fb` |
| Policies | 91 | `5556e499596311284e7c0cb7c2bc6ba6` |
| RLS states | 53 | `d68ef0b4762d80639632fa1799018fef` |
| Enabled and disabled trigger definitions | 65 | `f47b14dae5676f1237ca46baaf9b08b6` |
| Framework semantics, excluding QA-only `QA_SYNTH` | 7 | `e7bfe350974cb1a1cca016f6de82acf7` |
| Catalog regulatory semantics, excluding QA-only `QA_SYNTH` | 664 | `45971348809313be1b6f0f22634b3ab1` |
| Requirement↔control mapping semantics | 235 | `93767f85689e6e7230f745d8e19d7659` |
| Requirement mapping identities | 235 | `608002fbe584e56180dc87ce8c19601f` |
| Control identities | 664 | `f4bff3fbea768c5b4ada5c3b141b0315` |
| Public sequence states | 43 | `16f767b08f0f46eb48541c360120bebd` |

The three semantic framework/catalog/mapping counts and fingerprints also matched live QA after excluding its `QA_SYNTH` fixture framework. Identity fingerprints compare **only the two Production replays**, because QA environment-specific IDs are not expected to match Production.

- Active ECC: **108 base + 92 sub-controls**; active requirement mappings **205**, superseded/historical **30**. No active mapping points to a retired control.
- All eight OLD ECC `2-7-3` references retain their original IDs and FK targets to the archived control, and are `rejected` in both runs: `control_framework_links` IDs **2, 18, 47, 68**; `shared_control_framework_mappings` IDs **84, 106, 118, 139**. The migration appends the historical rationale and does **not** create an automatic successor relationship to current ECC `2-7-3`.
- Four CGP Storage object policies target exactly `{authenticated}`. Seven Storage triggers, 19 direct archived-control guards, six indirect archived guards, two regulatory-catalog guards, and `private.grc_command` are present. `authenticated` has no UPDATE privilege on the tested regulatory columns.
- Zero duplicate `(framework_id, control_code)` values; zero duplicate active requirement/control pairs; zero orphan sub-controls; zero unvalidated foreign keys. Explicit anti-joins found zero orphan references across controls, requirement mappings, crosswalks, shared-control mappings, and project↔requirement links.
- `QA_SYNTH` frameworks: **0** in both replays. Neither QA-only migration was in either ledger. The approved manifest is not executed on Production.

Read-only auditor spot-check on the retained local run databases (replace the database name with Run 2 for comparison):

```sql
select version, name from supabase_migrations.schema_migrations
where version > '20260921205600' order by version;
select f.code, c.hierarchy_level, count(*)
from public.controls c join public.frameworks f on f.id = c.framework_id
where f.code = 'ECC' and f.is_active group by f.code, c.hierarchy_level;
select mapping_status, count(*) from public.cybersecurity_requirement_controls
group by mapping_status;
```

Result: **Run 1 PASS; Run 2 PASS; cross-replay structural, semantic, identity, and sequence determinism PASS.** This evidence does not assert that Production has been promoted.
