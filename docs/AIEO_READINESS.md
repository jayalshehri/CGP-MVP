# AIEO multi-agent readiness (non-production)

Updated 2026-10-30. Development source: `aieo/multi-agent-foundation`; review: Draft PR #61.

## Evidence boundary update — 2026-11-23

The trusted reviewer preflight now returns `scope: trusted-reviewer-registration-and-blobs-only` and `endToEndProven: false`, even when it returns `status: ready`. Readiness means **only** that the exact reviewed independent-role bundle and its active workflow exist on the trusted default-branch commit. It never attests to a live source-approved model patch or completed GitHub review chain.

Earlier **synthetic-only** milestones have real, independently checkable GitHub evidence:
- [Synthetic OpenRouter probe run 43267212073](https://github.com/jayalshehri/CGP-MVP/actions/runs/43267212073), completed successfully on 2026-11-12. It sent a fixed synthetic example only, **not** application source.
- [Synthetic bot Draft PR workflow run 43294763859](https://github.com/jayalshehri/CGP-MVP/actions/runs/43294763859), completed successfully on 2026-11-12. It created [Draft PR #145](https://github.com/jayalshehri/CGP-MVP/pull/145), which is now **closed, unmerged and still marked Draft**. That proof used a synthetic Markdown file, not a model candidate.
- [Four independent fixture jobs, run 45073229419](https://github.com/jayalshehri/CGP-MVP/actions/runs/45073229419) succeeded on the stacked PR #395 commit, but processed only a deliberate fixture, not an OpenRouter-generated source fix.

These are three **different** proof categories and must never be combined to imply an approved real source-sharing, model-generated fix, automated model Draft PR, and subsequent independently reviewed candidate. The real full-chain acceptance criterion remains **unmet**. Default-branch activation and specifically authorized source sharing remain human-controlled; no PR merge, production deployment or protection change is authorized by this ledger.

## Confirmed capabilities
- Developer, QA, Security and Reviewer execute in separate GitHub Actions jobs, with source/candidate SHA-256 handoffs and independent verification for the **bounded deterministic** defect class.
- A deliberately altered **temporary Git fixture** exercises a proposed patch through separate QA, Security and Reviewer CLI processes. Adversarial evidence and out-of-scope changes fail closed.
- The optional provider adapter supports a **single allowlisted file** only, sends nothing unless a manual and explicit source-sharing opt-in is supplied, and validates the returned exact-string patch before applying it locally.
- The Draft PR publisher is limited to a manual main-branch dispatch with a repository-scoped token; independent safety verdicts and build gates are checked before any branch/PR write. Local tests emulate Git remote and `gh`, **not live Actions publication**.
- CI now checks external-provider token patterns and regression-tests workflow permission/approval boundaries. Neither these static tests nor synthetic fixtures constitute proof of arbitrary autonomous development.
- Bounded model changes now preserve the full existing feedback submission handler and form submission binding; added tests target commented-out authentication guards and block-comment bypasses. These defenses reduce a specific bypass risk but do **not** certify arbitrary model-generated code as safe.

## Not yet established
- [ ] One real, explicitly source-approved OpenRouter request for a new legitimate defect.
- [ ] A real model-generated patch passing independent QA, Security, Reviewer and application CI end to end.
- [ ] An actual **GitHub Actions** publisher run that pushes the model-generated candidate and opens a Draft PR (rather than the local mocked `gh` rehearsal).
- [ ] Demonstrated general-purpose autonomous programming across multiple tasks; current producer is deliberately bounded.
- [ ] Verified that the repository's `aieo-ai` environment, protected secret and release approvals are configured. Secrets are never to be printed or added to the repository.

## GitHub-specific activation boundary
GitHub documents that `workflow_dispatch` only receives trigger events when the workflow file is on the **default branch**:
https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow

The new `aieo-model-draft.yml` and `aieo-developer-draft.yml` currently exist only in PR #61. The read-only PR checks can run, but the privileged manual jobs **cannot be proven from this feature branch as a new workflow**. Only a deliberate human review and merge of approved workflow definitions to `main` can activate that route. The automation must **never merge PR #61 for this purpose** without explicit authorization.

## Next safe milestones
1. Continue hardening read-only and mocked integration tests on the feature branch.
2. Check final CI conclusions against the *current branch HEAD*, not earlier successful commits.
3. Request a human-controlled activation decision only when code and tests are ready; do not bypass default-branch workflow requirements with PR-triggered write permissions.
4. Once authorized, validate real source consent, environment protection and a single live Draft PR workflow run. Keep merge and production deployment human-only.

Do not claim MVP completion before the pending end-to-end proofs succeed.
