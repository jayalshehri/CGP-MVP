import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';
import { inspectModelQa, inspectModelReviewer } from '../aieo/lib/model-gates.mjs';
import { inspectModelDiff } from './aieo-model-security.mjs';
import { validateDispatch, verifyCandidate, verifyRemoteDraft, verifyTrustedCheckout, verifyCommittedCandidate, verifyNoGitFilter } from './aieo-publish-draft.mjs';

const publisher = join(dirname(fileURLToPath(import.meta.url)), 'aieo-publish-draft.mjs');
const route = String.raw`  const controlId = useMemo(() => /^\/controls\/(\d+)(?:\/|$)/.exec(pagePath)?.[1] ?? null, [pagePath]);`;
const hash = (source) => createHash('sha256').update(source).digest('hex');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'aieo-draft-e2e-'));
  const workspace = join(root, 'workspace');
  const remote = join(root, 'remote.git');
  const bin = join(root, 'bin');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(bin);
  git(root, 'init', '-q', '--bare', remote);
  git(workspace, 'init', '-q');
  git(workspace, 'config', 'user.name', 'Fixture');
  git(workspace, 'config', 'user.email', 'fixture@example.invalid');
  git(workspace, 'remote', 'add', 'origin', remote);
  mkdirSync(join(workspace, 'components'));
  mkdirSync(join(workspace, 'aieo-output'));
  const source = 'function fixture() {\n' + route + '\n  const sample = 1;\n}\n';
  const candidate = source.replace('  const sample = 1;', '  const sample = 2;');
  const target = join(workspace, MODEL_ALLOWED_PATH);
  writeFileSync(target, source);
  git(workspace, 'add', '--', MODEL_ALLOWED_PATH);
  git(workspace, 'commit', '-qm', 'fixture');
  git(workspace, 'branch', '-M', 'main');
  git(workspace, 'push', '-q', '-u', 'origin', 'main');
  // Keep the exact official origin in config while transparently routing fixture
  // Git transport to a local bare repository. No public network is contacted.
  git(workspace, 'config', 'remote.origin.url', 'https://github.com/jayalshehri/CGP-MVP.git');
  git(workspace, 'config', 'url.file://' + remote + '.insteadOf',
    'https://github.com/jayalshehri/CGP-MVP.git');
  writeFileSync(target, candidate);
  const proposal = { schemaVersion: 1, status: 'proposed', path: MODEL_ALLOWED_PATH,
    sourceHash: hash(source), proposedHash: hash(candidate) };
  const diff = git(workspace, 'diff', '--unified=0', '--', MODEL_ALLOWED_PATH);
  const args = { original: source, actual: candidate,
    changedPaths: [MODEL_ALLOWED_PATH], diff, proposal };
  const qa = inspectModelQa({ ...args, report: proposal });
  const security = inspectModelDiff({ ...args, report: proposal });
  const reviewer = inspectModelReviewer({ ...args, qa, security });
  for (const [kind, report] of Object.entries({ proposal, qa, security, reviewer })) {
    writeFileSync(join(workspace, 'aieo-output', 'model-' + kind + '.json'),
      JSON.stringify(report) + '\n');
  }
  const log = join(root, 'fake-gh.log');
  const gh = join(bin, 'gh');
  const view = {
    number: 123, url: 'https://github.com/jayalshehri/CGP-MVP/pull/123',
    isDraft: true, state: 'OPEN', baseRefName: 'main',
    headRefName: 'aieo/model-proposal-99123-1',
    headRefOid: 'AIEO_HEAD_SHA_PLACEHOLDER',
    headRepositoryOwner: { login: 'jayalshehri' },
    isCrossRepository: false
  };
  writeFileSync(gh, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$AIEO_FAKE_GH_LOG"\n' +
    'if [ "$1" = "pr" ] && [ "$2" = "create" ]; then printf "https://github.com/jayalshehri/CGP-MVP/pull/123\\n"; fi\n' +
    'if [ "$1" = "pr" ] && [ "$2" = "view" ]; then\n' +
    '  if [ "$AIEO_FAKE_GH_UNVERIFIED" = "1" ]; then\n' +
    "    printf '%s\\n' '" + JSON.stringify({ ...view, isDraft: false }) + "'\n" +
    '  else\n' +
    "    printf '%s\\n' '" + JSON.stringify(view) + "' | sed \"s/AIEO_HEAD_SHA_PLACEHOLDER/$(git rev-parse HEAD)/g\"\n" +
    '  fi\nfi\n');
  chmodSync(gh, 0o755);
  // The isolated fixture uses a fake destination attestation only for successful
  // local Git push rehearsals. Negative cases disable the shim to exercise the
  // real Git-resolved URL (including url.* rewrites and remote pushurl).
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const shim = join(bin, 'git');
  writeFileSync(shim, [
    '#!/bin/sh',
    'if [ "$1" = "remote" ] && [ "$2" = "get-url" ] && [ "$3" = "--push" ] && [ "$4" = "--all" ] && [ "$5" = "origin" ] && [ "$AIEO_FIXTURE_ATTEST_PUSH" = "true" ]; then',
    '  printf "%s\\n" "https://github.com/jayalshehri/CGP-MVP.git"',
    '  exit 0',
    'fi',
    'exec ' + JSON.stringify(realGit) + ' "$@"',
    ''
  ].join('\n'));
  chmodSync(shim, 0o755);
  const env = { ...process.env,
    PATH: bin + ':' + process.env.PATH, AIEO_FAKE_GH_LOG: log,
    AIEO_FIXTURE_ATTEST_PUSH: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'jayalshehri/CGP-MVP',
    GITHUB_RUN_ID: '99123', GITHUB_RUN_ATTEMPT: '1',
    GITHUB_SHA: git(workspace, 'rev-parse', 'HEAD'),
    GH_TOKEN: 'placeholder-not-a-real-secret',
    AIEO_PUBLISH_MODE: 'model', AIEO_MODEL_ENABLED: 'true',
    AIEO_SOURCE_SHARING_APPROVED: 'true'
  };
  return { root, workspace, remote, log, env, target, args, qa, security, reviewer };
}

test('publisher rejects unsafe dispatch contexts and missing source consent', () => {
  const env = { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'jayalshehri/CGP-MVP', GITHUB_RUN_ID: '77',
    GITHUB_SHA: 'a'.repeat(40),
    GITHUB_RUN_ATTEMPT: '1', GH_TOKEN: 'synthetic', AIEO_PUBLISH_MODE: 'model',
    AIEO_MODEL_ENABLED: 'true', AIEO_SOURCE_SHARING_APPROVED: 'true' };
  assert.equal(validateDispatch(env), 'model');
  for (const overrides of [
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_REF: 'refs/heads/aieo/branch' },
    { GITHUB_REPOSITORY: 'another/repo' },
    { GH_TOKEN: '' },
    { GITHUB_RUN_ID: 'abc' },
    { AIEO_SOURCE_SHARING_APPROVED: 'false' },
    { AIEO_MODEL_ENABLED: 'false' }
  ]) assert.throws(() => validateDispatch({ ...env, ...overrides }));
});


test('publisher verifies exact commit and exactly one resolved same-repo push destination', () => {
  const sha = 'a'.repeat(40);
  const env = { GITHUB_SHA: sha };
  for (const originUrl of [
    'https://github.com/jayalshehri/CGP-MVP',
    'https://github.com/jayalshehri/CGP-MVP.git',
    'git@github.com:jayalshehri/CGP-MVP.git'
  ]) {
    assert.equal(verifyTrustedCheckout({ env, checkedOutSha: sha, originUrl, effectivePushUrls: [originUrl] }), true);
  }
  for (const untrusted of [
    { env: { GITHUB_SHA: 'b'.repeat(40) } },
    { env: { GITHUB_SHA: 'not-a-commit' } },
    { env: {} },
    { checkedOutSha: 'b'.repeat(40) },
    { originUrl: 'file:///tmp/untrusted.git' },
    { originUrl: 'https://github.com/attacker/CGP-MVP.git' },
    { originUrl: 'https://github.com/jayalshehri/CGP-MVP.git@attacker.invalid' },
    { effectivePushUrls: ['file:///tmp/attacker.git'] },
    { effectivePushUrls: ['https://github.com/attacker/CGP-MVP.git'] },
    { effectivePushUrls: [] },
    { effectivePushUrls: undefined },
    { effectivePushUrls: ['https://github.com/jayalshehri/CGP-MVP.git', 'file:///tmp/attacker.git'] },
    { effectivePushUrls: ['https://github.com/jayalshehri/CGP-MVP.git', 'https://github.com/jayalshehri/CGP-MVP.git'] }
  ]) {
    assert.throws(() => verifyTrustedCheckout({
      env, checkedOutSha: sha, originUrl: 'https://github.com/jayalshehri/CGP-MVP.git',
      effectivePushUrls: ['https://github.com/jayalshehri/CGP-MVP.git'],
      ...untrusted
    }), /untrusted source checkout or Git push destination/);
  }
});

test('swapped checkout or destination fails before Git writes or gh invocation', () => {
  for (const kind of ['wrong-sha', 'wrong-origin', 'url-rewrite', 'pushurl', 'multi-pushurl']) {
    const f = fixture();
    try {
      if (kind === 'wrong-origin') {
        git(f.workspace, 'config', 'remote.origin.url', f.remote);
      }
      if (kind === 'pushurl') {
        git(f.workspace, 'config', 'remote.origin.pushurl', 'file://' + f.remote);
      }
      if (kind === 'multi-pushurl') {
        git(f.workspace, 'config', '--add', 'remote.origin.pushurl',
          'https://github.com/jayalshehri/CGP-MVP.git');
        git(f.workspace, 'config', '--add', 'remote.origin.pushurl', 'file://' + f.remote);
        assert.equal(git(f.workspace, 'remote', 'get-url', '--push', '--all', 'origin')
          .split('\n').length, 2, 'Git exposes both configured push destinations');
      }
      const env = { ...f.env,
        ...(kind === 'wrong-sha' ? { GITHUB_SHA: 'f'.repeat(40) } : {}),
        ...(['url-rewrite', 'pushurl', 'multi-pushurl'].includes(kind) ?
          { AIEO_FIXTURE_ATTEST_PUSH: 'false' } : {})
      };
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env, encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(child.status, 0);
      assert.match(child.stderr, /untrusted source checkout or Git push destination/);
      assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
      assert.equal(git(f.workspace, 'ls-remote', '--heads', f.remote).includes('model-proposal-'), false);
      assert.equal(existsSync(f.log), false, 'gh must not be invoked');
    } finally { rmSync(f.root, { force: true, recursive: true }); }
  }
});

test('remote Draft verifier binds the PR to the reviewed commit and same repository', () => {
  const commitSha = 'a'.repeat(40);
  const url = 'https://github.com/jayalshehri/CGP-MVP/pull/123';
  const branch = 'aieo/model-proposal-99123-1';
  const remote = {
    number: 123, url, isDraft: true, state: 'OPEN',
    baseRefName: 'main', headRefName: branch, headRefOid: commitSha,
    headRepositoryOwner: { login: 'jayalshehri' }, isCrossRepository: false
  };
  const verify = (overrides) => verifyRemoteDraft({
    remote: { ...remote, ...overrides }, url, branch, commitSha
  });
  assert.equal(verify({}), true);
  for (const untrusted of [
    { headRefOid: 'b'.repeat(40) },
    { headRefOid: null },
    { headRepositoryOwner: { login: 'untrusted-fork' } },
    { headRepositoryOwner: null },
    { isCrossRepository: true },
    { isCrossRepository: undefined },
    { isDraft: false },
    { state: 'CLOSED' },
    { baseRefName: 'aieo/other' },
    { headRefName: 'aieo/wrong-branch' },
    { number: 124 },
    { url: 'https://github.com/jayalshehri/CGP-MVP/pull/124' }
  ]) assert.throws(() => verify(untrusted));
  assert.throws(() => verifyRemoteDraft({
    remote, url: 'https://github.com/another/repo/pull/123', branch, commitSha
  }));
});

test('publisher independently recomputes model handoffs and blocks forged evidence', () => {
  const f = fixture();
  try {
    assert.equal(verifyCandidate({ mode: 'model', ...f.args,
      reports: { proposal: f.args.proposal, qa: f.qa, security: f.security, reviewer: f.reviewer } }), true);
    assert.throws(() => verifyCandidate({ mode: 'model', ...f.args,
      reports: { proposal: f.args.proposal, qa: { ...f.qa, routeCasesPassed: 0 },
        security: f.security, reviewer: f.reviewer } }));
    assert.throws(() => verifyCandidate({ mode: 'model', ...f.args,
      changedPaths: [MODEL_ALLOWED_PATH, 'package.json'],
      reports: { proposal: f.args.proposal, qa: f.qa, security: f.security, reviewer: f.reviewer } }));
  } finally { rmSync(f.root, { force: true, recursive: true }); }
});

test('committed candidate attestation rejects altered source, scope or base commit', () => {
  const baseSha = 'a'.repeat(40);
  const args = { baseSha, parentSha: baseSha,
    reviewedSource: 'reviewed', committedSource: 'reviewed',
    changedPaths: [MODEL_ALLOWED_PATH] };
  assert.equal(verifyCommittedCandidate(args), true);
  for (const changed of [
    { parentSha: 'b'.repeat(40) },
    { committedSource: 'unreviewed' },
    { changedPaths: ['package.json'] },
    { changedPaths: [MODEL_ALLOWED_PATH, 'package.json'] },
    { changedPaths: [] }
  ]) {
    assert.throws(() => verifyCommittedCandidate({ ...args, ...changed }),
      /Committed patch does not match the reviewed candidate/);
  }
});

test('publisher never executes configured Git checkout, index, commit or push hooks with its token', () => {
  // Local test only: malicious hooks fail if invoked and leave an execution marker.
  // Test both Git's default hook directory and an attacker-configured core.hooksPath.
  for (const configured of [false, true]) {
    const f = fixture();
    try {
      const marker = join(f.root, 'hook-executed');
      const hookDir = configured ? join(f.root, 'custom-hooks') : join(f.workspace, '.git', 'hooks');
      mkdirSync(hookDir, { recursive: true });
      if (configured) git(f.workspace, 'config', 'core.hooksPath', hookDir);
      for (const name of ['post-checkout', 'post-index-change', 'pre-commit', 'prepare-commit-msg',
        'commit-msg', 'post-commit', 'pre-push']) {
        const hook = join(hookDir, name);
        writeFileSync(hook, '#!/bin/sh\nprintf "hook fired\\n" >> "$AIEO_TEST_HOOK_MARKER"\nexit 1\n');
        chmodSync(hook, 0o755);
      }
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env: { ...f.env, AIEO_TEST_HOOK_MARKER: marker },
        encoding: 'utf8', timeout: 20000
      });
      assert.equal(child.status, 0, child.stderr);
      assert.equal(existsSync(marker), false, 'Git hooks must not execute during publication');
      assert.equal(JSON.parse(child.stdout).status, 'draft-pr-created');
      assert.ok(git(f.workspace, 'ls-remote', '--heads', f.remote)
        .includes('refs/heads/aieo/model-proposal-99123-1'));
      assert.ok(git(f.workspace, 'show', 'HEAD:' + MODEL_ALLOWED_PATH).includes('sample = 2'),
        'final commit must still contain only the independently reviewed source');
      assert.ok(readFileSync(f.log, 'utf8').includes('pr create --draft'));
    } finally { rmSync(f.root, { force: true, recursive: true }); }
  }
});


test('publisher disables external diff drivers even when the environment requests one', () => {
  const f = fixture();
  try {
    const marker = join(f.root, 'external-diff-fired');
    const maliciousDiff = join(f.root, 'external-diff.sh');
    writeFileSync(maliciousDiff, '#!/bin/sh\nprintf "triggered\n" >> "$AIEO_TEST_DIFF_MARKER"\nexit 1\n');
    chmodSync(maliciousDiff, 0o755);
    const child = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace,
      env: { ...f.env, GIT_EXTERNAL_DIFF: maliciousDiff, AIEO_TEST_DIFF_MARKER: marker },
      encoding: 'utf8', timeout: 20000
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(existsSync(marker), false, 'external diff command must never execute');
    assert.equal(JSON.parse(child.stdout).status, 'draft-pr-created');
    assert.match(readFileSync(f.log, 'utf8'), /pr create --draft/);
  } finally { rmSync(f.root, { force: true, recursive: true }); }
});

test('publisher disables Git textconv drivers from hidden local attributes', () => {
  const f = fixture();
  try {
    const marker = join(f.root, 'textconv-fired');
    const converter = join(f.root, 'malicious-textconv.sh');
    writeFileSync(converter,
      '#!/bin/sh\nprintf "triggered\n" >> "$AIEO_TEST_TEXTCONV_MARKER"\ncat "$1"\n');
    chmodSync(converter, 0o755);
    writeFileSync(join(f.workspace, '.git', 'info', 'attributes'),
      'components/FeedbackWidget.tsx diff=aieo-malicious\n');
    git(f.workspace, 'config', 'diff.aieo-malicious.textconv', converter);
    const child = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace,
      env: { ...f.env, AIEO_TEST_TEXTCONV_MARKER: marker },
      encoding: 'utf8', timeout: 20000
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(existsSync(marker), false, 'textconv must never execute');
    assert.equal(JSON.parse(child.stdout).status, 'draft-pr-created');
  } finally { rmSync(f.root, { force: true, recursive: true }); }
});

test('publisher rejects local Git clean filters before switching branch, push or gh', () => {
  const f = fixture();
  try {
    const marker = join(f.root, 'clean-filter-fired');
    const maliciousFilter = join(f.root, 'malicious-clean.sh');
    writeFileSync(maliciousFilter, '#!/bin/sh\nprintf "triggered\n" >> "$AIEO_TEST_FILTER_MARKER"\ncat\n');
    chmodSync(maliciousFilter, 0o755);
    // .git/info/attributes can be modified by a local build step without any
    // tracked or untracked working-tree change visible to git diff.
    writeFileSync(join(f.workspace, '.git', 'info', 'attributes'),
      'components/FeedbackWidget.tsx filter=aieo-malicious\n');
    git(f.workspace, 'config', 'filter.aieo-malicious.clean', maliciousFilter);
    const detected = git(f.workspace, 'check-attr', 'filter', '--', MODEL_ALLOWED_PATH);
    assert.match(detected, /filter: aieo-malicious$/);
    assert.throws(() => verifyNoGitFilter(MODEL_ALLOWED_PATH, detected),
      /untrusted clean filter/);
    const child = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace, env: { ...f.env, AIEO_TEST_FILTER_MARKER: marker },
      encoding: 'utf8', timeout: 20000
    });
    assert.notEqual(child.status, 0, 'untrusted filter must stop the publisher');
    assert.match(child.stderr, /untrusted clean filter/);
    assert.equal(existsSync(marker), false, 'clean filter must never execute');
    assert.equal(existsSync(f.log), false, 'gh must not be invoked');
    assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
    assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote), /model-proposal/);
  } finally { rmSync(f.root, { force: true, recursive: true }); }
});

test('publisher pushes a scoped candidate branch and invokes only Draft PR commands in isolated Git remote', () => {
  const f = fixture();
  try {
    const child = spawnSync(process.execPath, [publisher], { cwd: f.workspace,
      env: f.env, encoding: 'utf8', timeout: 20000 });
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.status, 'draft-pr-created');
    assert.equal(result.requiresHumanMerge, true);
    assert.equal(result.branch, 'aieo/model-proposal-99123-1');
    const remoteHeads = git(f.workspace, 'ls-remote', '--heads', f.remote);
    assert.ok(remoteHeads.includes('refs/heads/aieo/model-proposal-99123-1'));
    assert.ok(remoteHeads.includes('refs/heads/main'));
    assert.equal(git(f.workspace, 'diff', 'main', 'HEAD', '--name-only'), MODEL_ALLOWED_PATH);
    const commands = readFileSync(f.log, 'utf8');
    assert.match(commands, /pr create --draft --base main --head aieo\/model-proposal-99123-1/);
    assert.match(commands, /pr view https:\/\/github.com\/jayalshehri\/CGP-MVP\/pull\/123/);
    assert.match(commands, /workflow run cgp-required-ci.yml --ref aieo\/model-proposal-99123-1/);
    assert.doesNotMatch(commands, /(?:^|\n).*?(?:pr merge|deployment|release)(?: |$)/);
  } finally { rmSync(f.root, { force: true, recursive: true }); }
});

test('tampered model QA evidence stops before any push or PR operation', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.workspace, 'aieo-output/model-qa.json'),
      JSON.stringify({ ...f.qa, routeCasesPassed: 0 }));
    const child = spawnSync(process.execPath, [publisher], { cwd: f.workspace,
      env: f.env, encoding: 'utf8', timeout: 20000 });
    assert.notEqual(child.status, 0);
    assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
    assert.equal(git(f.workspace, 'ls-remote', '--heads', f.remote).includes('model-proposal-99123-1'), false);
  } finally { rmSync(f.root, { force: true, recursive: true }); }
});

test('publisher blocks success and follow-up CI if GitHub does not confirm an open Draft PR', () => {
  const f = fixture();
  try {
    const child = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace, env: { ...f.env, AIEO_FAKE_GH_UNVERIFIED: '1' },
      encoding: 'utf8', timeout: 20000
    });
    assert.notEqual(child.status, 0, 'a non-draft PR must fail publication');
    assert.match(child.stderr, /Remote PR is not a matching open Draft/);
    const commands = readFileSync(f.log, 'utf8');
    assert.match(commands, /pr create --draft/);
    assert.match(commands, /pr view https:\/\/github.com\/jayalshehri\/CGP-MVP\/pull\/123/);
    assert.doesNotMatch(commands, /workflow run/);
    assert.equal(git(f.workspace, 'show', 'main:' + MODEL_ALLOWED_PATH).includes('sample = 1'), true);
  } finally { rmSync(f.root, { force: true, recursive: true }); }
});
