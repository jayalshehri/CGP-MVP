# AIEO Phase 4 — Developer Agent foundation

Status: proposal-only prototype. Does not automatically repair software.

- Read-only GitHub Actions permissions; no OpenAI key, production credentials or QA account secrets.
- Initial test uses a synthetic CI summary to produce a safe remediation checklist.
- No code edits, branches, PR creation, migrations, deployment or external API calls in this workflow.
- Next: use the validated read-only CI metadata collector, review sanitized logs and privacy policy, and add bounded model-based remediation proposals.
- Later: allow isolated code edits and draft PRs only after regression tests, branch protections, cost ceilings and human review are confirmed.
