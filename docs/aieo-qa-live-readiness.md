# AIEO QA execution gate — handoff

Current status: **mock-tested only**, not live-activated.

- No real AI Gateway key has been installed or used.
- AIEO v8 connects to the AI Gateway endpoint and rejects unapproved candidate responses.
- AIEO v10 checks manual event, exact branch, explicit opt-in, valid model and presence of key before invoking the adapter.
- This v11 suite tests end-to-end approved and rejected responses, and proves blocked invocations cause zero network calls.

## Production isolation
Never use production credentials. Do not pass source code or sensitive user data in diagnostics. Do not give GitHub Actions write permissions. Do not deploy or merge from these exploratory PRs.

## Remaining activation requirements
A secure QA secret location, a model ID approved for the intended provider, an authenticated manual launch path on a separately reviewed/default-branch workflow (GitHub workflow_dispatch registration constraint), cost limits, and independent security review. The protected `aieo-ai` environment's reviewer and branch settings still require verification; no workaround or bypass is authorized.

The v11 CI remains read-only, synthetic and safe without credentials.
