// Read-only regression tests for separation between CI checks and write-capable jobs.
// These guardrails are not a substitute for GitHub branch protection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const model = read('.github/workflows/aieo-model-draft.yml');
const developer = read('.github/workflows/aieo-developer-draft.yml');
const foundation = read('.github/workflows/aieo-multi-agent.yml');
const publisher = read('scripts/aieo-publish-draft.mjs');
const provider = read('aieo/lib/model-provider.mjs');

test('provider-backed source sharing stays manual, explicit, and environment-scoped', () => {
  const guard = "if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.approve_external_source_sharing == true";
  assert.ok(model.includes(guard), 'model write job must require trusted manual main dispatch and opt-in');
  assert.match(model, /approve_external_source_sharing:\s*\n(?:.*\n){0,6}\s*default: false/m);
  assert.ok(model.includes('environment: aieo-ai'), 'provider credentials must remain environment-scoped');
  assert.ok(model.includes('OPENROUTER_API_KEY: ' + '$' + '{{ secrets.OPENROUTER_API_KEY }}'));
  assert.ok(model.includes("AIEO_SOURCE_SHARING_APPROVED: 'true'"));
  assert.ok(model.includes('permissions:\n  contents: read'));
  assert.doesNotMatch(model, /pull_request_target\s*:/);
});

test('developer publisher remains manual and no privileged PR event is added', () => {
  assert.ok(developer.includes("if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'"));
  assert.ok(developer.includes('permissions:\n  contents: read'));
  assert.doesNotMatch(developer, /pull_request_target\s*:/);
  assert.ok(developer.includes('persist-credentials: false'));
});

test('multi-agent pull-request checks never request write access', () => {
  assert.ok(foundation.includes('permissions:\n  contents: read'));
  assert.doesNotMatch(foundation, /(?:contents|actions|pull-requests|id-token): write/);
  assert.doesNotMatch(foundation, /pull_request_target\s*:/);
  assert.ok(foundation.includes('persist-credentials: false'));
});

test('publisher cannot bypass human review or invoke model from untrusted PR', () => {
  assert.ok(publisher.includes("env.GITHUB_EVENT_NAME !== 'workflow_dispatch'"));
  assert.ok(publisher.includes("env.GITHUB_REF !== 'refs/heads/main'"));
  assert.ok(publisher.includes("env.GITHUB_REPOSITORY !== 'jayalshehri/CGP-MVP'"));
  assert.ok(publisher.includes("'--draft'"));
  assert.doesNotMatch(publisher, /(?:['"]pr merge['"]|--auto-merge|--force-with-lease)/);
  assert.ok(provider.includes("env.AIEO_SOURCE_SHARING_APPROVED !== 'true'"));
  assert.ok(provider.includes("env.GITHUB_EVENT_NAME !== 'workflow_dispatch'"));
});

test('required app CI covers stacked AIEO PRs with read-only permissions', () => {
  const requiredCI = read('.github/workflows/cgp-required-ci.yml');
  assert.ok(requiredCI.includes("branches: [main, 'aieo/**']"), 'stacked development PRs must run app checks');
  assert.ok(requiredCI.includes('permissions:\n  contents: read'));
  assert.doesNotMatch(requiredCI, /pull_request_target\s*:/);
  assert.doesNotMatch(requiredCI, /(?:contents|actions|pull-requests|id-token): write/);
  assert.ok(requiredCI.includes('persist-credentials: false'));
  for (const check of ['npm ci', 'npm run lint', 'npx next typegen', 'npx tsc --noEmit', 'npm run build']) {
    assert.ok(requiredCI.includes(check), 'missing app CI step: ' + check);
  }
});
