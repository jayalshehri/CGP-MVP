import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync, renameSync, symlinkSync, linkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';
import { inspectModelQa, inspectModelReviewer } from '../aieo/lib/model-gates.mjs';
import { inspectModelDiff } from './aieo-model-security.mjs';
import { validateDispatch, verifyCandidate, verifyRemoteDraft, verifyTrustedCheckout, verifyCommittedCandidate, verifyNoGitFilter, verifyNoGitFsmonitor, verifyNoGitTransportOverride, verifyNoGitRemoteHelper, verifyNoGitCommitSigning, verifyGitHttpsTls, verifyNoGitDiagnosticExport, verifyNoGitHubCliRoutingOverride, verifyNoGitRepositoryEnvironmentOverride, authenticatedGitArgs } from './aieo-publish-draft.mjs';

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
    'https://github.com/jayalshehri/CGP-MVP.git'
  ]) {
    assert.equal(verifyTrustedCheckout({ env, checkedOutSha: sha, originUrl, effectivePushUrls: [originUrl] }), true);
  }
  for (const untrusted of [
    { env: { GITHUB_SHA: 'b'.repeat(40) } },
    { env: { GITHUB_SHA: 'not-a-commit' } },
    { env: {} },
    { checkedOutSha: 'b'.repeat(40) },
    { originUrl: 'file:///tmp/untrusted.git' },
    { originUrl: 'git@github.com:jayalshehri/CGP-MVP.git' },
    { originUrl: 'ssh://git@github.com/jayalshehri/CGP-MVP.git' },
    { effectivePushUrls: ['git@github.com:jayalshehri/CGP-MVP.git'] },
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
  for (const kind of ['wrong-sha', 'wrong-origin', 'ssh-origin', 'ssh-pushurl', 'url-rewrite', 'pushurl', 'multi-pushurl']) {
    const f = fixture();
    try {
      if (kind === 'wrong-origin') {
        git(f.workspace, 'config', 'remote.origin.url', f.remote);
      }
      if (kind === 'pushurl') {
        git(f.workspace, 'config', 'remote.origin.pushurl', 'file://' + f.remote);
      }
      if (kind === 'ssh-origin') {
        git(f.workspace, 'config', 'remote.origin.url', 'git@github.com:jayalshehri/CGP-MVP.git');
      }
      if (kind === 'ssh-pushurl') {
        git(f.workspace, 'config', 'remote.origin.pushurl', 'git@github.com:jayalshehri/CGP-MVP.git');
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
        ...(['url-rewrite', 'pushurl', 'multi-pushurl', 'ssh-pushurl'].includes(kind) ?
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

test('publisher rejects a non-disabled effective Git fsmonitor setting', () => {
  assert.equal(verifyNoGitFsmonitor('false'), true);
  for (const value of ['true', '/tmp/untrusted-fsmonitor.sh', '', '1']) {
    assert.throws(() => verifyNoGitFsmonitor(value), /untrusted Git fsmonitor configuration/);
  }
});

test('publisher blocks executable fsmonitor before Git index reads and remote writes', () => {
  // core.fsmonitor can run during git diff even when core.hooksPath is disabled.
  const f = fixture();
  try {
    const marker = join(f.root, 'fsmonitor-invoked');
    const helper = join(f.root, 'untrusted-fsmonitor.sh');
    writeFileSync(helper, ['#!/bin/sh', 'echo invoked >> "$AIEO_TEST_FSMONITOR_MARKER"', 'exit 1', ''].join('\n'));
    chmodSync(helper, 0o755);
    git(f.workspace, 'config', 'core.fsmonitor', helper);
    const child = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace,
      env: { ...f.env, AIEO_TEST_FSMONITOR_MARKER: marker },
      encoding: 'utf8', timeout: 20000
    });
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /untrusted Git fsmonitor configuration/);
    assert.equal(existsSync(marker), false, 'fsmonitor helper must never execute');
    assert.equal(existsSync(f.log), false, 'gh must not run');
    assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
    assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote), /model-proposal/);
  } finally { rmSync(f.root, { force: true, recursive: true }); }
});

test('authenticated Git resets configured executable helpers, including URL-specific helpers', () => {
  const f = fixture();
  try {
    const marker = join(f.root, 'untrusted-helper-ran');
    const malicious = join(f.root, 'malicious-helper.sh');
    writeFileSync(malicious, '#!/bin/sh\nprintf invoked >> ' + JSON.stringify(marker) + '\n');
    chmodSync(malicious, 0o755);
    git(f.workspace, 'config', 'credential.helper', '!' + malicious);
    git(f.workspace, 'config', 'credential.https://github.com.helper', '!' + malicious);

    // The GitHub CLI helper is replaced only inside this isolated test fixture.
    const gh = join(f.root, 'bin', 'gh');
    writeFileSync(gh, '#!/bin/sh\nif [ "$1" = "auth" ] && [ "$2" = "git-credential" ] && [ "$3" = "get" ]; then\n  printf "username=fixture\\npassword=synthetic\\n"\nfi\n');
    chmodSync(gh, 0o755);
    const child = spawnSync('git', authenticatedGitArgs(['credential', 'fill']), {
      cwd: f.workspace, env: { ...f.env, GIT_TERMINAL_PROMPT: '0' },
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8', timeout: 20000
    });
    assert.equal(child.status, 0, 'only the trusted fixture helper should supply credentials: ' + child.stderr);
    assert.match(child.stdout, /username=fixture/);
    assert.equal(existsSync(marker), false, 'inherited credential helpers must not run');
  } finally { rmSync(f.root, { force: true, recursive: true }); }
});

test('publisher refuses executable SSH and askpass configuration overrides', () => {
  const args = { env: {}, effectiveSshCommand: '' };
  assert.equal(verifyNoGitTransportOverride(args), true);
  for (const key of [
    'GIT_SSH_COMMAND', 'GIT_SSH', 'GIT_ASKPASS', 'SSH_ASKPASS',
    'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS', 'GIT_EXEC_PATH'
  ]) {
    assert.throws(() => verifyNoGitTransportOverride({
      ...args, env: { [key]: key === 'GIT_CONFIG_COUNT' ? '1' : '/tmp/not-trusted' }
    }), /untrusted Git transport executable override/);
  }
  assert.throws(() => verifyNoGitTransportOverride({
    ...args, effectiveSshCommand: '/tmp/not-trusted'
  }), /untrusted Git transport executable override/);
});

test('GitHub HTTPS certificate verification is mandatory for a credential-bearing push', () => {
  assert.equal(verifyGitHttpsTls({ env: {}, effectiveSslVerify: 'true' }), true);
  for (const value of ['false', '', 'off', '0']) {
    assert.throws(() => verifyGitHttpsTls({ env: {}, effectiveSslVerify: value }),
      /untrusted Git HTTPS TLS verification/);
  }
  for (const setting of ['1', 'true', 'false']) {
    assert.throws(() => verifyGitHttpsTls({
      env: { GIT_SSL_NO_VERIFY: setting }, effectiveSslVerify: 'true'
    }), /untrusted Git HTTPS TLS verification/);
  }
});

test('insecure Git HTTPS configuration fails before Draft branch, GitHub CLI or push', () => {
  for (const kind of ['global', 'host', 'repo-url', 'environment']) {
    const f = fixture();
    try {
      if (kind === 'global') git(f.workspace, 'config', 'http.sslVerify', 'false');
      if (kind === 'host') git(f.workspace, 'config', 'http.https://github.com/.sslVerify', 'false');
      if (kind === 'repo-url') {
        git(f.workspace, 'config', 'http.https://github.com/jayalshehri/CGP-MVP.git.sslVerify', 'false');
      }
      const env = { ...f.env, ...(kind === 'environment' ? { GIT_SSL_NO_VERIFY: '1' } : {}) };
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env, encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(child.status, 0, kind + ' must fail closed');
      assert.match(child.stderr, /untrusted Git HTTPS TLS verification/);
      assert.equal(existsSync(f.log), false, 'GitHub CLI must not run');
      assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
      assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote),
        /model-proposal/, 'No candidate may be pushed');
    } finally { rmSync(f.root, { force: true, recursive: true }); }
  }
});

test('publisher refuses inherited Git repository, object and index routing overrides', () => {
  assert.equal(verifyNoGitRepositoryEnvironmentOverride({}), true);
  assert.equal(verifyNoGitRepositoryEnvironmentOverride({ GIT_INDEX_FILE: '' }), true);
  for (const key of [
    'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE'
  ]) {
    assert.throws(
      () => verifyNoGitRepositoryEnvironmentOverride({ [key]: '/tmp/untrusted-repository' }),
      /untrusted Git repository or index environment override/, key
    );
  }
});

test('repository and index redirects block token-bearing publisher before Git or gh writes', () => {
  for (const key of [
    'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE'
  ]) {
    const f = fixture();
    try {
      const outsideIndex = join(f.root, 'external-index');
      const override = key === 'GIT_INDEX_FILE' ? outsideIndex :
        key === 'GIT_NAMESPACE' ? 'foreign-namespace' : f.root;
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env: { ...f.env, [key]: override },
        encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(child.status, 0, key + ' must fail closed');
      assert.match(child.stderr, /untrusted Git repository or index environment override/, key);
      assert.equal(existsSync(outsideIndex), false, 'external index must remain absent');
      assert.equal(existsSync(f.log), false, 'GitHub CLI must not be invoked');
      assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
      assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote),
        /model-proposal/, 'no remote candidate branch is allowed');
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});

test('Git diagnostic exports are refused before a token-bearing subprocess', () => {
  assert.equal(verifyNoGitDiagnosticExport({}), true);
  assert.equal(verifyNoGitDiagnosticExport({ GIT_TRACE: '' }), true);
  for (const key of [
    'GIT_TRACE', 'GIT_TRACE_CURL', 'GIT_TRACE_PACKET', 'GIT_TRACE_SETUP',
    'GIT_TRACE2', 'GIT_TRACE2_EVENT', 'GIT_TRACE2_PERF',
    'GIT_TRACE_REDACT', 'GIT_CURL_VERBOSE'
  ]) {
    assert.throws(() => verifyNoGitDiagnosticExport({ [key]: '1' }),
      /untrusted Git diagnostics configuration/, key);
  }
});

test('Git tracing cannot export token-bearing transport diagnostics or publish a branch', () => {
  for (const kind of ['GIT_TRACE', 'GIT_TRACE_CURL', 'GIT_TRACE2_EVENT', 'GIT_CURL_VERBOSE', 'GIT_TRACE_REDACT']) {
    const f = fixture();
    try {
      const tracePath = join(f.root, 'git-diagnostics-exported');
      const setting = kind === 'GIT_CURL_VERBOSE' ? '1' :
        kind === 'GIT_TRACE_REDACT' ? '0' : tracePath;
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace,
        env: { ...f.env, [kind]: setting },
        encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(child.status, 0, kind + ' must fail before any Git call');
      assert.match(child.stderr, /untrusted Git diagnostics configuration/);
      assert.equal(existsSync(tracePath), false, 'trace file must not be created');
      assert.equal(existsSync(f.log), false, 'GitHub CLI must not be invoked');
      assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
      assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote),
        /model-proposal/, 'No candidate branch may be pushed');
    } finally { rmSync(f.root, { force: true, recursive: true }); }
  }
});

test('GitHub CLI host and repository overrides must never select publication targets', () => {
  assert.equal(verifyNoGitHubCliRoutingOverride({}), true);
  for (const override of [
    { GH_REPO: 'attacker/other-repository' },
    { GH_REPO: 'jayalshehri/CGP-MVP' },
    { GH_HOST: 'github.example.invalid' },
    { GH_HOST: 'github.com' }
  ]) {
    assert.throws(() => verifyNoGitHubCliRoutingOverride(override),
      /untrusted GitHub CLI repository or host routing/);
  }
});

test('inherited GH_REPO or GH_HOST stops before branch creation, push or PR command', () => {
  for (const override of [
    { GH_REPO: 'attacker/other-repository' },
    { GH_HOST: 'github.example.invalid' }
  ]) {
    const f = fixture();
    try {
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env: { ...f.env, ...override },
        encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(child.status, 0);
      assert.match(child.stderr, /untrusted GitHub CLI repository or host routing/);
      assert.equal(existsSync(f.log), false, 'GitHub CLI must not be invoked');
      assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
      assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote),
        /model-proposal/, 'no proposal branch may be pushed');
    } finally { rmSync(f.root, { force: true, recursive: true }); }
  }
});

test('custom Git remote helper must not be configured for Draft publishing', () => {
  assert.equal(verifyNoGitRemoteHelper(''), true);
  for (const helper of ['git', 'aieo-unsafe', 'ext', 'ssh']) {
    assert.throws(() => verifyNoGitRemoteHelper(helper), /untrusted Git remote helper override/);
  }
});

test('custom Git remote helper fails closed before execution or any remote write', () => {
  const f = fixture();
  try {
    const marker = join(f.root, 'remote-helper-invoked');
    const helper = join(f.root, 'bin', 'git-remote-aieo-unsafe');
    writeFileSync(helper, '#!/bin/sh\necho invoked >> ' + JSON.stringify(marker) + '\nexit 1\n');
    chmodSync(helper, 0o755);
    git(f.workspace, 'config', 'remote.origin.vcs', 'aieo-unsafe');
    assert.equal(git(f.workspace, 'config', '--get', 'remote.origin.vcs'), 'aieo-unsafe');
    const child = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
    });
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /untrusted Git remote helper override/);
    assert.equal(existsSync(marker), false, 'untrusted git-remote helper must never execute');
    assert.equal(existsSync(f.log), false, 'gh must not run');
    assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
    assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote), /model-proposal/);
  } finally { rmSync(f.root, { force: true, recursive: true }); }
});

test('publisher rejects commit signing rather than invoking external Git signing drivers', () => {
  assert.equal(verifyNoGitCommitSigning('false'), true);
  for (const value of ['true', '1', '', 'on']) {
    assert.throws(() => verifyNoGitCommitSigning(value),
      /untrusted Git commit signing configuration/);
  }
});

test('Git commit signing executable fails closed before branch creation, gh or remote writes', () => {
  const f = fixture();
  try {
    const marker = join(f.root, 'gpg-program-invoked');
    const executable = join(f.root, 'untrusted-gpg.sh');
    writeFileSync(executable, '#!/bin/sh\necho invoked >> ' + JSON.stringify(marker) + '\nexit 1\n');
    chmodSync(executable, 0o755);
    git(f.workspace, 'config', 'commit.gpgSign', 'true');
    git(f.workspace, 'config', 'gpg.program', executable);
    assert.equal(git(f.workspace, 'config', '--bool', '--get', 'commit.gpgSign'), 'true');
    const child = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
    });
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /untrusted Git commit signing configuration/);
    assert.equal(existsSync(marker), false, 'untrusted signing driver must not execute');
    assert.equal(existsSync(f.log), false, 'gh must not run');
    assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
    assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote), /model-proposal/);
  } finally { rmSync(f.root, { force: true, recursive: true }); }
});

test('Git executable helper-path override fails before GitHub CLI or remote branch writes', () => {
  const f = fixture();
  try {
    const marker = join(f.root, 'git-remote-https-invoked');
    const maliciousBin = join(f.root, 'malicious-git-exec');
    mkdirSync(maliciousBin);
    const helper = join(maliciousBin, 'git-remote-https');
    writeFileSync(helper, '#!/bin/sh\nprintf invoked >> ' + JSON.stringify(marker) + '\nexit 1\n');
    chmodSync(helper, 0o755);
    const child = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace, env: { ...f.env, GIT_EXEC_PATH: maliciousBin },
      encoding: 'utf8', timeout: 20000
    });
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /untrusted Git transport executable override/);
    assert.equal(existsSync(marker), false, 'untrusted Git HTTPS helper must never run');
    assert.equal(existsSync(f.log), false, 'GitHub CLI must not run');
    assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
    assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote), /model-proposal/);
  } finally { rmSync(f.root, { force: true, recursive: true }); }
});

test('Git transport command overrides fail before branch write, gh or helper execution', () => {
  for (const kind of ['core-ssh', 'env-ssh', 'git-askpass', 'ssh-askpass', 'config-overlay']) {
    const f = fixture();
    try {
      const marker = join(f.root, 'transport-command-ran');
      const executable = join(f.root, 'untrusted-transport.sh');
      writeFileSync(executable, '#!/bin/sh\necho invoked >> ' + JSON.stringify(marker) + '\nexit 1\n');
      chmodSync(executable, 0o755);
      if (kind === 'core-ssh') git(f.workspace, 'config', 'core.sshCommand', executable);
      const overrides = {
        ...(kind === 'env-ssh' ? { GIT_SSH_COMMAND: executable } : {}),
        ...(kind === 'git-askpass' ? { GIT_ASKPASS: executable } : {}),
        ...(kind === 'ssh-askpass' ? { SSH_ASKPASS: executable } : {}),
        ...(kind === 'config-overlay' ? {
          GIT_CONFIG_COUNT: '1',
          GIT_CONFIG_KEY_0: 'core.sshCommand',
          GIT_CONFIG_VALUE_0: executable
        } : {})
      };
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env: { ...f.env, ...overrides },
        encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(child.status, 0);
      assert.match(child.stderr, /untrusted Git transport executable override/);
      assert.equal(existsSync(marker), false, 'untrusted command must not execute');
      assert.equal(existsSync(f.log), false, 'GitHub CLI must not run');
      assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
      assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote), /model-proposal/);
    } finally { rmSync(f.root, { force: true, recursive: true }); }
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
    assert.match(commands, /pr create --draft --repo jayalshehri\/CGP-MVP --base main --head aieo\/model-proposal-99123-1/);
    assert.match(commands, /pr view https:\/\/github.com\/jayalshehri\/CGP-MVP\/pull\/123/);
    assert.match(commands, /workflow run cgp-required-ci.yml --repo jayalshehri\/CGP-MVP --ref aieo\/model-proposal-99123-1/);
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


test('publisher independently rejects redirected model reports before branch creation or GitHub writes', () => {
  for (const kind of ['directory-symlink', 'verdict-symlink', 'verdict-hardlink']) {
    const f = fixture();
    try {
      const artifactDir = join(f.workspace, 'aieo-output');
      const qaPath = join(artifactDir, 'model-qa.json');
      const reviewerPath = join(artifactDir, 'model-reviewer.json');
      let sentinel;
      let original;
      if (kind === 'directory-symlink') {
        const externalDir = join(f.root, 'external-artifacts');
        original = readFileSync(qaPath, 'utf8');
        renameSync(artifactDir, externalDir);
        symlinkSync(externalDir, artifactDir, 'dir');
        sentinel = join(externalDir, 'model-qa.json');
      } else if (kind === 'verdict-symlink') {
        original = readFileSync(reviewerPath, 'utf8');
        sentinel = join(f.root, 'outside-reviewer.json');
        writeFileSync(sentinel, original);
        rmSync(reviewerPath);
        symlinkSync(sentinel, reviewerPath);
      } else {
        original = readFileSync(qaPath, 'utf8');
        sentinel = join(f.root, 'outside-qa.json');
        writeFileSync(sentinel, original);
        rmSync(qaPath);
        linkSync(sentinel, qaPath);
      }
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(child.status, 0, kind + ' must fail closed');
      assert.match(child.stderr, /Unsafe model review workspace entry/, kind);
      assert.equal(readFileSync(sentinel, 'utf8'), original, 'outside content must remain unchanged');
      assert.equal(existsSync(f.log), false, 'GitHub CLI must not be invoked');
      assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
      assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote), /model-proposal/);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});

test('publisher source attestation rejects an outside linked component in both modes', () => {
  for (const mode of ['model', 'deterministic']) {
    const f = fixture();
    try {
      const outside = join(f.root, 'outside-component.tsx');
      const original = readFileSync(f.target, 'utf8');
      writeFileSync(outside, original);
      rmSync(f.target);
      symlinkSync(outside, f.target);
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env: { ...f.env, AIEO_PUBLISH_MODE: mode },
        encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(child.status, 0);
      assert.match(child.stderr, /Unsafe model review workspace entry/);
      assert.equal(readFileSync(outside, 'utf8'), original);
      assert.equal(existsSync(f.log), false, 'no Draft PR command is allowed');
      assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
      assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote), /model-proposal|repair-feedback/);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});
