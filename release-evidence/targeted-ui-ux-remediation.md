# Targeted UI/UX remediation — isolated RC3 feature

Base: `503fa64574aeb2887838be4d2366c3b252dff03b`.
Branch: `codex/targeted-ui-ux-remediation`.

## Boundaries and preserved contracts

- Evidence register: eight compact summary columns (evidence, control, framework, owner, version, state, expiry, actions); uploader/description/decision metadata in an accessible full-width sibling detail row. Existing download/preview component, filters, counts, current-version decision eligibility and exact control/review destinations unchanged.
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

## Manual review correction pass after b1d7f61

- Area A: restored the original eight-column operational hierarchy and explicit preview/download/open-control actions. Retained the separate eight-column-spanning details row and all detail metadata. Expiry is a compact badge (valid, within 30 days, expired, unspecified), derived through the existing Riyadh-calendar `scheduleState` helper; no stored value, eligibility or authority change.
- Area B: no code changes in this correction. The approved Compliance Center placement below framework cards, table, filtering and exact-cycle links remain unchanged.
- Area C: hid the prominent proposal-creation entry only; dormant creation implementation and command contract remain intact. Reads, filters, counts, review workflow, permissions and routes were not changed.
- Area D: numbered the four approved questions, added short guidance, used a compact two-column desktop form, and grouped optional owner/due fields. Native severity disclosure remains closed by default; complete internal CGP guidance and NCA disclaimer remain available. Inputs, handlers, source identity and commands are unchanged.

### Mapping count investigation (read-only QA)

Authenticated QA Admin on the reviewed feature Preview showed zero matching rows with empty search and all filters set to All. The QA project is `lkozjnpfufdpzqtzdxhe` (CGP-QA). A read-only catalog/data inspection returned **0 underlying `public.control_framework_links` rows and 0 `public.cgp_crosswalk()` rows**. The function remains STABLE, security-invoker, with an empty search_path and the existing control/framework joins. The existing authenticated team-read policy permits admin/cybersecurity_team. No QA data was changed.

Compared the complete page read effect, visible-row filtering and framework-option derivation with RC3: unchanged. Deterministic production-page tests preserve 72 supplied relationships as 72, apply an approved filter as 30, and unmatched search as zero. Thus the current zero is explained by the current QA dataset, not demonstrated suppression introduced by this feature.

The earlier view showing 72 has not been independently located; its environment, time, user and dataset cannot be certified from current evidence. Its URL/context has been requested. **Historical 72-versus-0 reconciliation remains open; Area C is not declared fully PASS.** No count-specific application fix or data seeding is justified.

### Correction validation

- All 16 `scripts/test-*.mjs` passed, including S1-A/B/C/D. Targeted remediation coverage: 83 assertions passed.
- TypeScript, changed-file ESLint (zero findings), diff whitespace check and production Webpack build passed.
- Actual production-component local browser rendering checked at 1280×960, 1440×1000 and 1920×1080: long Evidence/control titles, all four expiry badges, closed/open details, unchanged integrated Compliance section, populated/empty Mapping presentation and review fields, and Finding guidance closed/open with optional owner/due fields.
- No page-level horizontal overflow at the three widths. At 1280, Evidence summary row heights were identical closed/open (`167, 125.5, 167, 167` pixels); detail content is a separate sibling row. A status-label overlap found at 1280 was fixed by scoped badge wrapping; final summary cells have no overflow.
- Local visual fixtures use the production components/CSS, not a release route or live QA fixtures. Populated Mapping review was inspected locally because the live QA dataset is empty. These checks do not claim a live Mapping lifecycle decision was executed.
- No QA mutations, Production access/writes, migrations, RLS/grant/RPC/auth/role changes, main/qa/RC3/S2-B changes. P1 remains OPEN. This is a feature Preview for operator review, not a merge or freeze.

## Final Evidence-only correction after 53d48d5

The original RC3 `app/evidence/evidence.css` and register markup were used as the visual reference, rather than another redesign. Restored content-sized columns, 12.5px table text, original desktop 10px/11px cell spacing, original secondary text treatment, normal version/control text and original visible action buttons/links with 7px/9px padding. Removed the added caption, fixed-percentage column group, undersized badge override and underlined download redesign. The accessible disclosure keeps the original “تفاصيل الدليل” wording and disclosure marker, but still controls the approved separate full-width sibling row.

Only the compact four-state expiry badge and the full-width detail fix remain as deliberate visual differences. The original 1060px minimum-width floor is not restored: a narrowly scoped 1280px-desktop spacing/minimum-width adjustment keeps all eight columns, dates, status and direct actions readable without horizontal scrolling. Inline-size containment prevents expanded detail text from changing the content-sized summary columns. No read, filter, search, eligibility, preview/download handler, relationship, route or mutation contract changed.

Validation: all 16 test scripts passed, including S1 regressions; targeted assertions increased to 89. TypeScript, changed-file ESLint (zero findings), whitespace checks and Webpack production build passed. Local actual-component browser rendering at 1280/1440/1920 covered all expiry states, long evidence/control names, RTL and collapsed/expanded details. No page or table horizontal overflow, no browser console errors. Summary row heights are identical before/after expansion at each width: 1280 `[198,125.5,125.5,125.5]`; 1440 `[170.5,125.5,125.5,125.5]`; 1920 `[143,99.5,115.5,115.5]`. These are deterministic visual fixtures, not QA business writes.

Areas B/C/D were not modified in this correction. Their manual UI acceptance is recorded from the operator's latest instruction; the prior historical Mapping-data investigation is not changed by this Evidence-only task. P1 remains OPEN. No merge, freeze, Production access/deployment, QA mutation or protected-branch change.
