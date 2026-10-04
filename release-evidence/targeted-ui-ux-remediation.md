# Targeted UI/UX remediation — isolated RC3 feature

Base: `503fa64574aeb2887838be4d2366c3b252dff03b`.
Branch: `codex/targeted-ui-ux-remediation`.

## Boundaries and preserved contracts

- Evidence register: five compact summary columns; uploader/owner/description/decision metadata in an accessible full-width sibling detail row. Existing download/preview component, filters, counts, current-version decision eligibility and exact control/review destinations unchanged.
- Assessment portfolio: same RPC, filters, calculations and next-action precedence. Full-width table, labeled gap badges, progress and exact-cycle CTA. No average across scopes.
- Mapping: source → relationship → target → state before the review workspace. Existing RPC payload, revision/independence checks, filters, paging, CSV and print views preserved.
- Findings: existing source kinds only. Authorized SELECTs supply human-readable labels; selected IDs remain internal values. Pinned source context is resolved by exact ID, never substituted. Loading/unavailable/empty are separate. Missing/incomplete reads disable creation. Existing authoritative command remains unchanged and rechecks source eligibility/security.
- No S2-B files, canonical relationship contracts, S1 files, routes, migrations, policies, grants, RPC definitions or role semantics changed. P1 security finding is still OPEN; no attempt to remediate or bypass it.

## New Finding field classification

| Field | Classification | Handling |
|---|---|---|
| Title / problem description | USER MUST ENTER | Existing required validations preserved. |
| Source kind and source record | USER SELECTS only without pinned context | Select human-readable existing records; no manual numeric ID. |
| Pinned source kind/record | SYSTEM SHOULD DERIVE | Exact authorized URL record read; fixed type and readable reference. |
| Severity | USER SELECTS where already authorized | Existing values/default/role disabling; optional internal CGP guidance, explicitly not an NCA method. |
| Owner | OPTIONAL for team; existing owner-context assignment retained | No new assignment authority. |
| Due date | OPTIONAL | Existing empty-to-null payload preserved. |
| Source record ID | TECHNICAL — NOT EXPOSED AS INPUT | Internal selected value only. |
| Framework/control/assessment cycle | SYSTEM SHOULD DERIVE | Existing command derives from assessment source; no fabricated relationships. |
| Reference code, actor, timestamps, revision, lifecycle/audit fields | TECHNICAL / SYSTEM | Existing backend contract; not added to creation form. |
| Corrective actions | SEPARATE progressive workflow | Existing action creation/completion/independent verification/closure UI unchanged. Gap Treatments remain separate. |

## Architectural limitation (not implemented)

A control ID alone is not a supported Finding source record in the certified command. Internal audit remains reserved/disabled without its independent source register. Implementing those source kinds requires a separately approved architectural contract; no record ID is inferred or invented here. Assessment-item, risk and vulnerability sources use current tables/RLS and existing commands only.

## Validation evidence

- All existing `scripts/test-*.mjs`, including S1-A/B/C/D, IA-3, B5.1/B5.2, Assessment Journey and Control 360, rerun.
- Added `scripts/test-targeted-ui-remediation.mjs`: production-component SSR and source-query contract tests; no live network or writes.
- TypeScript after `next typegen`; changed-file ESLint; Webpack build. Local build uses nonfunctional loopback Supabase placeholders, not Production or QA credentials. Preview uses its own configured environment.
- Actual browser visual review: 1280×960, 1440×1000, 1920×1080; real production components/CSS and compiled Noto Sans Arabic font, deterministic synthetic fixtures. A 264px sidebar spacer reproduces the normal content budget. No release mock route exists.
- Checked populated/empty states, long Arabic/control/evidence names, expanded/collapsed content, badges, source-pinned/selectable/unavailable/empty states, guidance disclosure, RTL and page overflow. Expanded Evidence content does not stretch summary cells. A stretched severity select discovered in review was corrected with scoped top alignment.
- Local visual server is outside the release tree (`/private/tmp/cgp-targeted-visual-server.mjs`), fixed synthetic data, CSP forbids network/business submissions. It is not a live lifecycle certification and cannot write QA/Production.
- No uploads, workflow decisions, creates/updates/deletes or live fixture seeding during verification.

## Manual Preview review

### Area B corrective integration

Manual review found that the assessment portfolio component was not mounted in `/compliance`; the initial offline visual checks rendered it standalone and therefore did not certify page integration. The Compliance Center now renders the same portfolio below the framework cards using its existing authorized summary RPC response, with no second request. Existing assessment role restriction and normal Business `QA_SYNTH` exclusion are preserved. Summary failure is explicitly unavailable, never an empty result, and does not block framework navigation or expose raw errors.

Page-composition regression coverage now includes the section, all required columns, exact-cycle links, filters, empty/unavailable states and restricted-role presentation. All 16 test scripts, TypeScript, changed-file lint and Webpack build passed after this correction. Actual page-component local browser rendering at 1440px confirmed the integrated section, RTL and no horizontal overflow. Preview live visual certification is separate from this deterministic local check.

Use the feature Preview only. Open Evidence details, assessment cycles, Mapping details and the New Finding form. Do not save or execute a decision when reviewing. Unsupported source kinds remain outside this package.
