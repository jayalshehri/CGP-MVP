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
