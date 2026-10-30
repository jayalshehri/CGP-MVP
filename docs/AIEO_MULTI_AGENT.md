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

GitHub Actions workflow "AIEO Multi-Agent Foundation" executes:
- node --test scripts/aieo-agent.test.mjs
- node scripts/aieo-runner.mjs
- git diff --exit-code -- components/FeedbackWidget.tsx

Its GitHub token has read-only repository permissions and it receives no external API keys. The normal "CGP Required CI" separately handles lint, typecheck and build.

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
