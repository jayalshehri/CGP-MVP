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
const candidateRoles = read('.github/workflows/aieo-model-candidate-roles.yml');
const finalizer = read('scripts/aieo-candidate-finalize.mjs');

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

test('model provider source cannot be contacted before trusted main role preflight', () => {
  assert.ok(model.includes('scripts/aieo-review-readiness.test.mjs'),
    'mock-only preflight tests must exercise missing main review workflow');
  assert.ok(model.includes("      - 'scripts/aieo-review-readiness*.mjs'"),
    'readiness changes must trigger pull request preflight');
  const preflight = model.indexOf('run: node scripts/aieo-review-readiness.mjs');
  const provider = model.indexOf('node scripts/aieo-model-proposal.mjs');
  assert.ok(preflight > 0 && provider > preflight,
    'main reviewer workflow and independent role files must be checked before source disclosure');
  assert.match(model, /Block absent or stale independent-review workflow before model disclosure/);
  assert.ok(model.includes('GH_TOKEN:'), 'workflow preflight must use GitHub token');
});

test('approved source-sharing task is bound at proposal and publisher boundaries', () => {
  assert.equal((model.match(/AIEO_MODEL_TASK: \$\\{\\{ inputs\\.task \\}\\}/g) || []).length, 2,
    'the same manual task must reach both the model provider and Draft publisher');
  assert.ok(publisher.includes('proposal?.sourceShared !== true'));
  assert.ok(publisher.includes('proposal?.taskHash'));
  assert.ok(publisher.includes('proposal?.dispatchRunId'));
  assert.ok(publisher.includes('proposal?.dispatchRunAttempt'));
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

test('dispatched independent model candidate roles are read-only and run trusted main code', () => {
  assert.match(candidateRoles, /workflow_dispatch:\s*\n/);
  assert.doesNotMatch(candidateRoles, /(?:^|\n)\s*pull_request(?:_target)?:/);
  assert.match(candidateRoles, /permissions:\s*\n\s*contents: read\s*\n\s*pull-requests: read/);
  assert.doesNotMatch(candidateRoles, /(?:contents|actions|pull-requests|id-token): write/);
  assert.match(candidateRoles, /ref: \$\{\{ github.sha \}\}/);
  assert.match(candidateRoles, /persist-credentials: false/);
  for (const role of ['developer', 'qa', 'security', 'reviewer']) {
    assert.ok(candidateRoles.includes('node scripts/aieo-candidate-role.mjs ' + role));
  }
  assert.doesNotMatch(candidateRoles, /^env:\s*\n\s*GH_TOKEN:/m,
    'candidate build must not inherit GitHub credentials at workflow scope');
  assert.equal((candidateRoles.match(/GH_TOKEN: \$\{\{ github.token \}\}/g) || []).length, 5,
    'only the four role CLI steps and post-build re-attestation receive a read-only token');
  assert.ok(candidateRoles.includes('node scripts/aieo-candidate-finalize.mjs'));
  assert.ok(finalizer.includes("pr.draft !== true"));
  assert.ok(finalizer.includes("pr.head?.sha !== head"));
  assert.doesNotMatch(finalizer, /(?:['"]pr merge['"]|--auto-merge|--force-with-lease)/);
  assert.ok(publisher.includes("'aieo-model-candidate-roles.yml'"));
  assert.ok(publisher.includes("'dispatched-not-proven'"));
});

test('independent model QA and Security read candidate through bounded inode verification', () => {
  const qa = read('scripts/aieo-model-gates.mjs');
  const security = read('scripts/aieo-model-security.mjs');
  for (const script of [qa, security]) {
    assert.ok(script.includes('readVerifiedModelCandidate()'));
    assert.doesNotMatch(script, /readFileSync\(MODEL_ALLOWED_PATH/);
  }
  assert.ok(model.includes('scripts/aieo-model-candidate-read.test.mjs'));
});


test('model preflight also runs when security-critical role evidence and reviewer workflow change', () => {
  for (const path of [
    'scripts/aieo-role-artifact-io.mjs',
    'scripts/aieo-candidate-finalize*.mjs',
    'scripts/aieo-workflow-policy.test.mjs',
    '.github/workflows/aieo-model-candidate-roles.yml'
  ]) {
    assert.ok(model.includes("      - '" + path + "'"),
      'safety preflight must cover changed ' + path);
  }
});
