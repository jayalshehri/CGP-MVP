# Phase 10 safety gates

This branch is a **prototype**, not an autonomous fixer.

- Phase 9 image digest must be independently reviewed and configured as repository variable `AIEO_NODE_IMAGE`.
- Workflow `AIEO Phase 10 Controlled Proposal` is manual only and uses environment `aieo-ai`; configure reviewers and a scoped `AIEO_OPENAI_API_KEY` before invoking.
- Model sees only a synthetic fixture, never actual source code, CI logs, secrets, or evidence.
- Model outputs a proposal artifact, not a patch; no write token granted.
- Fixture gate runs inside a non-root, offline, read-only container. It simulates a fix but **does not apply** it.
- Automatic Draft PR creation is **not enabled**: require passed Phase 9 and 10 CI, tested semantic patch checks, code review, and a scoped GitHub App before introducing repo write permissions.
- Do not merge, deploy, migrate, or touch production as part of these jobs.
