// Read-only regression tests for separation between CI checks and write-capable jobs.
// These guardrails are not a substitute for GitHub branch protection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readOnlyGitEnvironment } from './aieo-git-process-guard.mjs';

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
  const dispatchInput = 'AIEO_MODEL_TASK: ' + String.fromCharCode(36, 123, 123) +
    ' inputs.task ' + String.fromCharCode(125, 125);
  assert.equal(model.split(dispatchInput).length - 1, 2,
    'the same manual task must reach both the model provider and Draft publisher');
  assert.ok(publisher.includes('proposal?.sourceShared !== true'));
  assert.ok(publisher.includes('proposal?.taskHash'));
  assert.ok(publisher.includes('proposal?.dispatchRunId'));
  assert.ok(publisher.includes('proposal?.dispatchRunAttempt'));
  assert.ok(publisher.includes('proposal?.sourceCommitSha !== env.GITHUB_SHA'));
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
  assert.ok(finalizer.includes("git('ls-files', '--others', '--ignored'"),
    'post-build must inspect ignored files instead of treating all excludes as safe');
  assert.ok(finalizer.includes("'node_modules/', '.next/', 'next-env.d.ts', 'tsconfig.tsbuildinfo'"),
    'only explicit generated outputs may be excluded from post-build inspection');
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

test('inherited Git process guard is shared and covered by the model safety workflow', () => {
  const guard = read('scripts/aieo-git-process-guard.mjs');
  const role = read('scripts/aieo-candidate-role.mjs');
  const finalize = read('scripts/aieo-candidate-finalize.mjs');
  assert.ok(model.includes("'scripts/aieo-git-process-guard.mjs'"));
  for (const source of [role, finalize, publisher]) {
    assert.match(source, /hasUnsafeGitEnvironment/);
  }
  assert.match(guard, /GIT_CONFIG/);
  assert.match(guard, /GIT_TRACE/);
  assert.match(guard, /GIT_SSL_NO_VERIFY/);
});

test('independent role and finalizer Git calls scrub credentials while gh retains API-only token', () => {
  const guard = read('scripts/aieo-git-process-guard.mjs');
  const role = read('scripts/aieo-candidate-role.mjs');
  const finalize = read('scripts/aieo-candidate-finalize.mjs');
  assert.match(guard, /export function readOnlyGitEnvironment/);
  for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'OPENROUTER_API_KEY']) {
    assert.equal(Object.hasOwn(readOnlyGitEnvironment({ [key]: 'synthetic-only' }), key), false,
      key + ' must be absent from the Git child environment');
  }
  for (const script of [role, finalize]) {
    assert.ok((script.match(/env: readOnlyGitEnvironment\(process.env\)/g) || []).length >= 2,
      'every Git subprocess, including raw immutable-blob reads, must scrub tokens');
    assert.ok(script.includes("execFileSync('gh'"),
      'only explicit GitHub API subprocesses retain the scoped read token');
  }
});


test('external model credential is absent from independent QA, Security, Reviewer, build and publisher steps', () => {
  const namedSteps = [
    'Request one bounded model proposal (provider-only credentials)',
    'Independently check candidate QA without model credentials',
    'Independently check candidate Security without model credentials',
    'Independently review QA and Security evidence without model credentials',
    'Independently verify application build',
    'Publish independently verified candidate as Draft PR only'
  ];
  const starts = namedSteps.map((name) => model.indexOf('      - name: ' + name));
  assert.ok(starts.every((offset) => offset > 0), 'all role and publisher steps are explicit');
  assert.ok(starts.every((offset, index) => index === 0 || starts[index - 1] < offset),
    'model, independent roles, build and publication must execute in sequence');
  const segments = starts.map((offset, index) =>
    model.slice(offset, index + 1 < starts.length ? starts[index + 1] : undefined));

  assert.match(segments[0], /OPENROUTER_API_KEY: \$\{\{ secrets\.OPENROUTER_API_KEY \}\}/);
  assert.match(segments[0], /run: node scripts\/aieo-model-proposal\.mjs/);
  for (const [index, cli] of [
    [1, 'node scripts/aieo-model-gates.mjs qa'],
    [2, 'node scripts/aieo-model-security.mjs'],
    [3, 'node scripts/aieo-model-gates.mjs reviewer']
  ]) {
    assert.ok(segments[index].includes(cli), 'independent review step must execute ' + cli);
  }
  for (const [index, segment] of segments.entries()) {
    if (index === 0) continue;
    assert.doesNotMatch(segment, /OPENROUTER_API_KEY|OPENROUTER_MODEL_ID|AIEO_MODEL_APPLY/,
      'the provider key and model execution configuration may exist only in proposal step');
  }
  assert.equal((model.match(/OPENROUTER_API_KEY/g) || []).length, 2,
    'secret reference and its scoped environment name must occur in one step only');
  assert.ok(segments[3].includes('git diff --check'),
    'independent reviewer must preserve the diff preflight before the build');
  assert.ok(segments[3].includes('git diff --name-only'),
    'independent reviewer must verify one-file scope before the build');
});


test('independent candidate build replays an immutable, reviewed blob before npm executes', () => {
  const replay = read('scripts/aieo-candidate-replay.mjs');
  assert.ok(candidateRoles.includes('node scripts/aieo-candidate-replay.mjs'));
  assert.doesNotMatch(candidateRoles, /git show "\$HEAD_SHA:/);
  assert.ok(model.includes("      - 'scripts/aieo-candidate-replay*.mjs'"));
  assert.ok(replay.includes('readStrictReviewedGitSource(head)'));
  assert.ok(replay.includes("readBoundedRoleReport('reviewer')"));
  assert.ok(replay.includes('hasUnsafeGitEnvironment'));
  assert.ok(replay.includes('readOnlyGitArguments'));
  assert.ok(replay.includes('expectedReviewer.requiresHumanMerge !== true'));
  assert.ok(replay.includes('replaceTrustedSource(original, candidate)'));
  assert.ok(replay.includes("git('ls-files', '--others', '-z')"),
    'pre-build replay must reject even ignored untracked inputs');
  assert.ok(candidateRoles.indexOf('node scripts/aieo-candidate-replay.mjs') <
    candidateRoles.indexOf('npm ci'), 'verification must run before dependencies/build');
});

test('AIEO action dependencies are pinned to reviewed immutable commits, not movable tags', () => {
  // Pin hashes were resolved from the official actions/* v4 GitHub tag refs
  // on 2026-11-17. Upgrades must deliberately update both workflow and allowlist.
  const pinned = new Map([
    ['actions/checkout', '11d5960a326750d5838078e36cf38b85af677262'],
    ['actions/setup-node', '49933ea5288caeca8642d1e84afbd3f7d6820020'],
    ['actions/upload-artifact', 'ea165f8d65b6e75b540449e92b4886f43607fa02'],
    ['actions/download-artifact', 'd3f86a106a0bac45b974a628896c90dbdf5c8093'],
  ]);
  const files = [
    '.github/workflows/aieo-model-draft.yml',
    '.github/workflows/aieo-model-candidate-roles.yml',
    '.github/workflows/aieo-developer-draft.yml',
    '.github/workflows/aieo-multi-agent.yml'
  ];
  for (const path of files) {
    const workflow = read(path);
    const used = [...workflow.matchAll(/^\s*-\s+uses:\s+([^\s#]+)/gm)].map((match) => match[1]);
    assert.ok(used.length > 0, path + ' must have action steps');
    for (const ref of used) {
      const at = ref.lastIndexOf('@');
      const ownerAction = ref.slice(0, at);
      const revision = ref.slice(at + 1);
      assert.ok(pinned.has(ownerAction), path + ' uses unreviewed action ' + ownerAction);
      assert.equal(revision, pinned.get(ownerAction),
        path + ' must pin ' + ownerAction + ' to reviewed full SHA');
    }
    assert.doesNotMatch(workflow, /(?:^|\n)\s*-\s+uses:\s+[^@\s]+@v\d+/,
      path + ' must not use mutable major-version tags');
  }
});
