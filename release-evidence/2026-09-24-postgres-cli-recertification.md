# CGP Production promotion execution-path recertification (2026-09-24)

Read-only Production; two isolated local replays. This is evidence, not authorization to promote Production. Supabase Support ticket `SU-483164` confirmed that hosted customer `postgres` migrations may alter policies on `storage.objects` through the managed policy-grant configuration. No migration SQL was edited.

## Inputs and CLI selection

- RC input: `399072ce510f729c5d7601abff7ee38d4dfbbecf`; original 14 SQL file hashes remain those in the [promotion manifest](../supabase/promotion/production_20260923.manifest.md).
- Updated role/CLI manifest SHA-256: `ef6e797d6765bbb95f60f486dc882031fae70e82899ed0c566d611231fb1c949`.
- Verified Production application history at inspection: 60 versions, head `20260921205600`, none of the 14 future versions registered. Production migration ledger owner: `postgres`; `storage.objects` owner: `supabase_storage_admin`; policy-grant configuration includes customer `postgres` for `storage.objects`.
- CLI version: 2.117.0. A temporary workspace with only 14 files failed the CLI history-consistency check because the 60 applied historical versions were missing locally; `--include-all` did not bypass it. The tested workspace contained 60 fail-closed historical guards (each raises if ever executed) plus exactly the 14 byte-for-byte certified SQL files. `db push --dry-run --skip-vault` selected exactly the 14 manifest files in order and neither QA-only `20260922000000` nor QA-historical `20260922040000`. No seed or roles file was selected.
- The original local baseline had a **test-environment-only** discrepancy: its `supabase_migrations.schema_migrations` table was owned by `supabase_admin`, unlike live Production. The first CLI attempt stopped before registering a migration. Two fresh clones were made from the verified baseline, and **only their local migration-ledger table ownership** was set to `postgres` to reproduce the observed Production owner. No Storage ownership, role membership, Production, QA, or original baseline was changed.

## Two clean CLI replays

The independent clones `cgp_pg_recert1b_20260924` and `cgp_pg_recert2b_20260924` were both created from `cgp_rc_baseline_20260923`, whose previously verified Production structural/business composite fingerprint was `74fc6e04480d5e2bd966e9f3a99fc99d26487ce432ffcd039d19e722e9a8dfe6`. Both ran `supabase db push --skip-vault` to a local-only database URL as customer `postgres`; all 14 files succeeded unchanged, including `20260922193112`, `20260922194306`, `20260922200059`, and Storage policy migration `20260922230300`.

The CLI recorded exactly 14 post-head versions/names in each `supabase_migrations.schema_migrations` ledger, producing 74 total rows with head `20260922230300`. A subsequent CLI dry-run showed zero pending migrations. Both runs matched one another **and** the retained earlier certified target:

| Invariant | Run 1 | Run 2 |
|---|---:|---:|
| Columns/defaults | 624 | 624 |
| Constraints | 321 | 321 |
| Indexes | 167 | 167 |
| Functions | 65 | 65 |
| Non-internal triggers | 65 | 65 |
| Policies / RLS tables | 91 / 53 | 91 / 53 |
| Public sequence-state digest | `d5e8550ee64f286d8e80832b78682056` | same |
| Framework-row digest | `bb32ffa94e2d57efbee05527615d93d2` | same |
| Control-row digest | `88c677b5c1e2a515d84fb454533691a2` | same |
| Mapping semantic/ID digest, excluding generated timestamps | `01ddaa8aea2fed8f46c769692147c977` | same |
| Function-definition digest | `9663193d359b2f25c2cd1dea750ac408` | same |
| Trigger-definition digest | `bf10b0086cc432751dbcb48767b0be0f` | same |
| Policy-definition digest | `fd24aa8250a1f1c9f2af40d38bf08bd1` | same |

Both runs: ECC active `108 control + 92 sub_control`; requirement mappings `235 total / 205 active / 30 superseded`; eight old ECC references retained with their original IDs and target `67`, all `rejected` (control links `2,18,47,68`; shared mappings `84,106,118,139`). The archived target remains distinct from current ECC `2-7-3`. Four CGP Storage policies are scoped to `authenticated`; seven Storage triggers and four catalog/archive/mapping guard functions are present. Authenticated regulatory-column UPDATE privilege is absent. There are zero duplicate control codes, duplicate active requirement mappings, orphan sub-controls, unvalidated foreign keys, or `QA_SYNTH` frameworks. The four assessment/scoring function definitions have the same digest `35713275e686e55e373590da86dd0902` as the unpromoted baseline, confirming no scoring formula change.

The tested CLI route requires exact ledger/hash/preflight checks before any future Production use. This evidence does **not** assert that the 14 migrations have been executed on Production.
