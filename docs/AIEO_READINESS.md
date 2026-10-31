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

## Git fsmonitor execution guard (stacked Draft, 2026-10-31)
- A runner-local or repository Git `core.fsmonitor` helper can execute during index refreshes, including `git diff`, while the Draft publisher has `GH_TOKEN`. Disabling ordinary Git hooks, external diff drivers and clean filters does **not** disable this separate hook mechanism.
- The publisher now checks the **effective** `core.fsmonitor` value using an index-free Git config read **before** diff, add, commit or remote writes. Only the explicitly disabled value `false` (including the absent-key default) is accepted. Unexpected values fail closed without attempting to run the helper.
- A negative isolated fixture installs an executable fsmonitor that would leave a marker and fail, then verifies the publisher refuses the run before marker creation, branch write, `gh` call or push. The fixtures remain offline; exact-head CI must verify this change before any safety claim.
- This does not establish live GitHub Actions Draft publication or a consented OpenRouter model run, and it does not claim all Git configuration execution risks are eliminated.

## Git SSH/askpass transport command guard (stacked Draft, 2026-10-31)
- Even when the resolved Git remote targets the approved repository, a runner-configured `core.sshCommand`, `GIT_SSH_COMMAND` or `GIT_SSH` can execute an arbitrary local program during an SSH push. `GIT_ASKPASS` / `SSH_ASKPASS` and Git configuration environment overrides are additional command or configuration injection surfaces in a publisher step carrying `GH_TOKEN`.
- The Draft publisher now refuses a configured SSH command and non-empty `GIT_SSH_COMMAND`, `GIT_SSH`, `GIT_ASKPASS`, `SSH_ASKPASS`, `GIT_CONFIG_COUNT` or `GIT_CONFIG_PARAMETERS` before performing any network operation or branch write. The normal checkout/HTTPS GitHub authentication route is not otherwise changed.
- Negative unit tests and temporary Git-process fixtures check the refusal occurs before a malicious marker program, `gh` invocation or branch creation. This control does not address all possible Git credential-helper execution surfaces, and these are simulated fixtures, not a live Actions-published PR or real OpenRouter request. Exact-head GitHub CI must pass before relying on this change.

## Isolated publisher Git credential helper (stacked Draft, 2026-10-31)
- With HTTPS Git remotes, a configured `credential.helper` or URL-specific `credential.https://github.com.helper` can run an arbitrary command during push/remote verification while the publisher has `GH_TOKEN`. Calling `gh auth setup-git` does not guarantee that every previously configured helper is removed.
- The publisher no longer writes a persistent Git credential configuration with `gh auth setup-git`. It adds two **command-scoped** Git configuration values for **both** authenticated push and remote-HEAD attestation: an empty `credential.helper` to reset inherited helpers, followed by only `!gh auth git-credential` as the permitted helper. Git hooks remain disabled on push. This preserves the manual dispatch, exact-commit and Draft-only verification boundaries.
- An isolated negative fixture configures an executable global/local-style helper and URL-specific helper, proves Git's credential protocol obtains only the synthetic GitHub CLI response, and asserts the malicious helper is never invoked. The local model/Git workflow still uses a mocked GitHub CLI and temporary bare Git remote; this is **not** evidence of live GitHub Actions Draft publication or OpenRouter-generated code. CI must pass on the exact new HEAD before treating the change as validated.

## HTTPS-only Draft publisher transport (stacked Draft, 2026-10-31)
- GitHub Actions checks out the approved repository over HTTPS. Allowing the same repository through SSH also permits local SSH configuration to execute `ProxyCommand`, `Match exec` or other external helpers with the publisher's token, even after Git-level SSH command overrides and Git hooks have been rejected.
- The Draft publisher now accepts only the two canonical HTTPS forms for both the **raw** origin and Git's **fully resolved single push URL**. SSH/scp-style destinations fail closed *before* branch creation, network transport or GitHub CLI calls; existing command-scoped GitHub CLI HTTPS authentication is unchanged.
- Unit and isolated subprocess tests cover both SSH raw origins and SSH push URLs, and the workflow-policy test rejects reintroduction of the SSH allowlist. This intentionally tightens the supported publisher transport; it does not prove live GitHub Actions Draft publication, external source consent or a real OpenRouter-generated fix. Exact-HEAD GitHub CI must verify the change.

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

## Custom JSX outbound URL guard (stacked Draft, 2026-10-31)
- Native-element-only outbound checks could miss URL-bearing attributes supplied to custom React components such as `<RemoteImage src={privateUrl} />` or `<RouterLink href={privateUrl} />`. Such components may render images, links or requests without explicitly invoking fetch in the changed file.
- Both the model proposal guard and the independently executed Security gate now reject URL-bearing JSX attributes on **any** opening tag, including custom components and partial attribute edits in assembled source. Native-only `data` and refresh attributes remain restricted on native outbound-capable elements; ordinary custom `data` props are not banned solely by this change.
- Added synthetic negative regressions in separate validator and Security suites, with a benign custom-component control. This is conservative lexical screening, **not** a full React dataflow audit or proof of autonomous provider/PR end-to-end execution. No external model call, production deployment, merge or release was authorized.

## Custom Git remote helper rejection (stacked Draft, 2026-10-31)
- A local Git setting such as `remote.origin.vcs=aieo-unsafe` can select an executable `git-remote-aieo-unsafe` during an HTTPS `git push`, **even when** the configured origin and Git-resolved push URL are the canonical GitHub URL. With `GH_TOKEN` in the publisher environment, this could run untrusted local code after model/CI gates.
- The publisher now rejects any configured `remote.origin.vcs` before Git index operations, branch creation, authentication or network writes. This is intentionally fail-closed and does not relax the exact-SHA, GitHub URL, Draft-only or human-merge requirements.
- Added a direct validation test and a temporary Git-worktree subprocess fixture with a sentinel executable and assertions for **no helper execution, no gh invocation, no branch creation and no remote branch**. These are offline tests; a real-provider novel fix and a GitHub Actions-created Draft PR still have not been demonstrated. Verify the exact-head CI results before relying on this control.

## Executable Git signing rejection (stacked Draft, 2026-10-31)
- A publisher invoking `git commit` with an effective `commit.gpgSign=true` may execute runner/repository-specified programs such as `gpg.program`, `gpg.ssh.program` or `gpg.x509.program` while `GH_TOKEN` is available. Disabling Git hooks does not prevent signing-driver execution.
- The publisher now reads Git's normalized `commit.gpgSign` setting before index changes and rejects a signing-enabled configuration. It **does not disable or override** an existing signing requirement; a signing-required runner will stop and require deliberate human remediation.
- Added direct verifier tests and a temporary Git fixture configured with an executable fake GPG signer. The negative path asserts no signer execution, no branch, no GitHub CLI and no remote writes. This remains an offline regression, **not** an actual provider-backed or GitHub Actions-created Draft PR proof.

## Git remote helper executable-path isolation (stacked Draft, 2026-10-31)
- Git can resolve the HTTPS transport via a locally installed `git-remote-https` helper. An inherited `GIT_EXEC_PATH` environment override can substitute a malicious executable, even with a canonical origin URL, disabled hooks, and isolated credential helpers. Such a helper could access `GH_TOKEN` during publishing.
- The Draft publisher now rejects any non-empty `GIT_EXEC_PATH` **before its first Git subprocess**. This is a fail-closed restriction; it does not change repository branch protection, bypass signing policies, or authorize source sharing.
- Added a direct verifier case and an isolated Git fixture with a sentinel `git-remote-https` executable. The negative test asserts that the helper and GitHub CLI never run, no local candidate branch appears, and the temporary remote receives no branch. These are synthetic tests only; real OpenRouter generation and an Actions-created GitHub Draft PR still require separate end-to-end proof.

## GitHub HTTPS certificate verification (stacked Draft, 2026-10-31)
- The publisher relies on GitHub HTTPS to protect a scoped GitHub token during pushes. An effective `http.sslVerify=false` (including URL-specific Git configuration) or inherited `GIT_SSL_NO_VERIFY` can allow a TLS-intercepting intermediary to impersonate the GitHub endpoint and receive credentials. Trusted remote URL checks alone do not establish verified TLS.
- The publisher now rejects non-empty `GIT_SSL_NO_VERIFY` before any Git command, and queries Git's URL-matched boolean `http.sslVerify` for both permitted repository URL forms. An absent setting retains Git's secure default; false or invalid settings stop publication before a candidate branch or GitHub CLI call. It does not disable TLS checks, override certificate policy, or make an insecure connection.
- Added a validator test and isolated Git fixtures for global, host/repository-scoped and environment-level insecure TLS settings. The negative path asserts no GitHub CLI invocation, no new local branch and no remote candidate ref. These checks do **not** prove source-approved live OpenRouter generation or actual GitHub Actions bot-created Draft PR publication. No main merge, production release or secret disclosure is authorized.

## Git diagnostic-export refusal (stacked Draft, 2026-10-31)
- An inherited Git tracing setting such as `GIT_TRACE_CURL`, `GIT_TRACE2_EVENT` or `GIT_CURL_VERBOSE` can emit credential-bearing transport diagnostics to a file or CI logs. In particular, `GIT_TRACE_REDACT=0` can disable curl trace redaction while the Draft publisher holds `GH_TOKEN`. Reject any non-empty `GIT_TRACE*` setting or `GIT_CURL_VERBOSE` before the **first Git subprocess**.
- The publisher deliberately does not override existing forensic policies: a runner with tracing configured must stop rather than silently proceed with sensitive diagnostics. Negative unit and isolated-Git subprocess tests assert the trace file is absent and that there is no GitHub CLI invocation, branch creation or remote write.
- These are synthetic offline protections. They do **not** establish live, source-consented OpenRouter repair or GitHub Actions-created Draft PR publication. Both remain subject to human-controlled authorization. No change to `main`, production or protection rules is authorized.

## GitHub CLI repository and host routing guard (stacked Draft, 2026-10-31)

- GitHub CLI supports inherited `GH_REPO` and `GH_HOST` overrides. If a CI runner or preceding build step sets these, the old `gh pr create` command without an explicit repository could target a different repository or host before the after-the-fact remote Draft attestation detects the mismatch.
- The Draft publisher now rejects non-empty inherited `GH_REPO` and `GH_HOST` **before the first Git operation**. Both `gh pr create` and `gh workflow run` explicitly pass `--repo jayalshehri/CGP-MVP` derived from the validated dispatch context; the existing remote Draft identity verification still runs.
- Negative local Git fixtures assert these overrides produce no branch creation, no remote push, and no `gh` invocation. A positive local fake-`gh` run asserts that both CLI commands carry the explicit repository. These are offline simulations; they do **not** prove a real GitHub Actions-created Draft PR or consented OpenRouter generation. The exact new branch HEAD must pass CI before relying on the hardening.
- No permissions, `main`, production deployment, secrets, branch protections or human approval boundaries are changed.

## Block model reuse of the existing Supabase data client (stacked Draft, 2026-10-31)

- The bounded model validator already rejects new `fetch()`, imports, browser navigation, JSX URL props and similar outbound channels. However, the approved FeedbackWidget file **already imports the Supabase client**. A proposed UI edit could call `supabase.from("profiles").select("*")` or `supabase.auth.getSession()` without adding an import or explicit browser-network API, bypassing the previous lexical checks.
- The provider-side proposal validator now rejects any newly proposed `supabase` reference. The independently executed Security process also rejects new diff lines that reference the existing client, while retaining unchanged original submit-handler code and allowing ordinary UI text edits. This intentionally conservative lexical protection is not a TypeScript dataflow proof or a substitute for RLS.
- New negative and positive synthetic tests cover direct data queries, writes, auth calls, client aliasing, and harmless static changes. Do not infer live OpenRouter code generation, GitHub Actions Draft publication, or end-to-end agent completion from these tests. No `main` merge, production deployment, source disclosure or protection change is authorized.

## Exact-source scoped provider consent (stacked Draft, 2026-10-31)
- An explicit source-sharing checkbox alone can outlive a source change. The external model adapter now also requires an exact SHA-256 digest of the single allowlisted source file `components/FeedbackWidget.tsx` to match the source bytes at the moment of transport; absent, invalid, stale or mismatched hashes fail closed **before any HTTP request**. The input is called `approved_source_sha256` in the manual workflow and `AIEO_APPROVED_SOURCE_SHA256` in the provider process.
- The consenting human should review the exact `main` revision and calculate the digest over that checkout, for example `shasum -a 256 components/FeedbackWidget.tsx` on macOS or `sha256sum components/FeedbackWidget.tsx` on Linux. The workflow verifies this value against the checked-out file; the digest does not authorize changes to another file or any later source revision.
- Unit tests and the isolated mock-provider chain verify the mismatch blocks transport before source disclosure. This is additional scope enforcement, **not** a live OpenRouter call, provider consent grant, GitHub Actions-published Draft PR or an authorization to merge/deploy.

## Independent source/diff attestation in Security (stacked Draft, 2026-10-31)
- Security previously scanned added lines from the supplied Git diff. A forged, truncated, or incorrectly collected diff could omit a newly introduced outbound call even when the source and candidate SHA-256 in the proposal were correct. Reviewer re-ran Security over the **same** diff, so identical recomputation alone did not establish that the diff represented the actual source change.
- Security now derives newly introduced lines directly from the original and candidate file bytes, counting duplicates, and verifies that every such line appears in the reported diff additions. It scans both sources of added lines for risky code. Reviewer inherits this check through independent Security recomputation. A fabricated benign diff, a missing added line, or a concealed network call fails closed.
- Offline unit tests exercise benign matching diffs, incomplete/mismatched diffs, duplicate lines, and Reviewer refusal of fabricated success. The lexical line comparison does **not** prove general code safety or guarantee detection of malicious rearrangements of pre-existing lines; JSX/handler invariants and other gates still apply.
- These tests are not a real-provider repair or an Actions-created Draft PR. Only exact-HEAD CI can validate the change, and manual consent and protected workflow activation remain required. Never merge to main or deploy based on fixture results alone.

## Complete unified-diff source attestation (stacked Draft, 2026-10-31)
- A multiset comparison of added lines can accept a fabricated hunk where additions are present but deletions, positions or the order of pre-existing lines are false. That can affect the reviewer even if source and candidate hashes are correct.
- Independent Security now reconstructs the entire proposed candidate from the original source and every zero-context unified-diff hunk, checking old/new offsets, removed text, inserted text and file metadata. A diff that does not reproduce the exact candidate fails closed; Reviewer independently recomputes Security's verdict before a candidate is eligible for Draft PR publication.
- The bounded verifier intentionally refuses changed final-newline formats, malformed or non-text patches rather than trying to interpret them permissively. Synthetic tests cover legitimate two-hunk diffs and Git headers, forged deletions, offsets, permutations, extra insertions and misleading paths.
- This closes a report/source attestation gap only. The model, four agents and Draft PR publisher are **not** independently proven on a novel live provider-generated change or an actual Actions-created remote PR. Source consent, privileged default-branch workflow activation and human merge authority remain separate; no main merge or production publishing is permitted by this draft.

## Bound destructive model patches (stacked Draft, 2026-10-31)
- Previously Security bounded **new** source lines to 20 but did not bound deleted lines. A model could propose a deletion-only diff erasing many unprotected UI lines without triggering the insertion budget.
- Security now rejects more than 20 removed source lines, even if there are zero added lines. The exact unified-diff reconstruction from the previous stacked Draft also verifies these deletions against the original source, preventing fabricated removal counts from becoming trusted evidence. Reviewer independently recomputes Security.
- Offline regression tests distinguish legitimate 20-line deletion from an attested 21-line deletion that must fail closed. This is a change-size bound, **not** a demonstration of safe general autonomous edits or an Actions-created PR. Live provider invocation and remote Actions publication remain unproved and require separate user-controlled permissions and source consent.

## Reflective browser-global bypass hardening (stacked Draft, 2026-10-31)
- The earlier lexical checks caught direct network calls but not *bare* global references: e.g. Reflect.get(globalThis, "fetch") or (0, fetch) could recover an outbound transport without a directly detected call or property access. A function's constructor can also allow dynamic evaluation.
- The provider adapter and independent Security process now reject newly proposed reflective access primitives, constructor-property references, and bare browser-global identifiers. Reviewer still recomputes Security from exact source and unified diff; harmless static edits are accepted in regression tests.
- This deliberately conservative pattern defense is **not** a semantic JavaScript security proof. Live OpenRouter generation, an Actions-created Draft PR, and autonomous general repair remain unverified pending separately scoped source consent and trusted workflow activation. No main merge or production deployment.

## Isolate independent agent diffs from executable Git drivers (stacked Draft, 2026-10-31)
- QA, Security and Reviewer CLIs collect source-scope and zero-context diffs from Git. An inherited `GIT_EXTERNAL_DIFF` or a checkout-defined external diff/textconv driver can execute arbitrary local programs during `git diff` while an agent step holds the model provider secret. Read-only review is not immune to executable diff helpers.
- Both model-gates and model-security CLIs now use `git diff --no-ext-diff --no-textconv` for every diff/scope read. This prevents external diff/textconv execution without changing the trusted source, QA/Security/Reviewer verdict semantics or GitHub permission rules.
- The isolated four-stage CLI fixture first **proves an unguarded Git diff executes an executable sentinel**, then re-runs the independent QA, Security and Reviewer stages with the same malicious `GIT_EXTERNAL_DIFF` inherited and asserts the helper was never executed. The fixture is synthetic; it is not a provider-backed novel repair or a real GitHub Actions-authored Draft PR. Exact-head CI must pass before relying on this change.
