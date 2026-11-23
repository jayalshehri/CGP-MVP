# AIEO multi-agent foundation

This pull request establishes a **bounded, executable four-agent foundation**. It does not yet constitute an independent general-purpose AI developer.

## Roles

- Developer detects one specifically approved FeedbackWidget route boundary defect, and returns a deterministic patch proposal, no-change status, or blocked verdict.
- QA independently checks source and five route regression examples.
- Security checks file scope, patch shape and obvious credential signatures.
- Reviewer combines their verdicts. Failures block onward execution; success is **eligible for a human-reviewed Draft PR**, never a merge approval.
- Orchestrator hands results between agents and writes a redacted JSON report.

The existing FeedbackWidget fix has already merged. Running against current CGP should report "verified-no-change".

## How to verify

GitHub Actions workflow "AIEO Multi-Agent Foundation" has **five separate jobs**:
- Orchestrator preflight (negative safety tests and real-source read-only check).
- Developer Agent (emits source-hash-bound redacted proposal status).
- QA Agent and Security Agent (run in parallel on independent runners; validate the Developer artifact).
- Reviewer Agent (downloads and cross-checks all three verdict artifacts; never submits an approval).

Each agent is a deterministic control, not yet a separate LLM. Source changes, full patches and tokens are not included in reports. The job permissions are read-only and receive no external API keys. The normal "CGP Required CI" separately handles lint, typecheck and build.

A second workflow, "AIEO Guarded Developer Draft", is prepared for **manual dispatch on main after this PR is human-merged**. It can attempt only the specifically approved FeedbackWidget replacement, then run full app checks, push a separate branch and create a Draft PR. It is not auto-dispatched, cannot merge, and does nothing if the fix is already present. Its candidate write path has not yet been exercised live.

## Safety

The CLI is read-only by default. To write a strictly bounded patch into the working tree, all four flags are necessary:
- AIEO_APPLY=1
- AIEO_TRUSTED_WORKFLOW=1
- GITHUB_EVENT_NAME=workflow_dispatch
- GITHUB_REF=refs/heads/main

The write flag does not commit, push, create a pull request, merge or deploy. It cannot modify unrelated files. Source and patch contents are excluded from the uploaded report.

## Not yet implemented

- Trusted GitHub manual launcher that creates a repair branch and Draft PR.
- Optional source disclosure to an external AI provider and validated model-generated changes.
- Independent QA and Security checks on a newly generated non-synthetic patch.
- A proven full novel-defect-to-Draft-PR cycle.

Until these are tested, do **not** describe the system as a fully autonomous coding team.

## Optional OpenRouter adapter (not live tested)

The separate "AIEO Opt-in Model Draft" workflow is designed to run **only after manual dispatch on main** and after explicit confirmation that one allowlisted source file may be shared with an external AI provider. It requires a configured GitHub environment named "aieo-ai", an OPENROUTER_API_KEY secret and an AIEO_MODEL_ID variable. The adapter does not run on pull_request or push.

It permits exactly one bounded find/replace in components/FeedbackWidget.tsx and rejects unknown files, ambiguous matches, oversized edits, credential-like text and common dangerous code patterns. An independent diff verifier checks the original and proposed SHA-256, file scope and added lines. Full application lint, typecheck and build must pass before the action creates a Draft PR.

GitHub workflows created or changed through GITHUB_TOKEN do not always trigger ordinary follow-on CI events. This workflow explicitly dispatches the required application-check workflow on the generated branch. A human still decides whether anything is merged. Model-provider tests use a mock transport; **no real provider call, new-model patch, or bot-created PR has been demonstrated yet**.

Never put production secrets or confidential business data into an external model prompt. The current file is code-only allowlisted, but this is a conservative first-phase policy, not a guarantee that an arbitrary file is safe to share.

## Independent model-candidate gates (2026-10-30)

The optional model-Draft workflow now launches **separate QA, Security and Reviewer CLI processes** after the provider produces a proposed file. QA independently verifies the source/candidate hashes, exactly one allowlisted changed file, and preservation of the already-fixed control-route boundary. Security independently reads the real Git delta and rejects unsafe changes. Reviewer **recomputes** QA and Security evidence against the actual working tree, rejecting forged or stale reports before any commit or Draft PR is allowed. Negative tests cover forged hashes and verdicts, changed file scope, and route guard removal.

These checks are deliberately limited: preserving known invariants and passing lint/typecheck/build **does not prove a novel model-generated fix is semantically correct**. The provider-backed Draft PR path still has not been exercised live; an environment-scoped external sharing opt-in remains mandatory. No human GitHub approval, merge or production permission is delegated.

The provider policy preflight also runs a temporary-Git **three-process model candidate rehearsal** (QA CLI, Security CLI, Reviewer CLI), including tampered-artifact negative tests. It neither calls OpenRouter nor creates a GitHub PR. Live source-approved provider/PR creation remain unproven.
