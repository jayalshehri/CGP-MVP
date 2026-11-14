# AIEO Phase 1 — Controlled autonomy foundation

Status: **proposal on isolated branch, not deployed**.

## Scope
- Introduce a read-only CI workflow for lint, TypeScript checks, and Next.js build.
- No OpenAI API key, database credentials, production URL, or privileged GitHub token is provided.
- No automatic code repair, issue writing, merging, database migrations, or deployments in Phase 1.
- CI runs on pull requests targeting main and pushes to aieo/* branches. No cron in this phase.

## Existing checks
- package.json has `lint`, `build`, and `qa` scripts.
- `scripts/qa-smoke.mjs` explicitly rejects known Production URLs and Supabase project IDs, but can skip authenticated checks when QA credentials are absent.
- The new CI does not run QA smoke tests without a separately approved QA-only environment.

## Required human GitHub settings (not changed by this branch)
1. Confirm repository visibility is appropriate and review the full Git history for exposed secrets.
2. Protect main with pull requests, required successful CI checks, no force-push, and no deletion.
3. Require at least one independent human approval; prevent self-approval by agents.
4. Restrict GitHub Actions workflow permissions to read-only by default.
5. Restrict deployment credentials to protected environments with human reviewers.
6. Enable Dependabot/security alerts where supported; do not give PR code production secrets.
7. Verify the Vercel Production branch is main and that QA Preview does not point at Production Supabase.

## Verification and gates
- Inspect the CI run for lint/typecheck/build failures and fix only in the isolated branch.
- Review GitHub Actions minutes and workflow security before enabling AI-driven coding.
- Human review and explicit approval are required before merging into main.
- Production and QA database settings are unchanged.

## Next phases (not yet implemented)
- Add deterministic QA checks with mandatory QA-only credentials and a hard failure on missing configuration.
- Add a triage agent with minimal scoped token and strict cost limits.
- Allow repair agents to open draft PRs only, after security and test gates are verified.
