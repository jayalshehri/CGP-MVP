# CGP Production promotion manifest — design only (2026-09-23)

Source: current Production `ahfindosbawqfvhbcplq` application migration head `20260921205600`. Production is read-only; this manifest has **not** been executed there.

Apply **only** the following SQL files, in this order, in a separately approved maintenance window. Verify the SHA-256 of each file and its absent migration version immediately before execution. Use a runner with ownership privileges for Storage policy changes. Record the exact file text and effective version in the migration ledger after each successful transaction.

1. `20260922010000` — `20260922010000_prod_safe_review_schedule_open_cycle_guard.sql` — SHA-256 `d48d92a9af5c14e3eae80f016b1856d44b6a4cf7a562aa88f691a6e844163c23` — runner `postgres`.
2. `20260922020000` — `20260922020000_official_catalog_hierarchy_schema.sql` — SHA-256 `47a56149300a6f070ed268891f7ffede64d1131fca60fa5213ef0637f73800b9` — runner `postgres`.
3. `20260922030000` — `20260922030000_official_catalog_data_correction.sql` — SHA-256 `d48d957b54af0095313df5bcda322252f24a955081c85d7cf587edd9ed2be621` — runner `postgres`.
4. `20260922041000` — `20260922041000_prod_deterministic_mapping_review.sql` — SHA-256 `223f0658e13f75b6e3ae0a511af0daa075a4e62d65d3b420dc03412f6ad6df46` — runner `postgres`.
5. `20260922050000` — `20260922050000_official_catalog_display_title_fix.sql` — SHA-256 `99a3cfd9c57ab1af3d0ab80ad230abd858b547cbc72a8ac0ed4543f94ade7446` — runner `postgres`.
6. `20260922182000` — `20260922182000_regulatory_catalog_integrity_hardening.sql` — SHA-256 `447d3e5fe871b360052e9f270bf3faf06e6cb3887b076e9b02c7dd18869fc56c` — runner `postgres`.
7. `20260922183000` — `20260922183000_prod_legacy_ecc_reference_transition.sql` — SHA-256 `40c369f8073ef137b355c5ec7bd42357c205c041cef52aa10ad213a4bb27584a` — runner `postgres`.
8. `20260922184730` — `20260922184730_ecc_current_source_reconciliation.sql` — SHA-256 `ea2e840029395874e40eab7b8d671172d8748a35f6b2a356b72c91e4ca217802` — runner `postgres`.
9. `20260922193112` — `20260922193112_isolate_archived_regulatory_controls.sql` — SHA-256 `0a2f4217c1970ac0a058113aa29722726258250ef03c8190a6dc704cc73fdc3a` — runner `supabase_admin`.
10. `20260922194306` — `20260922194306_guard_archived_indirect_activity.sql` — SHA-256 `982815ee2cb06f295fd79b00cf52978930559d28a1cb406d87c0e10126aafef0` — runner `supabase_admin`.
11. `20260922200059` — `20260922200059_superseded_requirement_mapping_lifecycle.sql` — SHA-256 `5f481d8a9a2b79049b8d48c9f9310e103ab0aacbb49b57e016a9f88c4afb4106` — runner `supabase_admin`.
12. `20260922225351` — `20260922225351_20260922201500_cscc_asset_display_title_correction.sql` — SHA-256 `68c52dba8d5ef7aef53538e2268fd0b34c2c7ca881306de89f2ef867caf596d0` — runner `postgres`.
13. `20260922230019` — `20260922230019_ccc_official_display_title_normalization.sql` — SHA-256 `3aace89c5324ed87410ea332f0c2f871dc281374a469a8be56ba02be3bdce5e9` — runner `postgres`.
14. `20260922230300` — `20260922230300_storage_policy_authenticated_scope.sql` — SHA-256 `f5d7b79e749e9854bfb50c3ca27e6c81cb4b49ab00a98ec63e8e4a7a73ebb220` — runner `supabase_admin`.

Exclusions: `20260922000000_review_schedule_open_cycle_guard.sql` is QA-only. `20260922040000_mapping_review_refinement.sql` was already applied to QA and is immutable; Production uses the natural-key-ordered equivalent `20260922041000` instead. Do not register either exclusion in Production.

The Production-only `20260922183000` bridge must execute before the immutable QA-applied ECC `20260922184730` migration: it preserves and rejects eight references to the old ECC `2-7-3` identity before that migration's zero-reference check. QA did not apply this bridge because its old identity had no such references. Do not claim it was applied to QA.

QA applied the last three corrective migrations under the versions shown above. Their local file contents match the SQL recorded in QA history. Existing QA historical version `20260922184730` remains unchanged (SHA-256 `ea2e840029395874e40eab7b8d671172d8748a35f6b2a356b72c91e4ca217802`).

Never use raw `supabase db push` on the entire directory for this promotion. Halt if Production's head, any file hash, expected baseline cardinality, policy ownership, or the eight reviewed reference set differs. Do not infer successor mappings. Obtain separate approval before any Production write.
