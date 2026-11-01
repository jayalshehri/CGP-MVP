# AIEO Designer + Developer Review Pilot

Scope: **read-only, offline deterministic reviewers** of checked-out `app/` and `components/`. No external model calls, browser, Supabase, source sharing, write token, merge, branch mutation or deployment.

- Designer checks heuristically for Latin-field direction, error announcements, inline hardcoded colors.
- Developer checks heuristically for empty catch blocks, console error logging and raw HTML injection surfaces.
- Both report locations and recommendations without including source excerpts, tokens or evidence contents.
- Fixed path scope, size limits, symlinks skipped, SHA-256 file manifest hash and unit regression tests.
- A GitHub Action runs both after independent unit tests with `contents: read` only and uploads 7-day JSON reports.
- The output `human-review-required` is *not* a validated defect list, UX acceptance, live autonomous AI review or authorization to change application code.
- This is **not** general autonomous Developer: it does not generate or apply fixes. Scope expansion to a real AI provider requires explicit review of source sharing and separate security gates.

Run in a trusted checkout: `node --test scripts/aieo-ui-code-review.test.mjs`, then `node scripts/aieo-ui-code-review.mjs designer` and `node scripts/aieo-ui-code-review.mjs developer`. Read `aieo-output/*-review.json`.

Do not merge this Draft without review. Keep unrelated CGP internal release PR #109 unchanged.
