# S1-C: authorized read completeness

Base: `3def47d94d30250c42e4b5b9eedc954493c9adae`.
Scope: Strategy & Execution reads only. No DB, command, role, route, formula,
or relationship-source changes. No reconciliation of legacy and modern links.

## Truth contract

- COMPLETE: all required reads for this value finished within current RLS scope.
- PARTIAL: independent sources have mixed success, or a paged read failed later.
  Incomplete row sets are discarded; composites are not published from subsets.
- UNAVAILABLE: a required read/dependency did not complete.
- Zero: a complete authorized read produced a factual zero.
- No relationship: the selected authorized relationship source completed empty.
  It says nothing about hidden records or other relationship sources.
- Insufficient data: loaded project records lack target dates needed to derive delay.
- Not configured: reserved for independently proven configuration absence. These
  pages have no authoritative configuration-presence read. They therefore never
  infer missing configuration from a schema/query/permission error. The old
  register message guessing an unapplied migration was removed, not replaced
  with another guess. Deferred S3 readiness wording stays unchanged.

## Dependencies

| Section | Required existing sources |
| --- | --- |
| Register project rows/count/status/dates | projects |
| Direct-control counts | project-controls + active controls/framework filter |
| Requirement count | project-requirements |
| Requirement rollup | project-requirements + active requirement-controls + active controls |
| Planning five-element completeness | projects + direct-control counts |
| Treatment count | project gap treatments |
| Roadmap placement/progress/dates | projects only |
| Executive project alerts | projects only |
| Executive treatment-without-link alert | treatments + direct-control counts |
| Executive total alert categories | all existing alert sources |
| Detail identity/overview/technology field | exact project by path ID |
| Detail requirements | project-requirements + readable embedded requirements |
| Detail controls/evidence summaries | requirements + active requirement-controls + readable embedded controls/frameworks + active controls |
| Detail treatments | treatments for exact project ID |
| Detail audit | same existing per-control audit source; page-scoped export |

Null/empty embedded relations are unavailable, never fabricated `not_uploaded` or
`not_verified` states. Independent primary and treatment sections survive secondary
failures. No first-record fallback is introduced.

## Paging and async safety

Use existing filters with exact RLS-scoped counts, 500-row ranges and stable selected
keys (project ID tie-breaker; junction compound keys; treatment/control IDs).
Advance by actual returned size so smaller server caps cannot truncate totals.
Missing counts, later errors, duplicate keys, early empty pages, count drift or the
bounded request ceiling fail closed and publish no incomplete total. This is not
a cross-request transaction snapshot; undetectable same-count concurrent edits
are not claimed to be prevented.

Effect cleanup prevents post-unmount commits. Reload epochs prevent older register,
treatment and opt-in project audit reads from overwriting newer reads. URL filtering
continues to use the certified S1-B contract, without introducing another state store.

## Exports and scope

Roadmap CSV/PDF require complete project and direct-link reads. Executive PDF
requires all alert sources. Failed/loading project audit page exports are disabled.
Both button state and handlers enforce this; no new reporting engine is added.
`GrcAuditTrail` receives an opt-in `reliableRead` flag from project detail only;
its source, control context, paging, audit semantics and permissions are unchanged.

## Verification

`test-strategy-s1-c-reliability.mjs` tests actual production renders, paging,
availability dependencies, unchanged source/filter/formula contracts and epochs.
`verify-strategy-s1-c-browser.mjs` exercises the built application with intercepted
local-only reads, including null joins, later-page failure, 1003 projects, independent
sections, blocked exports, audit stale-response ordering and desktop/mobile RTL.
Non-GET external requests are aborted. No fixture route or live QA fixture exists.

S1-A tests retain terminology, mutation/auth/form and pure-formula contracts;
S1-C explicitly compares all existing memoized calculations after stripping only
the named availability guards. S1-B navigation tests retain their original assertions;
their local fixtures now include exact-count headers and complete read metadata.
