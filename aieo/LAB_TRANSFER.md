# AIEO: controlled transfer from private lab to CGP-MVP (staging only)

## Evidence already independently obtained in AIEO-LAB
- Live, opt-in synthetic-only OpenRouter invocation: GitHub Actions run [41592231110](https://github.com/jayalshehri/AIEO-LAB/actions/runs/41592231110), success on 2026-11-03.
- Separate Developer, QA, Security, Reviewer and publisher GitHub Actions jobs all passed.
- The publisher, not a chat connector, created [Draft PR #3](https://github.com/jayalshehri/AIEO-LAB/pull/3) with a **single synthetic** file; no merge or deployment.
- The private laboratory's files, credentials, tokens, model responses and artifacts are **not transferred** into CGP-MVP.

## Scope of this PR
- Run the CGP-MVP orchestrator and its four deterministic, independent roles with source-bound artifact handoffs in GitHub Actions on a stacked development PR.
- Introduce a read-only portability/promotion gate that checks that the actual CGP provider workflow stays manual, SHA-approved and environment-scoped, with no privileged pull_request_target execution.
- Preserve all existing PR guardrails and the baseline application build. Do not alter production code or connect a real provider.
- This transfer proof is **not** a live OpenRouter invocation in CGP and **not** a bot-authored CGP Draft PR.

## Boundaries before CGP live activation
1. A human reviews/approves which **exact CGP source snapshot** may be sent to OpenRouter; the synthetic-only laboratory consent does not authorize this.
2. Any protected manual workflow activation on CGP's default branch requires a separate human decision; **this PR must never self-merge**.
3. Require the exact source SHA-256, environment-scoped protected credentials, separate QA/Security/Reviewer verdicts, passing lint/typecheck/build and a human-reviewed Draft PR, with no automated merge or deployment.
4. This staging PR now splits the protected CGP model workflow into **separate GitHub Actions jobs** for Developer, QA, Security, Reviewer, build, and the write-scoped Draft publisher. Source-bound candidate/review artifacts cross runner boundaries. This job-level architecture is **code-reviewed and CI-policy-tested only** until the trusted default-branch manual workflow is activated by a separate human decision; no CGP source has been sent to OpenRouter.
5. A successful synthetic lab run is a narrow proof of the lab pipeline, not of autonomous general-purpose programming, full CGP integration or deployment readiness.

## Gate interpretation
The staged workflow is read-only (contents:read) and uses no model or GitHub write tokens. Passing its checks proves only this bounded staging behavior. **Do not label CGP live integration complete** on their basis.

## Job-level isolation migration in this Draft
- Reworked `.github/workflows/aieo-model-draft.yml` with separate runner jobs and explicit artifacts for the candidate and proposal/QA/Security/Reviewer evidence. Only Developer has the protected OpenRouter secret; only Publisher has GitHub write permissions. All privileged jobs preserve the manual-main-dispatch + exact-source-consent condition.
- No secrets, candidate code or authenticated writes are executed from PR-triggered CI. The PR preflight continues to run in read-only mode.
- GitHub Actions on this Draft can validate the workflow structure and deterministic/mock pipeline, but it **cannot demonstrate a real CGP provider invocation or CGP auto-published Draft PR**. Human activation and approval remain required.
