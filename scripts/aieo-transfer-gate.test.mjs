import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const staging = read('.github/workflows/aieo-transfer-staging.yml');
const real = read('.github/workflows/aieo-model-draft.yml');
const foundation = read('.github/workflows/aieo-multi-agent.yml');
const readiness = read('aieo/LAB_TRANSFER.md');

test('cross-repo lab evidence is accurately scoped to synthetic-only external proof', () => {
  for (const marker of ['41592231110', 'AIEO-LAB/pull/3', 'synthetic', 'not transferred']) {
    assert.ok(readiness.toLowerCase().includes(marker.toLowerCase()), 'missing proof scope: ' + marker);
  }
  assert.match(readiness, /separate-runner isolation/);
  assert.match(readiness, /not.*live OpenRouter invocation in CGP/i);
});

test('staging workflow cannot consume secrets, publish, or merge', () => {
  assert.ok(staging.includes('permissions:\n  contents: read'));
  assert.doesNotMatch(staging, /pull_request_target\s*:/);
  assert.doesNotMatch(staging, /workflow_dispatch\s*:/);
  assert.doesNotMatch(staging, /secrets\.|GH_TOKEN|OPENROUTER_API_KEY|pull-requests:\s*write|contents:\s*write|id-token:\s*write|pr merge|gh pr create/);
  assert.ok(staging.includes('persist-credentials: false'));
  for (const job of ['developer:', 'qa:', 'security:', 'reviewer:']) {
    assert.ok(staging.includes('\n  ' + job), 'missing independent runner: ' + job);
  }
});

test('real CGP model workflow still requires explicit human consent and manual main dispatch', () => {
  assert.ok(real.includes("if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.approve_external_source_sharing == true"));
  assert.ok(real.includes('environment: aieo-ai'));
  assert.ok(real.includes('approved_source_sha256:'));
  assert.ok(real.includes('AIEO_APPROVED_SOURCE_SHA256: ${{ inputs.approved_source_sha256 }}'));
  assert.ok(real.includes('OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}'));
  assert.doesNotMatch(real, /pull_request_target\s*:/);
  assert.ok(foundation.includes('permissions:\n  contents: read'));
});
