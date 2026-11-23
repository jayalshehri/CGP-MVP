// Read-only regression tests for separation between CI checks and write-capable jobs.
// These guardrails are not a substitute for GitHub branch protection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOnlyGitEnvironment } from './aieo-git-process-guard.mjs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const model = read('.github/workflows/aieo-model-draft.yml');
const developer = read('.github/workflows/aieo-developer-draft.yml');
const foundation = read('.github/workflows/aieo-multi-agent.yml');
const fixture = read('.github/workflows/aieo-fixture-e2e.yml');
const publisher = read('scripts/aieo-publish-draft.mjs');
const provider = read('aieo/lib/model-provider.mjs');
const candidateRoles = read('.github/workflows/aieo-model-candidate-roles.yml');
const finalizer = read('scripts/aieo-candidate-finalize.mjs');

test('independent role artifacts are downloaded only into precreated private directories', () => {
  for (const [name, workflow] of [
    ['foundation', foundation],
    ['model-candidate', candidateRoles]
  ]) {
    for (const role of ['qa', 'security', 'reviewer']) {
      const part = workflow.split('\n  ' + role + ':\n')[1]?.split(/\n  [a-z][a-z-]*:\n/)[0];
      assert.ok(part, name + '/' + role + ': role job missing');
      const prepare = part.indexOf('run: mkdir -m 700 -- aieo-output');
      const firstDownload = part.indexOf('uses: actions/download-artifact@');
      assert.ok(prepare >= 0 && firstDownload > prepare,
        name + '/' + role + ': precreate private evidence dir BEFORE first extraction');
      assert.match(part.slice(0, prepare), /name: (?:Create private destination|Prepare private evidence directory)/,
        name + '/' + role + ': private preparation must be an explicit CI step');
    }
  }
});

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

test('model source review and build cannot execute on a GitHub write-token runner', () => {
  const proposed = model.split('\n  create-model-draft:\n')[1]
    .split('\n  publish-model-draft:\n')[0];
  const publisherJob = model.split('\n  publish-model-draft:\n')[1];
  assert.ok(proposed && publisherJob, 'candidate and publisher must be separate jobs');
  assert.match(proposed, /permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(proposed, /^\s*(?:contents|pull-requests|actions): write/m,
    'candidate, provider and npm build may not inherit the GitHub write token');
  assert.match(proposed, /environment: aieo-ai/);
  assert.match(proposed, /name: Handoff bounded model evidence without write credentials/);
  assert.match(proposed, /uses: actions\/upload-artifact@[a-f0-9]{40}/);
  assert.doesNotMatch(proposed, /run: node scripts\/aieo-publish-draft\.mjs/);
  assert.match(publisherJob, /needs: create-model-draft/);
  assert.match(publisherJob, /contents: write/);
  assert.match(publisherJob, /pull-requests: write/);
  assert.match(publisherJob, /actions: write/);
  assert.doesNotMatch(publisherJob, /OPENROUTER_API_KEY|OPENROUTER_MODEL_ID|AIEO_MODEL_APPLY/,
    'fresh publisher runner cannot hold provider credentials');
  assert.match(publisherJob, /persist-credentials: false/);
  assert.match(publisherJob, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(publisherJob, /name: aieo-reviewed-model-evidence\s*\n\s*path: aieo-staging/);
  assert.ok(publisherJob.indexOf('node scripts/aieo-stage-reviewed-model.mjs') <
    publisherJob.indexOf('node scripts/aieo-publish-draft.mjs'),
    'artifact must be validated and staged before write credential');
  const publisherStep = publisherJob.slice(publisherJob.indexOf(
    '      - name: Publish independently verified candidate as Draft PR only'));
  assert.match(publisherStep, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.doesNotMatch(publisherJob.slice(0, publisherJob.indexOf(
    '      - name: Publish independently verified candidate as Draft PR only')),
    /GH_TOKEN: \$\{\{ github\.token \}\}/,
    'no GitHub write credential may be exposed to the artifact importer');
  for (const file of ['components/FeedbackWidget.tsx', 'model-proposal.json',
    'model-qa.json', 'model-security.json', 'model-reviewer.json']) {
    assert.ok(proposed.includes(file), 'artifact handoff must explicitly name ' + file);
  }
  assert.ok(model.includes("'scripts/aieo-stage-reviewed-model*.mjs'"));
  assert.ok(model.includes('scripts/aieo-stage-reviewed-model.test.mjs'));
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
    assert.match(script, /ghExecutable = pinReadOnlyGitHubCli\(process.env\)/,
      'the role must pin its GitHub CLI before credential-bearing API calls');
    assert.match(script, /execFileSync\(ghExecutable, \['api'/,
      'explicit GH API calls must use the pinned executable');
    assert.match(script, /env: readOnlyGitHubCliEnvironment\(process.env\)/,
      'only explicitly scoped API children may receive the GH token');
    assert.doesNotMatch(script, /execFileSync\('gh'/,
      'PATH must never re-resolve a credential-bearing GH executable');
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
  assert.ok(replay.includes('readStrictReviewedGitSource(head, pinnedReplayGitExecutable)'));
  assert.ok(replay.includes('pinnedReplayGitExecutable = pinReadOnlyGitExecutable(process.env)'));
  assert.ok(replay.includes('assertNoTrackedGitFilters(process.env, pinnedReplayGitExecutable)'));
  assert.ok(replay.includes("const diff = gitRaw('diff'"),
    'raw Git diffs must use the pinned executable without trimming hash-bound bytes');
  assert.doesNotMatch(replay, /execFileSync\(\s*['"]git['"]/,
    'pre-build replay must never resolve a new Git executable from PATH');
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
    '.github/workflows/aieo-multi-agent.yml',
    '.github/workflows/aieo-fixture-e2e.yml'
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


test('trusted AIEO run steps clear inherited Bash and Node startup hooks before any sensitive execution', () => {
  // A previous build/agent step can append BASH_ENV or NODE_OPTIONS to
  // GITHUB_ENV. An injected BASH_ENV is sourced before "run:" starts;
  // NODE_OPTIONS can preload JS before a runtime guard has any effect.
  // Step-level overrides remain necessary even with guarded entrypoints.
  const verifySteps = (workflow, names) => {
    for (const [name, count] of names) {
      const marker = '      - name: ' + name + '\n';
      const segments = workflow.split(marker).slice(1);
      assert.equal(segments.length, count, name + ' step count changed');
      for (const segment of segments) {
        const step = segment.split('\n      - ')[0];
        const command = step.indexOf('        run:');
        assert.ok(command >= 0, name + ' must have a run command');
        const beforeRun = step.slice(0, command);
        assert.ok(beforeRun.includes('        env:\n'), name + ' must have step-scoped env');
        for (const key of ['BASH_ENV', 'NODE_OPTIONS']) {
          assert.ok(beforeRun.includes("          " + key + ": ''\n"),
            name + ' must clear inherited ' + key + ' before shell/Node startup');
        }
      }
    }
  };
  verifySteps(model, [
    ['Block absent or stale independent-review workflow before model disclosure', 1],
    ['Request one bounded model proposal (provider-only credentials)', 1],
    ['Independently check candidate QA without model credentials', 1],
    ['Independently check candidate Security without model credentials', 1],
    ['Independently review QA and Security evidence without model credentials', 1],
    ['Independently verify application build', 1],
    ['Publish independently verified candidate as Draft PR only', 1]
  ]);
  verifySteps(developer, [
    ['Prepare trusted one-file patch', 1],
    ['Run application gates on candidate', 1],
    ['Publish verified bounded fix as Draft PR only', 1]
  ]);
  verifySteps(candidateRoles, [
    ['Verify bounded candidate using trusted code', 4],
    ['Independently lint, typecheck and build approved candidate', 1],
    ['Re-attest independently reviewed candidate and remote Draft after build', 1]
  ]);
});


test('clearing startup hook environment prevents code execution before guarded entrypoints', (t) => {
  // Synthetic, offline proof: bash sources BASH_ENV before its command and
  // node executes a NODE_OPTIONS --require module before the entrypoint.
  // The same explicit empty step env values prevent both preflight bypasses.
  const directory = mkdtempSync(join(tmpdir(), 'aieo-startup-hooks-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bashHook = join(directory, 'inherited-startup.bash');
  const nodeHook = join(directory, 'inherited-preload.cjs');
  writeFileSync(bashHook, "printf 'HOOK_EXECUTED\\n'\n", { mode: 0o600 });
  writeFileSync(nodeHook, "process.stdout.write('HOOK_EXECUTED\\n');\n", { mode: 0o600 });

  const runBash = (env) => execFileSync('bash', ['-c', 'printf RUN'], {
    encoding: 'utf8', stdio: 'pipe', env: { ...process.env, ...env }
  });
  assert.equal(runBash({ BASH_ENV: bashHook }), 'HOOK_EXECUTED\nRUN',
    'control proves inherited BASH_ENV can execute before a run command');
  assert.equal(runBash({ BASH_ENV: '' }), 'RUN',
    'step-scoped empty BASH_ENV blocks inherited shell startup execution');

  const runNode = (env) => execFileSync(process.execPath,
    ['-e', "process.stdout.write('RUN')"], {
      encoding: 'utf8', stdio: 'pipe', env: { ...process.env, ...env }
    });
  assert.equal(runNode({ NODE_OPTIONS: '--require=' + nodeHook }),
    'HOOK_EXECUTED\nRUN',
    'control proves inherited NODE_OPTIONS can preload before runtime validation');
  assert.equal(runNode({ NODE_OPTIONS: '' }), 'RUN',
    'step-scoped empty NODE_OPTIONS blocks inherited JavaScript preloading');
});

test('credentialed AIEO steps use a pre-candidate captured tool PATH, not GITHUB_PATH injections', () => {
  const scenarios = [
    [model, 1, [
      ['Block absent or stale independent-review workflow before model disclosure', 1],
      ['Request one bounded model proposal (provider-only credentials)', 1],
      ['Independently check candidate QA without model credentials', 1],
      ['Independently check candidate Security without model credentials', 1],
      ['Independently review QA and Security evidence without model credentials', 1],
      ['Independently verify application build', 1],
      ['Publish independently verified candidate as Draft PR only', 1]
    ]],
    [developer, 1, [
      ['Prepare trusted one-file patch', 1],
      ['Run application gates on candidate', 1],
      ['Publish verified bounded fix as Draft PR only', 1]
    ]],
    [candidateRoles, 4, [
      ['Verify bounded candidate using trusted code', 4],
      ['Independently lint, typecheck and build approved candidate', 1],
      ['Re-attest independently reviewed candidate and remote Draft after build', 1]
    ]]
  ];
  for (const [workflow, captureCount, steps] of scenarios) {
    const capture = '      - name: Capture trusted PATH before candidate and build steps\n';
    assert.equal(workflow.split(capture).length - 1, captureCount,
      'every credentialed job must capture PATH after trusted Node setup');
    const jobs = workflow.split(capture).slice(1);
    for (const segment of jobs) {
      assert.match(segment, /^        id: trusted-path\n        env:\n          BASH_ENV: ''\n          NODE_OPTIONS: ''\n          LD_PRELOAD: ''\n          LD_AUDIT: ''\n          LD_LIBRARY_PATH: ''\n          LD_DEBUG: ''\n          LD_DEBUG_OUTPUT: ''\n        run: \|\n/m,
        'PATH capture must not inherit executable startup hooks');
      assert.ok(segment.includes('printf \'path=%s\\n\' "$PATH" >> "$GITHUB_OUTPUT"'),
        'captured PATH must be published without executing runner-injected commands');
    }
    for (const [name, count] of steps) {
      const marker = '      - name: ' + name + '\n';
      const sections = workflow.split(marker).slice(1);
      assert.equal(sections.length, count, name + ' step count changed');
      for (const section of sections) {
        const beforeRun = section.split('        run:')[0].split('\n      - ')[0];
        assert.ok(beforeRun.includes('          PATH: ${{ steps.trusted-path.outputs.path }}\n'),
          name + ' must ignore PATH entries appended by prior candidate/build steps');
      }
    }
    assert.ok(workflow.lastIndexOf('        with:\n          node-version: \'24\'\n',
      workflow.indexOf(capture)) >= 0,
      'each first PATH capture must follow setup-node within its runner');
  }
});

test('trusted PATH override defeats a synthetic GITHUB_PATH executable hijack', (t) => {
  // A build hook can append a directory to GITHUB_PATH so its binaries get
  // precedence in the next Actions step. The publisher must use the snapshot
  // made before that hook, even when it starts with scoped GH_TOKEN.
  const directory = mkdtempSync(join(tmpdir(), 'aieo-path-hijack-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const fakeNode = join(directory, 'node');
  writeFileSync(fakeNode, "#!/bin/sh\nprintf 'PATH_HIJACKED\\n'\n", { mode: 0o755 });
  const trustedPath = process.env.PATH;
  assert.ok(trustedPath, 'Node test runner needs a trusted PATH');
  const run = (path) => execFileSync('node',
    ['-e', "process.stdout.write('TRUSTED_NODE\\n')"], {
      env: { ...process.env, PATH: path, NODE_OPTIONS: '', BASH_ENV: '' },
      encoding: 'utf8', stdio: 'pipe'
    });
  assert.equal(run(directory + ':' + trustedPath), 'PATH_HIJACKED\n',
    'control proves the next step would execute an injected node binary');
  assert.equal(run(trustedPath), 'TRUSTED_NODE\n',
    'restoring the pre-build PATH runs the trusted Node binary');
});


test('credentialed AIEO steps clear inherited native-loader hooks before any execution', () => {
  // An npm lifecycle step can persist an LD_PRELOAD or LD_AUDIT setting via
  // GITHUB_ENV. Those libraries execute inside bash/node/git/gh BEFORE any
  // JavaScript Git environment guard, even if PATH and NODE_OPTIONS are pinned.
  const scenarios = [
    [model, [
      ['Capture trusted PATH before candidate and build steps', 1],
      ['Block absent or stale independent-review workflow before model disclosure', 1],
      ['Request one bounded model proposal (provider-only credentials)', 1],
      ['Independently check candidate QA without model credentials', 1],
      ['Independently check candidate Security without model credentials', 1],
      ['Independently review QA and Security evidence without model credentials', 1],
      ['Independently verify application build', 1],
      ['Publish independently verified candidate as Draft PR only', 1]
    ]],
    [developer, [
      ['Capture trusted PATH before candidate and build steps', 1],
      ['Prepare trusted one-file patch', 1],
      ['Run application gates on candidate', 1],
      ['Publish verified bounded fix as Draft PR only', 1]
    ]],
    [candidateRoles, [
      ['Capture trusted PATH before candidate and build steps', 4],
      ['Verify bounded candidate using trusted code', 4],
      ['Independently lint, typecheck and build approved candidate', 1],
      ['Re-attest independently reviewed candidate and remote Draft after build', 1]
    ]]
  ];
  for (const [workflow, steps] of scenarios) {
    for (const [name, count] of steps) {
      const chunks = workflow.split('      - name: ' + name + '\n').slice(1);
      assert.equal(chunks.length, count, name + ' changed without updating the native-loader policy');
      for (const chunk of chunks) {
        const step = chunk.split('\n      - ')[0];
        const beforeRun = step.slice(0, step.indexOf('        run:'));
        assert.ok(step.includes('        run:'), name + ' must be a protected shell invocation');
        for (const key of ['LD_PRELOAD', 'LD_AUDIT', 'LD_LIBRARY_PATH', 'LD_DEBUG', 'LD_DEBUG_OUTPUT']) {
          assert.ok(beforeRun.includes("          " + key + ": ''\n"),
            name + ' must clear inherited ' + key + ' before shell or process startup');
        }
      }
    }
  }
});

test('empty step-scoped LD_PRELOAD blocks native code before Node entrypoint', (t) => {
  if (process.platform !== 'linux') return t.skip('Linux dynamic-loader regression');
  const directory = mkdtempSync(join(tmpdir(), 'aieo-native-loader-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = join(directory, 'payload.c');
  const library = join(directory, 'preload.so');
  const marker = join(directory, 'marker.txt');
  // No network or real credentials: one synthetic constructor just writes a marker.
  writeFileSync(source,
    '#include <stdio.h>\n#include <stdlib.h>\n' +
    '__attribute__((constructor)) static void before_main(void) {' +
    ' const char *name = getenv("AIEO_TEST_LOADER_MARKER");' +
    ' if(name) { FILE *f = fopen(name, "w");' +
    ' if(f) { fputs("LOADED", f); fclose(f); } } }\n');
  execFileSync('cc', ['-shared', '-fPIC', '-o', library, source], { stdio: 'pipe' });
  const baseEnv = { ...process.env, BASH_ENV: '', NODE_OPTIONS: '',
    AIEO_TEST_LOADER_MARKER: marker };
  const run = (injected) => execFileSync(process.execPath,
    ['-e', "process.stdout.write('NODE_STARTED')"], {
      encoding: 'utf8', stdio: 'pipe',
      env: { ...baseEnv, LD_PRELOAD: injected }
    });
  assert.equal(run(library), 'NODE_STARTED');
  assert.equal(readFileSync(marker, 'utf8'), 'LOADED',
    'control proves a preloaded library runs before Node security checks');
  rmSync(marker);
  assert.equal(run(''), 'NODE_STARTED');
  assert.throws(() => readFileSync(marker), { code: 'ENOENT' },
    'an empty step-scoped loader override prevents inherited code execution');
});

test('independent role artifact JavaScript actions clear inherited startup hooks', () => {
  // Unlike a shell run step, actions/upload-artifact boots its own Node
  // process. A candidate build can append NODE_OPTIONS or LD_PRELOAD to
  // GITHUB_ENV so the action is compromised BEFORE artifact handling starts.
  // Protect each role handoff, particularly the post-build Reviewer upload.
  const marker = '      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02';
  const blocks = candidateRoles.split(marker).slice(1);
  assert.equal(blocks.length, 4, 'every role must upload through the pinned action');
  for (const [index, block] of blocks.entries()) {
    const step = block.split('\n      - ')[0];
    const withAt = step.indexOf('        with:\n');
    assert.ok(withAt > 0, 'artifact action requires explicit with inputs');
    const beforeWith = step.slice(0, withAt);
    assert.ok(beforeWith.includes('        env:\n'), 'artifact action must have step-scoped environment');
    for (const key of ['BASH_ENV', 'NODE_OPTIONS', 'LD_PRELOAD',
      'LD_AUDIT', 'LD_LIBRARY_PATH', 'LD_DEBUG', 'LD_DEBUG_OUTPUT']) {
      assert.ok(beforeWith.includes("          " + key + ": ''\n"),
        'artifact JavaScript runtime must not inherit ' + key);
    }
    assert.ok(beforeWith.includes('          PATH: ${{ steps.trusted-path.outputs.path }}\n'),
      'artifact JavaScript runtime must use PATH captured before untrusted candidate work');
    assert.doesNotMatch(beforeWith, /GH_TOKEN|OPENROUTER_API_KEY/,
      'artifact action must not receive CLI or model secrets');
    assert.ok(step.includes('name: aieo-candidate-' +
      ['developer', 'qa', 'security', 'reviewer'][index]),
      'artifact output must retain the expected role identity');
  }
  assert.ok(candidateRoles.lastIndexOf(marker) > candidateRoles.indexOf('npm run build'),
    'Reviewer artifact action must remain protected after running candidate build');
});


test('independent role downloads use exact artifact identities and isolated JavaScript runtimes', () => {
  // A wildcard merge could silently accept an unexpected artifact or
  // overwrite a named handoff. Each job must fetch only the reports it
  // actually needs, before executing any role verification code.
  const marker = '      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093';
  const getJob = (role) => {
    const parts = candidateRoles.split('\n  ' + role + ':\n');
    assert.equal(parts.length, 2, role + ' must have one independent job');
    return parts[1].split(/\n  (?:developer|qa|security|reviewer):\n/)[0];
  };
  const expected = new Map([
    ['developer', []],
    ['qa', ['developer']],
    ['security', ['developer']],
    ['reviewer', ['developer', 'qa', 'security']]
  ]);
  let total = 0;
  for (const [role, names] of expected) {
    const job = getJob(role);
    const blocks = job.split(marker).slice(1);
    assert.equal(blocks.length, names.length, role + ' artifact count must be exact');
    total += blocks.length;
    for (const [index, block] of blocks.entries()) {
      const step = block.split('\n      - ')[0];
      assert.ok(step.includes('        env:\n'), 'download JavaScript action needs scoped env');
      for (const key of ['BASH_ENV', 'NODE_OPTIONS', 'LD_PRELOAD',
        'LD_AUDIT', 'LD_LIBRARY_PATH', 'LD_DEBUG', 'LD_DEBUG_OUTPUT']) {
        assert.ok(step.includes("          " + key + ": ''\n"),
          role + ' download must clear inherited ' + key);
      }
      assert.ok(step.includes('          PATH: ${{ steps.trusted-path.outputs.path }}\n'),
        role + ' download must retain the captured trusted PATH');
      assert.ok(step.includes('        with:\n          name: aieo-candidate-' +
        names[index] + '\n          path: aieo-output'),
        role + ' must fetch the exact ' + names[index] + ' handoff');
      assert.doesNotMatch(step, /pattern:|merge-multiple:|GH_TOKEN:|OPENROUTER_API_KEY:/,
        'no wildcard merges or model/CLI secrets in artifact downloads');
    }
    if (names.length) {
      const verify = job.indexOf('      - name: Verify bounded candidate using trusted code');
      assert.ok(verify > 0, role + ' verification must be explicit');
      assert.ok(job.lastIndexOf(marker) < verify,
        role + ' must download all handoffs before evaluating them');
    }
  }
  assert.equal(total, 5, 'only the five expected handoffs may be downloaded');
  assert.doesNotMatch(candidateRoles, /pattern: aieo-candidate-\*|merge-multiple: true/,
    'the independent reviewer must not merge wildcard artifact namespaces');
});

test('synthetic multi-agent jobs consume only their exact role artifacts', () => {
  // Reviewer must not merge the orchestrator report or unrelated artifact
  // namespaces into the three independently attested role JSON handoffs.
  const download = '      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093';
  const required = new Map([
    ['developer', []],
    ['qa', ['developer']],
    ['security', ['developer']],
    ['reviewer', ['developer', 'qa', 'security']]
  ]);
  let total = 0;
  for (const [role, names] of required) {
    const sections = foundation.split('\n  ' + role + ':\n');
    assert.equal(sections.length, 2, role + ' must have exactly one job');
    const job = sections[1].split(/\n  (?:developer|qa|security|reviewer):\n/)[0];
    const downloads = job.split(download).slice(1);
    assert.equal(downloads.length, names.length, role + ' must consume only approved handoffs');
    total += downloads.length;
    for (const [index, value] of downloads.entries()) {
      const step = value.split('\n      - ')[0];
      assert.ok(step.includes('        with:\n          name: aieo-' + names[index] +
        '\n          path: aieo-output'), 'download must pin exact role and evidence directory');
      assert.doesNotMatch(step, /pattern:|merge-multiple:/,
        'wildcard or merged artifact downloads are not approved handoffs');
    }
    if (names.length) {
      assert.ok(job.lastIndexOf(download) < job.indexOf('      - run: node scripts/aieo-role.mjs ' + role),
        role + ' must verify downloaded evidence before writing its own report');
    }
  }
  assert.equal(total, 5, 'only five explicit inter-job downloads are expected');
  assert.doesNotMatch(foundation, /pattern:\s*aieo-\*|merge-multiple:\s*true/,
    'do not admit untrusted artifact namespaces into synthetic Reviewer');
});


test('deterministic patch build and publisher use isolated runners and exact one-file handoff', () => {
  const prepare = developer.split('\n  create-draft:\n')[1]?.split('\n  publish-draft:\n')[0];
  const publish = developer.split('\n  publish-draft:\n')[1];
  assert.ok(prepare && publish, 'developer prepare and publisher require distinct jobs');
  assert.match(prepare, /permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(prepare, /^\s*(?:contents|pull-requests|actions): write/m,
    'npm build and candidate cannot receive a write-scoped GitHub token');
  assert.match(prepare, /changed: \$\{\{ steps\.proposal\.outputs\.changed \}\}/);
  assert.match(prepare, /node scripts\/aieo-runner\.mjs/);
  assert.match(prepare, /npm run build/);
  assert.doesNotMatch(prepare, /GH_TOKEN:|run: node scripts\/aieo-publish-draft\.mjs/);
  assert.match(prepare, /name: Handoff bounded developer candidate without write credentials/);
  assert.match(prepare, /uses: actions\/upload-artifact@[a-f0-9]{40}/);
  assert.match(prepare, /name: aieo-reviewed-developer-source\s*\n\s*path: components\/FeedbackWidget\.tsx/);
  assert.match(publish, /needs: create-draft/);
  assert.match(publish, /needs\.create-draft\.outputs\.changed == 'true'/);
  assert.match(publish, /contents: write/);
  assert.match(publish, /pull-requests: write/);
  assert.match(publish, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(publish, /persist-credentials: false/);
  assert.match(publish, /uses: actions\/download-artifact@[a-f0-9]{40}/);
  assert.match(publish, /name: aieo-reviewed-developer-source\s*\n\s*path: aieo-staging\/components/);
  assert.match(publish, /name: Capture isolated developer publisher PATH/);
  assert.ok(publish.indexOf('node scripts/aieo-stage-reviewed-developer.mjs') <
    publish.indexOf('node scripts/aieo-publish-draft.mjs'),
    'staging and integrity checks must precede write-token availability');
  assert.doesNotMatch(publish, /npm ci|npm run build|AIEO_APPLY:|AIEO_TASK:/,
    'fresh credentialed publisher cannot run the patcher or npm scripts');
  const finalStep = publish.indexOf('      - name: Publish verified bounded fix as Draft PR only');
  assert.ok(finalStep > 0);
  assert.doesNotMatch(publish.slice(0, finalStep), /GH_TOKEN: \$\{\{ github\.token \}\}/,
    'no GitHub write credential is exposed during artifact import');
  assert.match(publish.slice(finalStep), /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(publish.slice(finalStep), /AIEO_PUBLISH_MODE: deterministic/);
  assert.ok(developer.includes('scripts/aieo-stage-reviewed-developer.test.mjs'));
  const importer = read('scripts/aieo-stage-reviewed-developer.mjs');
  assert.match(importer, /process\.env\[name\]/,
    'importer must reject live credentials even with synthetic env argument');
  assert.match(importer, /JSON\.stringify\(readdirSync\(path\)\.sort\(\)\)/,
    'importer must reject unexpected artifact paths');
});


test('five-job synthetic GitHub fixture remains read-only, PR-scoped and pinned', () => {
  // A pull_request job runs code from a potentially untrusted branch. This
  // fixture must never become a privileged publish/dispatch workflow.
  assert.match(fixture, /^on:\n  pull_request:\n/m);
  assert.doesNotMatch(fixture,
    /^\s*(?:push|pull_request_target|workflow_dispatch|workflow_run|repository_dispatch):/m);
  assert.match(fixture, /^permissions:\n  contents: read\n/m);
  assert.doesNotMatch(fixture,
    /^\s*(?:contents|pull-requests|actions|id-token|packages|deployments): write/m);
  assert.doesNotMatch(fixture, /GH_TOKEN:|GITHUB_TOKEN:|OPENROUTER_API_KEY:|secrets\./,
    'synthetic roles must never receive a publishing or provider credential');
  assert.doesNotMatch(fixture, /gh\s+(?:pr\s+create|auth|api)|git\s+push|npm\s+(?:install|ci)/,
    'this four-agent proof must not publish, authenticate or run install scripts');

  const jobIds = [...fixture.matchAll(/^  ([a-z][a-z-]+):\n    name:/gm)]
    .map(match => match[1]);
  assert.deepEqual(jobIds,
    ['developer', 'qa', 'security', 'reviewer', 'handoff-rejection'],
    'the fixture must retain four separate roles and one negative-test job');

  const downloads = '      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093';
  const jobs = new Map([
    ['developer', []],
    ['qa', ['developer']],
    ['security', ['developer']],
    ['reviewer', ['developer', 'qa', 'security']],
    ['handoff-rejection', ['developer', 'qa', 'security']]
  ]);
  for (const [role, expected] of jobs) {
    const fragments = fixture.split('\n  ' + role + ':\n');
    assert.equal(fragments.length, 2, role + ' must have exactly one independent job');
    const job = fragments[1].split(
      /\n  (?:developer|qa|security|reviewer|handoff-rejection):\n/)[0];
    assert.match(job, /runs-on: ubuntu-latest/);
    assert.match(job, /persist-credentials: false/,
      role + ' checkout must not retain GitHub credentials');
    const sections = job.split(downloads).slice(1);
    assert.equal(sections.length, expected.length,
      role + ' must download exactly the approved evidence count');
    for (const [i, section] of sections.entries()) {
      const step = section.split('\n      - ')[0];
      assert.ok(step.includes(
        '        with:\n          name: aieo-fixture-' + expected[i] +
        '\n          path: aieo-fixture/aieo-output'),
      role + ' must pin an exact role artifact with no wildcard merge');
      assert.doesNotMatch(step, /pattern:|merge-multiple:|run-id:/);
    }
    if (role === 'qa' || role === 'security' || role === 'reviewer') {
      const imported = job.indexOf('node ../scripts/aieo-import-handoffs.mjs foundation');
      const executed = job.indexOf('node ../scripts/aieo-role.mjs ' + role);
      assert.ok(imported > 0 && executed > imported,
        role + ' must inspect exact downloaded reports before independent execution');
    }
    if (role === 'handoff-rejection') {
      assert.ok(job.includes('node ../scripts/aieo-import-rejection-fixture.mjs'));
      assert.ok(job.includes('node ../scripts/aieo-handoff-rejection-fixture.mjs'));
    }
  }
  assert.doesNotMatch(fixture, /merge-multiple:|pattern: aieo-/,
    'an unexpected artifact must not be merged into verified evidence');
  assert.match(fixture, /git diff --exit-code -- components\/FeedbackWidget\.tsx/,
    'the synthetic fixture must assert application source has not changed');
});
