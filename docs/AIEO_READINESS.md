# AIEO multi-agent readiness (non-production)

Updated 2026-10-30. Development source: `aieo/multi-agent-foundation`; review: Draft PR #61.

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

## Git push target hardening (stacked Draft, 2026-10-30)
- Publisher now validates both the canonical raw `remote.origin.url` and Git's **resolved push target** from `git remote get-url --push origin` before any branch or PR write. This rejects `remote.origin.pushurl`, `url.*.insteadOf`, and `url.*.pushInsteadOf` redirects to unapproved destinations even when the raw origin looks trustworthy.
- Unit and subprocess negative tests cover redirects and verify **no push, branch creation, or GitHub CLI invocation** when attestation fails. Successful full-chain test still uses an **explicit test-only fake destination attestation** with a local Git remote and fake GitHub CLI; it does **not** demonstrate remote GitHub publication or provider-generated repair.
- This additional check cannot substitute for human-controlled GitHub Actions activation, scoped external-source consent, or a real independently verified PR-generating workflow run.

## Multi-push destination fail-closed check (stacked Draft, 2026-10-30)
- A Git remote may contain **multiple** `remote.origin.pushurl` entries; ordinary Git push can send commits to more than one destination. Checking only the first resolved URL misses this exfiltration path.
- Publisher now enumerates `git remote get-url --push --all origin` and requires **exactly one** allowlisted destination; zero, duplicate or mixed trusted/untrusted targets fail closed. Negative tests verify no branch creation or `gh` call for multiple configured destinations.
- The local fixture's Git shim supports this new attestation solely to keep its transport offline. This is not proof of a live GitHub Actions-published PR or live OpenRouter repair.

## Post-commit tree attestation (stacked Draft, 2026-10-30)
- A Git pre-commit hook or local Git configuration can change staged source after the model/QA/Security/Reviewer gates. Checking the pre-commit workspace alone is insufficient to prove the final Git commit contains the reviewed bytes.
- The publisher now confirms that the new commit's sole parent is the trusted `GITHUB_SHA`, the committed source bytes match the independently reviewed candidate, and the committed changed-file list contains only `components/FeedbackWidget.tsx`. This runs **before** GitHub authentication setup, any push, or PR creation.
- The post-commit source/parent/scope verification remains in place even after disabling local Git hooks. Earlier local hook-mutation tests motivated this additional preventive control; current isolated hook tests assert **no hook invocation at all** (see below). These remain **offline fixtures**, not proof of an Actions-created real PR.

## Git hook isolation in publisher (stacked Draft, 2026-10-30)
- Attesting the final commit **after** `git commit` cannot prevent earlier side effects from a malicious `post-checkout`, `pre-commit`, `post-commit`, or `pre-push` hook that was installed during build or via runner-local Git configuration. A hook could run with the publisher job's scoped `GH_TOKEN` even if the resulting commit were later rejected.
- For the publisher's hook-capable operations (`switch`, `add`, `commit`, `push`), use `git -c core.hooksPath=/dev/null` instead of allowing local or overridden hook paths. Retain the post-commit tree/source/parent attestation, remote destination checks, and Draft PR verification; this is a defense-in-depth control, not a replacement for protected credentials or human approval.
- Isolated local tests install deliberately failing checkout, index-update, commit, and push hooks (`post-checkout`, `post-index-change`, `pre-commit`, `prepare-commit-msg`, `commit-msg`, `post-commit`, `pre-push`) in both default and custom hook directories and verify that none executes while the bounded reviewed candidate can still be published to a **temporary local** Git remote with a mocked `gh`. This remains no proof of live GitHub Actions publication or OpenRouter source-approved repair.

## Git external-command isolation (stacked Draft, 2026-10-30)
- Git can execute configured external diff commands via `GIT_EXTERNAL_DIFF` / `diff.external` **or Git textconv drivers** during a source comparison, and `git add` can execute a clean filter configured via Git attributes even with Git hooks disabled. These commands would run in the publisher step that has `GH_TOKEN`.
- The publisher now adds `--no-ext-diff --no-textconv` to every `git diff` invocation and refuses any effective `filter` attribute on the single allowlisted file before creating a branch, staging, authenticating or pushing. This includes hidden `.git/info/attributes` which is outside the ordinary working-tree diff.
- Offline tests introduce deliberately failing external diff, textconv, and clean-filter helpers, and assert no helper executes and the unsafe filter path fails closed. **GitHub CI validation is required for the exact new branch HEAD before treating these changes as verified**.
- These checks do not authorize real provider source sharing, GitHub Actions-created PR publication, merging or production deployment.

## Next safe milestones
1. Continue hardening read-only and mocked integration tests on the feature branch.
2. Check final CI conclusions against the *current branch HEAD*, not earlier successful commits.
3. Request a human-controlled activation decision only when code and tests are ready; do not bypass default-branch workflow requirements with PR-triggered write permissions.
4. Once authorized, validate real source consent, environment protection and a single live Draft PR workflow run. Keep merge and production deployment human-only.

Do not claim MVP completion before the pending end-to-end proofs succeed.

## Long-form JSX outbound and spread guard (stacked Draft, 2026-10-30)
- The previously bounded HTML/JSX attribute scanner only examined 350 characters after an opening tag. Padded markup could introduce an outbound `src` or `href` beyond that window. Both the model proposal validator and independently run Security gate now inspect the complete tag (within existing input/diff size bounds), with regression tests.
- Opaque JSX spread props such as `<img {...untrustedProps} />` are also rejected in both layers: a spread can hide network-bearing attributes from the static attribute scanner. A clean static edit remains permitted.
- These are conservative pattern checks, not a complete JavaScript/JSX parser or proof of a secure arbitrary patch. Live OpenRouter generation and Actions-created Draft PR remain **unverified** and human-gated.

## JSX quoted-angle boundary guard (stacked Draft, 2026-10-30)
- Earlier pattern matching stopped at the first literal `>`, including when it appeared in quoted attribute values or inside JSX expressions. That allowed a later `src` / `href` URL sink or opaque prop spread to avoid detection.
- The model proposal validator and independent Security gate now scan the complete JSX opening-tag boundary while respecting quotes, nested braces and expression arrow operators; nested JSX openings are also examined.
- Added provider and Security negative fixtures for quoted angles, arrow expressions, nested outbound JSX and hidden prop spreads, plus a benign quoted-angle positive fixture. This remains bounded static protection, not a full TypeScript/JSX AST safety proof or live OpenRouter/GitHub Actions publication.

## Full JSX candidate scan for partial-attribute edits (stacked Draft, 2026-10-31)
- A model can replace only an interior JSX attribute of a pre-existing tag. In such a case the replacement fragment and a zero-context Git diff omit the opening `<img` or `<a`, so earlier checks could miss added outbound attributes or an opaque prop spread.
- The model proposal validator now screens the **entire assembled candidate** for disallowed JSX markup after applying the bounded replacement. The independently executed Security gate screens the complete `actual` file as well as additions. A pre-existing outbound sink also blocks automated candidate acceptance (intentional fail-closed behavior in the single allowlisted file).
- Separate regression tests verify rejection of a partial `src` edit and an opaque spread while accepting an ordinary `alt` label edit. This remains static scanning, not a complete JSX/TypeScript parser; successful CI is still required on the exact new commit.
- No real external-model call, bot-authored PR, default-branch activation, merge, production deployment, or source-sharing permission is provided by this change.
