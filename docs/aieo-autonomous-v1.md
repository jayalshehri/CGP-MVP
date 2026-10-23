# AIEO Autonomous Developer v1 — guarded pilot

This is a **single approved real-code repair path**, not an unrestricted independent coding agent.

- Protect main. No automatic merges or production deployments.
- Push runs only read-only validations.
- Draft creation job is manual and requires `aieo-ai` approval; the automation token is restricted to creating a branch and Draft PR.
- Edit policy is fail-closed and permits only a specific route matching fix in `components/FeedbackWidget.tsx`.
- Full lint, typecheck, and build must pass before branch push and Draft PR.
- Requires repository Actions policy allowing GitHub Actions to create pull requests, plus configured environment branch allowlisting.
- Existing PR #42 already has the candidate repair; duplicate changes return NO_CHANGE. No migration or database access.
- Not yet validated as autonomous end-to-end; opening the Draft PR can be blocked by GitHub branch, token, workflow or environment protections.
- Additional error discovery, broader model-generated fixes and retry loops require separate secure review before activation.
