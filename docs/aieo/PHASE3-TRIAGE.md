# AIEO Phase 3 — First agent, controlled autonomy

Status: prototype only, on isolated branch. It is **not** a live autonomous fixer.

- The workflow runs a synthetic CI job summary, with read-only repository permissions.
- The script can optionally call OpenAI Responses API, but the workflow **does not** provide an API key and sets AIEO_USE_MODEL=false.
- No source code, raw CI logs, user evidence, tokens or database data are sent to an external AI service.
- No issue writing, pull requests, merge, deployment, or database operations.
- Review artifact and verify outputs before allowing real CI metadata.
- Next gate: review privacy and cost limits, use GitHub Actions read-only access to fetch bounded job summaries, then explicitly approve adding an API secret in a protected environment.
- Only after those gates consider draft-PR repair with scoped short-lived credentials and QA verification.
