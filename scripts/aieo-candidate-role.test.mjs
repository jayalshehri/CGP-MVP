// Credential-free, real Git/local-remote rehearsal of four separate role CLIs.
// The GitHub REST response comes from a fake gh executable; no real API/model calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, rmSync, symlinkSync, linkSync, statSync, renameSync, unlinkSync, readlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyOfficialCandidateFetchOrigin, verifyOfficialCandidateFetchConfig } from './aieo-candidate-role.mjs';
import { pinReadOnlyGitExecutable } from './aieo-git-process-guard.mjs';

const roleScript = join(dirname(fileURLToPath(import.meta.url)), 'aieo-candidate-role.mjs');
const finalizerScript = join(dirname(fileURLToPath(import.meta.url)), 'aieo-candidate-finalize.mjs');
const path = 'components/FeedbackWidget.tsx';
const repo = 'jayalshehri/CGP-MVP';
const branch = 'aieo/model-proposal-77331-1';
const route = '  const controlId = useMemo(() => /^\\/controls\\/(\\d+)(?:\\/|$)/.exec(pagePath)?.[1] ?? null, [pagePath]);';
const original = ['function fixture() {', route, '  const statusLabel = "Old status";', '}', ''].join('\n');
const candidate = original.replace('"Old status"', '"Current status"');

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'aieo-candidate-roles-'));
  const cwd = join(root, 'work');
  const bin = join(root, 'bin');
  const remote = join(root, 'remote.git');
  const prFile = join(root, 'pr.json');
  mkdirSync(cwd);
  mkdirSync(bin);
  mkdirSync(join(cwd, 'components'));
  mkdirSync(join(cwd, 'scripts'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  execFileSync('git', ['init', '--bare', '-q', remote], { cwd: root });
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('remote', 'add', 'origin', remote);
  writeFileSync(join(cwd, path), original);
  writeFileSync(join(cwd, 'scripts/trusted-build-step.mjs'), 'export const approved = true;\n');
  git('add', path, 'scripts/trusted-build-step.mjs');
  git('commit', '-qm', 'trusted baseline');
  const base = git('rev-parse', 'HEAD');
  git('push', '-q', '-u', 'origin', 'main');
  git('switch', '-qc', branch);
  writeFileSync(join(cwd, path), candidate);
  git('add', path);
  git('commit', '-qm', 'bounded model fixture');
  const head = git('rev-parse', 'HEAD');
  git('push', '-q', '-u', 'origin', branch);
  git('switch', '-q', 'main');

  const pr = {
    number: 777,
    html_url: 'https://github.com/' + repo + '/pull/777',
    state: 'open', draft: true, merged_at: null,
    user: { login: 'github-actions[bot]', id: 41898282, type: 'Bot' },
    base: { sha: base, ref: 'main', repo: { full_name: repo } },
    head: { sha: head, ref: branch, repo: { full_name: repo } }
  };
  const savePr = () => writeFileSync(prFile, JSON.stringify(pr));
  savePr();
  const gh = join(bin, 'gh');
  writeFileSync(gh, '#!/usr/bin/env node\n' +
    "const {readFileSync,writeFileSync,existsSync}=require('node:fs');\n" +
    "if(process.argv.slice(2).join(' ')!=='api repos/jayalshehri/CGP-MVP/pulls/777')process.exit(3);\n" +
    "const after=process.env.AIEO_FAKE_PR_SECOND;\n" +
    "if(!after){process.stdout.write(readFileSync(process.env.AIEO_FAKE_PR_FILE,'utf8'));}\n" +
    "else {const counter=process.env.AIEO_FAKE_PR_COUNTER;\n" +
    "  if(!counter)process.exit(4);\n" +
    "  const n=existsSync(counter)?Number(readFileSync(counter,'utf8')):0;\n" +
    "  writeFileSync(counter,String(n+1));\n" +
    "  process.stdout.write(readFileSync(n===0?process.env.AIEO_FAKE_PR_FILE:after,'utf8'));}\n");
  chmodSync(gh, 0o755);
  const env = {
    ...process.env,
    // Even when node:test runs in Actions, this disposable local bare remote
    // is a fixture rather than a trusted production candidate endpoint.
    GITHUB_ACTIONS: 'false',
    PATH: bin + delimiter + process.env.PATH,
    GH_TOKEN: 'fixture-never-live',
    GITHUB_TOKEN: 'fixture-never-live', // never inherit a CI token in local fixtures
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: base,
    GITHUB_REPOSITORY: repo,
    AIEO_PR_NUMBER: '777',
    AIEO_FAKE_PR_FILE: prFile
  };
  const run = (role, envOverrides = {}) => spawnSync(process.execPath, [roleScript, role], {
    cwd, env: { ...env, ...envOverrides }, encoding: 'utf8', timeout: 25000
  });
  return { root, cwd, git, pr, savePr, run, base, head, env };
}


test('real Git config transport overrides fail despite an unchanged approved origin URL', () => {
  const f = setup();
  try {
    // This fixture never fetches the public URL. A canonical URL check alone
    // would pass even with an attacker-controlled proxy or TLS override.
    f.git('remote', 'set-url', 'origin', 'https://github.com/jayalshehri/CGP-MVP.git');
    const effectiveOrigin = () => f.git('remote', 'get-url', '--all', 'origin').split('\n');
    const configNames = () => f.git('config', '--name-only', '--list').split('\n');
    assert.equal(verifyOfficialCandidateFetchOrigin(effectiveOrigin()), true);
    assert.equal(verifyOfficialCandidateFetchConfig(configNames()), true);

    const hostile = [
      ['http.proxy', 'http://proxy.invalid:8080'],
      ['http.https://github.com/jayalshehri/CGP-MVP.git.proxy', 'http://scoped.invalid:8080'],
      ['http.sslVerify', 'false'],
      ['http.https://github.com/.extraHeader', 'Authorization: Bearer synthetic-only'],
      ['http.followRedirects', 'true'],
      ['http.curloptResolve', 'github.com:443:127.0.0.1'],
      ['core.askPass', '/tmp/should-not-execute-askpass'],
      ['core.sshCommand', '/tmp/should-not-execute-ssh'],
      ['core.gitProxy', '/tmp/should-not-execute-proxy'],
      ['core.alternateRefsCommand', '/tmp/should-not-execute-refs'],
      ['uploadpack.packObjectsHook', '/tmp/should-not-execute-hook'],
      ['remote.origin.proxy', 'http://proxy.invalid:8080'],
      ['remote.origin.vcs', 'custom-helper'],
      ['remote.origin.uploadpack', 'untrusted-upload-pack'],
      ['credential.https://github.com.helper', '!synthetic-helper'],
      ['url.https://alternate.invalid/.insteadOf', 'https://github.com/']
    ];
    for (const [key, value] of hostile) {
      f.git('config', '--local', key, value);
      assert.throws(() => verifyOfficialCandidateFetchConfig(configNames()),
        /unverified remote Draft PR/, key + ' must block before any fetch');
      if (!key.startsWith('url.')) {
        assert.equal(verifyOfficialCandidateFetchOrigin(effectiveOrigin()), true,
          key + ' is invisible to canonical origin verification');
      }
      f.git('config', '--local', '--unset-all', key);
      assert.equal(verifyOfficialCandidateFetchConfig(configNames()), true,
        key + ' removal restores safe local transport configuration');
    }
    assert.equal(f.git('rev-parse', 'main'), f.base, 'fixture main stays untouched');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('spoofing offline Actions mode cannot bypass official-origin check with an actual-token-shaped value', () => {
  const f = setup();
  try {
    // A genuine credential-free local rehearsal remains supported.
    const validFixture = f.run('developer');
    assert.equal(validFixture.status, 0, validFixture.stderr);
    rmSync(join(f.cwd, 'aieo-output'), { recursive: true, force: true });

    // Record any attempted gh invocation. The refusal must happen before
    // the GitHub API, not merely before the eventual git fetch.
    const marker = join(f.root, 'unexpected-gh-call');
    const gh = join(f.root, 'bin', 'gh');
    writeFileSync(gh, '#!/usr/bin/env node\n' +
      'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ', "called");\n' +
      'process.exit(4);\n');
    chmodSync(gh, 0o755);

    for (const unsafe of [
      { GH_TOKEN: 'synthetic-actions-token-not-a-real-credential' },
      { GH_TOKEN: 'synthetic-actions-token-not-a-real-credential', CI: 'true' },
      { GITHUB_ACTIONS: '0' },
      { GITHUB_ACTIONS: '' }
    ]) {
      const rejected = f.run('developer', unsafe);
      assert.notEqual(rejected.status, 0, 'untrusted runner context must be blocked');
      assert.match(rejected.stderr, /candidate role blocked/);
      assert.equal(existsSync(marker), false, 'no gh API may receive a token');
      assert.equal(existsSync(join(f.cwd, 'aieo-output/candidate-developer.json')), false);
    }
    assert.equal(f.git('rev-parse', 'main'), f.base, 'trusted fixture main stays unchanged');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// An imported caller may supply a sanitized offline object while the real
// process still owns a GitHub credential. All five separate entry points must
// reject that contradiction BEFORE any Git or gh subprocess is started.
test('roles and finalizer reject an injected fixture masking live process credentials', () => {
  const f = setup();
  try {
    for (const role of ['developer', 'qa', 'security', 'reviewer']) {
      const clean = f.run(role);
      assert.equal(clean.status, 0, role + ': ' + clean.stderr);
    }
    const reviewed = execFileSync('git', ['show', f.head + ':' + path],
      { cwd: f.cwd, encoding: 'utf8' });
    writeFileSync(join(f.cwd, path), reviewed);
    const cleanFinal = spawnSync(process.execPath, [finalizerScript], {
      cwd: f.cwd, env: f.env, encoding: 'utf8', timeout: 25000
    });
    assert.equal(cleanFinal.status, 0, cleanFinal.stderr);

    const markerFile = join(f.root, 'unexpected-live-context-subprocess');
    for (const binary of ['git', 'gh']) {
      const executable = join(f.root, 'bin', binary);
      writeFileSync(executable, '#!/usr/bin/env node\n' +
        'require("node:fs").appendFileSync(' +
        JSON.stringify(markerFile) + ', "invoked\\n");\n' +
        'process.exit(91);\n');
      chmodSync(executable, 0o755);
    }
    const context = {
      GITHUB_ACTIONS: 'false', GH_TOKEN: 'fixture-never-live',
      GITHUB_EVENT_NAME: f.env.GITHUB_EVENT_NAME,
      GITHUB_REF: f.env.GITHUB_REF,
      GITHUB_REPOSITORY: f.env.GITHUB_REPOSITORY,
      GITHUB_SHA: f.env.GITHUB_SHA,
      AIEO_PR_NUMBER: f.env.AIEO_PR_NUMBER
    };
    const roleUrl = new URL('./aieo-candidate-role.mjs', import.meta.url).href;
    const finalizerUrl = new URL('./aieo-candidate-finalize.mjs', import.meta.url).href;
    const variations = [
      { GITHUB_ACTIONS: 'false', GH_TOKEN: 'synthetic-live-token-placeholder' },
      { GITHUB_ACTIONS: 'true', GH_TOKEN: 'synthetic-live-token-placeholder' },
      { GITHUB_ACTIONS: 'false', GH_TOKEN: 'fixture-never-live',
        GITHUB_TOKEN: 'synthetic-live-token-placeholder' }
    ];
    for (const injectedProcess of variations) {
      for (const role of ['developer', 'qa', 'security', 'reviewer', 'finalizer']) {
        const code = role === 'finalizer'
          ? 'import {verifyPostBuild} from ' + JSON.stringify(finalizerUrl) +
            '; verifyPostBuild(' + JSON.stringify(context) + ');'
          : 'import {runCandidateRole} from ' + JSON.stringify(roleUrl) +
            '; runCandidateRole(' + JSON.stringify(role) + ',' +
            JSON.stringify(context) + ');';
        const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
          cwd: f.cwd, env: { ...f.env, ...injectedProcess },
          encoding: 'utf8', timeout: 12000
        });
        assert.notEqual(child.status, 0, role + ' must reject process/context mismatch');
        assert.match(child.stderr, /candidate role blocked|post-build check blocked/);
        assert.equal(existsSync(markerFile), false,
          role + ' must not start Git or gh with a live credential');
      }
    }
    assert.equal(f.git('rev-parse', 'main'), f.base);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('post-build finalizer refuses privileged offline-mode spoof before Git or GitHub CLI', () => {
  const f = setup();
  try {
    // Four independently executed reviews yield valid evidence first. The
    // finalizer must still bind its own process context before using it.
    for (const role of ['developer', 'qa', 'security', 'reviewer']) {
      const result = f.run(role);
      assert.equal(result.status, 0, role + ': ' + result.stderr);
    }
    const reviewed = execFileSync('git', ['show', f.head + ':' + path],
      { cwd: f.cwd, encoding: 'utf8' });
    writeFileSync(join(f.cwd, path), reviewed);
    const verify = (overrides = {}) => spawnSync(process.execPath, [finalizerScript], {
      cwd: f.cwd, env: { ...f.env, ...overrides }, encoding: 'utf8', timeout: 25000
    });
    const good = verify();
    assert.equal(good.status, 0, good.stderr);
    assert.equal(JSON.parse(good.stdout).status, 'post-build-draft-reverified');

    // A compromised build step may try to downgrade GITHUB_ACTIONS while
    // retaining a live-scoped GH_TOKEN. An apparent refusal is insufficient
    // if Git or gh was already executed with that credential in scope.
    const markerFile = join(f.root, 'unexpected-post-build-subprocess');
    for (const executable of ['git', 'gh']) {
      const executablePath = join(f.root, 'bin', executable);
      writeFileSync(executablePath, '#!/usr/bin/env node\n' +
        'require("node:fs").appendFileSync(' + JSON.stringify(markerFile) +
        ', ' + JSON.stringify(executable + '\n') + ');\n' +
        'process.exit(42);\n');
      chmodSync(executablePath, 0o755);
    }
    for (const unsafe of [
      { GH_TOKEN: 'synthetic-privileged-token-placeholder' },
      { GH_TOKEN: 'synthetic-privileged-token-placeholder', CI: 'true' },
      { GITHUB_ACTIONS: '0' },
      { GITHUB_ACTIONS: '' }
    ]) {
      const rejected = verify(unsafe);
      assert.notEqual(rejected.status, 0, 'untrusted finalizer context must fail');
      assert.match(rejected.stderr, /post-build check blocked/);
      assert.equal(existsSync(markerFile), false,
        'spoofed offline context must fail before either Git or gh runs');
    }
    assert.equal(f.git('rev-parse', 'main'), f.base,
      'candidate finalization must never modify main');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('independent candidate roles and post-build finalizer reject redirected gh context before subprocesses', () => {
  const f = setup();
  try {
    // Independent real-Git rehearsal with the normal fake, credential-free
    // GitHub API, before replacing executables with invocation detectors.
    for (const role of ['developer', 'qa', 'security', 'reviewer']) {
      const result = f.run(role);
      assert.equal(result.status, 0, role + ': ' + result.stderr);
    }
    const reviewed = execFileSync('git', ['show', f.head + ':' + path],
      { cwd: f.cwd, encoding: 'utf8' });
    writeFileSync(join(f.cwd, path), reviewed);
    const finalizer = (overrides = {}) => spawnSync(process.execPath, [finalizerScript], {
      cwd: f.cwd, env: { ...f.env, ...overrides }, encoding: 'utf8', timeout: 25000
    });
    const good = finalizer();
    assert.equal(good.status, 0, good.stderr);
    assert.equal(JSON.parse(good.stdout).status, 'post-build-draft-reverified');

    // Compromised build steps may use GITHUB_ENV to redirect GH_HOST or
    // GH_REPO; GH_CONFIG_DIR can additionally select unreviewed CLI config.
    // Both credential-bearing checkpoints must fail before Git/gh invocation.
    const markerFile = join(f.root, 'redirected-gh-subprocess');
    for (const binary of ['git', 'gh']) {
      const executable = join(f.root, 'bin', binary);
      writeFileSync(executable, '#!/usr/bin/env node\n' +
        'require("node:fs").appendFileSync(' + JSON.stringify(markerFile) +
        ', ' + JSON.stringify(binary + '\n') + ');\nprocess.exit(51);\n');
      chmodSync(executable, 0o755);
    }
    for (const overrides of [
      { GH_HOST: 'attacker.example.invalid' },
      { GH_HOST: 'github.com.attacker.invalid' },
      { GH_REPO: 'other/repository' },
      { GH_CONFIG_DIR: f.root }
    ]) {
      const role = f.run('reviewer', overrides);
      assert.notEqual(role.status, 0, 'independent role must refuse gh override');
      assert.match(role.stderr, /candidate role blocked/);
      const finalized = finalizer(overrides);
      assert.notEqual(finalized.status, 0, 'post-build check must refuse gh override');
      assert.match(finalized.stderr, /post-build check blocked/);
      assert.equal(existsSync(markerFile), false, 'neither git nor gh may start');
    }
    assert.equal(f.git('rev-parse', 'main'), f.base, 'fixture main remains unchanged');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('candidate origin configuration validator rejects missing, malformed and duplicated security inputs', () => {
  const standard = ['core.repositoryformatversion', 'remote.origin.url', 'remote.origin.fetch'];
  assert.equal(verifyOfficialCandidateFetchConfig(standard), true);
  for (const names of [
    [], ['remote.origin.url'], ['remote.origin.fetch'],
    [...standard, 'http.proxy'], [...standard, 'credential.helper'],
    [...standard, 'remote.origin.vcs'],
    [...standard, 'http.sslverify'], [...standard, 'remote.origin.pushurl'],
    [...standard, 'remote.origin.proxy'],
    [...standard, 'http.https://github.com/.proxy'],
    [...standard, 'url.https://example.invalid/.insteadof'],
    [...standard, 'remote.origin.fetch\nhttp.proxy'],
    [...standard, null], [...standard, 'x'.repeat(513)],
    null, 'remote.origin.url'
  ]) {
    assert.throws(() => verifyOfficialCandidateFetchConfig(names),
      /unverified remote Draft PR/);
  }
});

test('developer, QA, Security and Reviewer pass independently using immutable real Git commits', () => {
  const f = setup();
  try {
    for (const [role, status] of [
      ['developer', 'proposed'], ['qa', 'passed'],
      ['security', 'passed'], ['reviewer', 'draft-pr-eligible']
    ]) {
      const result = f.run(role);
      assert.equal(result.status, 0, role + ': ' + result.stderr);
      const output = JSON.parse(result.stdout);
      assert.equal(output.status, status);
      assert.equal(output.baseSha, f.base);
      assert.equal(output.headSha, f.head);
      assert.equal(output.prNumber, 777);
    }
    const proof = JSON.parse(readFileSync(join(f.cwd, 'aieo-output/candidate-developer.json'), 'utf8'));
    assert.equal(proof.baseSha, f.base);
    assert.equal(proof.headSha, f.head);
    assert.deepEqual(proof.changedPaths, [path]);
    assert.equal(f.git('rev-parse', 'main'), f.base, 'trusted main remains untouched');
    assert.equal(f.git('show', 'main:' + path), original.trimEnd());
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('REST state, actor, branch, repository, and commit mismatches fail closed before any role', () => {
  const f = setup();
  try {
    const mutations = [
      (p) => { p.draft = false; },
      (p) => { p.state = 'closed'; },
      (p) => { p.user.id = 191056639; },
      (p) => { p.user.login = 'jayalshehri'; },
      (p) => { p.user.type = 'User'; },
      (p) => { p.head.repo.full_name = 'foreign/CGP-MVP'; },
      (p) => { p.base.ref = 'release'; },
      (p) => { p.head.ref = 'aieo/foreign'; },
      (p) => { p.head.sha = 'a'.repeat(40); },
      (p) => { p.number = 778; }
    ];
    for (const mutate of mutations) {
      const saved = JSON.parse(JSON.stringify(f.pr));
      mutate(f.pr);
      f.savePr();
      const result = f.run('developer');
      assert.notEqual(result.status, 0, 'forged PR metadata must be rejected');
      Object.assign(f.pr, saved);
    }
    f.savePr();
    assert.notEqual(f.run('developer', { GITHUB_REF: 'refs/heads/feature' }).status, 0);
    assert.notEqual(f.run('developer', { GITHUB_REPOSITORY: 'foreign/CGP-MVP' }).status, 0);
    assert.notEqual(f.run('developer', { GH_TOKEN: '' }).status, 0);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('each candidate role reattests remote Draft state before writing evidence', () => {
  const f = setup();
  try {
    const second = join(f.root, 'drifted-pr.json');
    const counter = join(f.root, 'gh-rest-read-count');
    const mutations = [
      ['undrafted', (p) => { p.draft = false; }],
      ['closed', (p) => { p.state = 'closed'; }],
      ['merged', (p) => { p.merged_at = '2026-11-19T00:00:00Z'; }],
      ['retargeted', (p) => { p.base.ref = 'release'; }],
      ['head-rewritten', (p) => { p.head.sha = 'a'.repeat(40); }],
      ['base-rewritten', (p) => { p.base.sha = 'b'.repeat(40); }],
      ['actor-changed', (p) => { p.user.id = 191056639; }],
      ['foreign-head', (p) => { p.head.repo.full_name = 'foreign/CGP-MVP'; }]
    ];
    // The first REST read returns a valid bot Draft; after Git fetch and
    // independent inspection, the second read observes remote state drift.
    for (const [name, mutate] of mutations) {
      const drifted = JSON.parse(JSON.stringify(f.pr));
      mutate(drifted);
      writeFileSync(second, JSON.stringify(drifted));
      rmSync(counter, { force: true });
      const outcome = f.run('developer', {
        AIEO_FAKE_PR_SECOND: second, AIEO_FAKE_PR_COUNTER: counter
      });
      assert.notEqual(outcome.status, 0, name + ': mutable PR drift must block');
      assert.match(outcome.stderr, /candidate role blocked/, name);
      assert.equal(readFileSync(counter, 'utf8'), '2', name + ': both REST reads must occur');
      assert.equal(existsSync(join(f.cwd, 'aieo-output/candidate-developer.json')), false,
        name + ': no false Developer report may be written');
      assert.equal(f.git('rev-parse', 'main'), f.base);
    }
    const good = f.run('developer');
    assert.equal(good.status, 0, good.stderr);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('Developer, QA, Security and Reviewer pin the exact Draft head branch across REST reads', () => {
  const f = setup();
  try {
    const second = join(f.root, 'same-commit-other-head-ref.json');
    const counter = join(f.root, 'same-commit-head-ref-reads');
    const shifted = JSON.parse(JSON.stringify(f.pr));
    // Both branch names satisfy the official model-proposal pattern and both
    // point to the identical immutable commit. The first REST record is valid;
    // only the branch identity changes by the second REST observation.
    shifted.head.ref = 'aieo/model-proposal-77331-2';
    assert.equal(shifted.head.sha, f.pr.head.sha);
    writeFileSync(second, JSON.stringify(shifted));
    for (const role of ['developer', 'qa', 'security', 'reviewer']) {
      const valid = f.run(role);
      assert.equal(valid.status, 0, role + ': stable Draft must be accepted: ' + valid.stderr);
      rmSync(counter, { force: true });
      const drifted = f.run(role, {
        AIEO_FAKE_PR_SECOND: second, AIEO_FAKE_PR_COUNTER: counter
      });
      assert.notEqual(drifted.status, 0, role + ': same-SHA branch retarget must block');
      assert.match(drifted.stderr, /candidate role blocked/, role);
      assert.equal(readFileSync(counter, 'utf8'), '2', role + ': both REST reads must occur');
    }
    assert.equal(f.git('rev-parse', 'main'), f.base, 'fixture main remains unchanged');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('tampered reports fail Reviewer; an unrelated extra file fails Developer', () => {
  const f = setup();
  try {
    for (const role of ['developer', 'qa', 'security']) {
      const result = f.run(role);
      assert.equal(result.status, 0, role + ': ' + result.stderr);
    }
    const qaPath = join(f.cwd, 'aieo-output/candidate-qa.json');
    const report = JSON.parse(readFileSync(qaPath, 'utf8'));
    report.routeCasesPassed = 0;
    writeFileSync(qaPath, JSON.stringify(report));
    assert.notEqual(f.run('reviewer').status, 0, 'forged QA proof must be blocked');

    f.git('switch', '-q', branch);
    writeFileSync(join(f.cwd, 'unexpected.txt'), 'unapproved');
    f.git('add', 'unexpected.txt');
    f.git('commit', '-qm', 'out of scope');
    f.git('push', '-q', 'origin', branch);
    f.pr.head.sha = f.git('rev-parse', 'HEAD');
    f.savePr();
    f.git('switch', '-q', 'main');
    assert.notEqual(f.run('developer').status, 0, 'two-file proposal must be rejected');
    assert.equal(f.git('rev-parse', 'main'), f.base);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('reject stale base and multi-commit candidate even with one allowed final file', () => {
  const f = setup();
  try {
    assert.notEqual(f.run('developer', { GITHUB_SHA: 'f'.repeat(40) }).status, 0,
      'PR base must match the trusted main workflow SHA');
    assert.notEqual(f.run('developer', { GITHUB_SHA: '' }).status, 0,
      'missing trusted main SHA must fail closed');
    assert.equal(f.run('developer').status, 0, 'original single-parent candidate is valid');

    f.git('switch', '-q', branch);
    writeFileSync(join(f.cwd, path), candidate.replace('"Current status"', '"Final status"'));
    f.git('add', path);
    f.git('commit', '-qm', 'second commit changing the same approved file');
    f.git('push', '-q', 'origin', branch);
    f.pr.head.sha = f.git('rev-parse', 'HEAD');
    f.savePr();
    f.git('switch', '-q', 'main');

    assert.equal(f.git('diff', '--name-only', f.base, f.pr.head.sha), path,
      'final diff intentionally remains within the allowlist');
    assert.notEqual(f.run('developer').status, 0,
      'extra intermediate commits must be rejected despite a one-file final diff');
    assert.equal(f.git('rev-parse', 'main'), f.base, 'main must stay untouched');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('refuse an untrusted local checkout even when PR API and trusted SHA agree', () => {
  const f = setup();
  try {
    assert.equal(f.run('developer').status, 0, 'trusted base checkout should pass');
    f.git('switch', '-q', branch);
    assert.notEqual(f.run('developer').status, 0,
      'the candidate checkout must never execute independent trusted role checks');
    f.git('switch', '-q', 'main');
    assert.equal(f.run('developer').status, 0, 'returning to trusted main must pass');
    assert.equal(f.git('rev-parse', 'main'), f.base);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('reject a one-commit, one-path candidate that changes executable file mode', () => {
  const f = setup();
  try {
    f.git('switch', '-q', branch);
    // Recreate a SINGLE proposal commit directly on trusted base: only the
    // permission/type gate (not the parent-commit or changed-path gate) can fail.
    f.git('reset', '--hard', 'main');
    writeFileSync(join(f.cwd, path), candidate);
    f.git('add', path);
    f.git('update-index', '--chmod=+x', path);
    // Keep the fixture's physical mode consistent with the index. Otherwise
    // Git correctly refuses switching back to main due to dirty local mode.
    chmodSync(join(f.cwd, path), 0o755);
    f.git('commit', '-qm', 'one-commit candidate with unapproved executable mode');
    const head = f.git('rev-parse', 'HEAD');
    f.git('push', '-q', '--force', 'origin', branch);
    f.pr.head.sha = head;
    f.savePr();
    f.git('switch', '-q', 'main');
    assert.equal(f.git('rev-list', '--parents', '-n', '1', head), head + ' ' + f.base);
    assert.equal(f.git('diff', '--name-only', f.base, head), path);
    assert.equal(f.git('ls-tree', head, '--', path).split(' ')[0], '100755');
    assert.notEqual(f.run('developer').status, 0,
      'mode-changing candidate must be rejected even when content and parentage pass');
    assert.equal(f.git('rev-parse', 'main'), f.base, 'main must remain unchanged');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('reject hidden tracked-file tampering using Git index assume-unchanged and skip-worktree flags', () => {
  const f = setup();
  try {
    assert.equal(f.run('developer').status, 0, 'clean trusted checkout is accepted');

    writeFileSync(join(f.cwd, path), candidate);
    f.git('update-index', '--assume-unchanged', path);
    assert.match(f.git('ls-files', '-v', '--', path), /^h /);
    assert.equal(f.git('status', '--porcelain=v1', '--untracked-files=no'), '',
      'assume-unchanged hides the tampered tracked file from the previous status check');
    assert.notEqual(f.run('developer').status, 0,
      'trusted checkout must reject an assume-unchanged index entry');
    f.git('update-index', '--no-assume-unchanged', path);
    f.git('restore', '--staged', '--worktree', '--', path);

    f.git('update-index', '--skip-worktree', path);
    writeFileSync(join(f.cwd, path), candidate);
    assert.match(f.git('ls-files', '-v', '--', path), /^S /);
    assert.equal(f.git('status', '--porcelain=v1', '--untracked-files=no'), '',
      'skip-worktree hides the tampered tracked file from the previous status check');
    assert.notEqual(f.run('developer').status, 0,
      'trusted checkout must reject a skip-worktree index entry');
    f.git('update-index', '--no-skip-worktree', path);
    f.git('restore', '--staged', '--worktree', '--', path);

    assert.equal(f.run('developer').status, 0,
      'clean restored checkout remains eligible after index flags are removed');
    assert.equal(f.git('rev-parse', 'main'), f.base, 'main remains unchanged');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('refuse staged and unstaged changes to trusted tracked files before any candidate review', () => {
  const f = setup();
  try {
    // Reports are untracked handoff artifacts and must remain allowed.
    assert.equal(f.run('developer').status, 0, 'clean base checkout should pass');
    writeFileSync(join(f.cwd, path), candidate);
    assert.notEqual(f.run('developer').status, 0,
      'unstaged worktree edits must not be treated as the trusted workflow checkout');
    f.git('add', path);
    assert.notEqual(f.run('developer').status, 0,
      'staged changes must also be rejected even while HEAD matches the trusted SHA');
    f.git('restore', '--staged', '--worktree', '--', path);
    assert.equal(f.run('developer').status, 0,
      'restored trusted checkout with untracked report artifact should pass');
    assert.equal(f.git('rev-parse', 'main'), f.base, 'main must remain untouched');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('independent CLI QA fails closed on a bot Draft that comments out the live route guard', () => {
  const f = setup();
  try {
    f.git('switch', '-q', branch);
    f.git('reset', '--hard', 'main');
    const hidden = candidate.replace(route, '  const controlId = null; //' + route);
    assert.equal(hidden.split(route).length - 1, 1,
      'the old substring check would have accepted the disabled route');
    writeFileSync(join(f.cwd, path), hidden);
    f.git('add', path);
    f.git('commit', '-qm', 'fixture deliberately disables live route guard');
    f.git('push', '-q', '--force', 'origin', branch);
    f.pr.head.sha = f.git('rev-parse', 'HEAD');
    f.savePr();
    f.git('switch', '-q', 'main');

    assert.equal(f.run('developer').status, 0, 'Git provenance alone still passes');
    assert.notEqual(f.run('qa').status, 0, 'independent QA detects disabled guard');
    assert.equal(f.run('security').status, 0,
      'Security generic checks do not substitute for known QA invariant');
    assert.notEqual(f.run('reviewer').status, 0, 'Reviewer refuses missing successful QA');
    assert.equal(f.git('rev-parse', 'main'), f.base, 'main stays unchanged');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('independent Git QA rejects a route decoy inside a multiline template with valid commit provenance', () => {
  const f = setup();
  try {
    f.git('switch', '-q', branch);
    f.git('reset', '--hard', 'main');
    const hidden = candidate.replace(route,
      ['  const decoy = `', route, '`;', '  const controlId = null;'].join('\n'));
    assert.equal(hidden.split('\n').filter((line) => line === route).length, 1,
      'the prior exact-line check would wrongly certify the template literal');
    writeFileSync(join(f.cwd, path), hidden);
    f.git('add', path);
    f.git('commit', '-qm', 'synthetic inactive route guard in a template');
    f.git('push', '-q', '--force', 'origin', branch);
    f.pr.head.sha = f.git('rev-parse', 'HEAD');
    f.savePr();
    f.git('switch', '-q', 'main');

    assert.equal(f.run('developer').status, 0, 'Git provenance alone is valid');
    assert.notEqual(f.run('qa').status, 0, 'independent QA must reject inert route');
    assert.equal(f.run('security').status, 0,
      'generic Security review cannot substitute for the route invariant');
    assert.notEqual(f.run('reviewer').status, 0, 'Reviewer must reject QA failure');
    assert.equal(f.git('rev-parse', 'main'), f.base, 'trusted main remains unchanged');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('independent Git QA rejects unchanged route relocated under a dead branch', () => {
  const f = setup();
  try {
    f.git('switch', '-q', branch);
    f.git('reset', '--hard', 'main');
    const hidden = candidate.replace(route,
      ['  if (false) {', route, '  }', '  const controlId = null;'].join('\n'));
    assert.equal(hidden.split('\n').filter((line) => line === route).length, 1);
    writeFileSync(join(f.cwd, path), hidden);
    f.git('add', path);
    f.git('commit', '-qm', 'synthetic route relocation into an unreachable branch');
    f.git('push', '-q', '--force', 'origin', branch);
    f.pr.head.sha = f.git('rev-parse', 'HEAD');
    f.savePr();
    f.git('switch', '-q', 'main');

    assert.equal(f.run('developer').status, 0, 'trusted one-commit provenance passes');
    assert.notEqual(f.run('qa').status, 0,
      'independent QA must reject relocation despite an unchanged executable line');
    assert.equal(f.run('security').status, 0,
      'generic Security still passes, proving dedicated QA is the blocker');
    assert.notEqual(f.run('reviewer').status, 0, 'Reviewer must fail closed');
    assert.equal(f.git('rev-parse', 'main'), f.base, 'trusted fixture main is unchanged');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('independent real-Git QA refuses a model candidate that forces a hidden widget visible guard to false', () => {
  const f = setup();
  try {
    // Build a new trusted baseline with a realistic pre-render visibility guard.
    f.git('switch', '-q', 'main');
    const guarded = original.replace('  const statusLabel = "Old status";',
      '  if (!visible) return null;\n' +
      '  const statusLabel = "Old status";\n' +
      '  return <><span>{statusLabel}</span></>;');
    writeFileSync(join(f.cwd, path), guarded);
    f.git('add', path);
    f.git('commit', '-qm', 'fixture with trusted pre-render visibility logic');
    const trustedHead = f.git('rev-parse', 'HEAD');
    f.git('push', '-q', '--force', 'origin', 'main');

    f.git('switch', '-q', branch);
    f.git('reset', '--hard', 'main');
    const disabled = guarded.replace('if (!visible) return null;', 'if (true) return null;');
    assert.ok(disabled.includes(route), 'route hook remains unchanged');
    writeFileSync(join(f.cwd, path), disabled);
    f.git('add', path);
    f.git('commit', '-qm', 'synthetic disabled feedback UI');
    f.git('push', '-q', '--force', 'origin', branch);
    f.pr.base.sha = trustedHead;
    f.pr.head.sha = f.git('rev-parse', 'HEAD');
    f.savePr();
    f.git('switch', '-q', 'main');

    const overrides = { GITHUB_SHA: trustedHead };
    assert.equal(f.run('developer', overrides).status, 0, 'trusted Git provenance passes');
    assert.notEqual(f.run('qa', overrides).status, 0,
      'independent QA must reject newly unconditional early return');
    assert.equal(f.run('security', overrides).status, 0,
      'generic security scanner is not a substitute for QA runtime invariants');
    assert.notEqual(f.run('reviewer', overrides).status, 0, 'Reviewer must fail closed');
    assert.equal(f.git('rev-parse', 'main'), trustedHead, 'main fixture stays unchanged');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('independent real-Git roles accept copy but reject JSX state bypass on a bot Draft', () => {
  const f = setup();
  try {
    f.git('switch', '-q', 'main');
    const baseline = original.replace('  const statusLabel = "Old status";',
      '  const statusLabel = "Old status";\n' +
      '  return <><div>{open && <span>Old label</span>}</div></>;');
    writeFileSync(join(f.cwd, path), baseline);
    f.git('add', path);
    f.git('commit', '-qm', 'trusted rendered JSX baseline');
    const trusted = f.git('rev-parse', 'HEAD');
    f.git('push', '-q', '--force', 'origin', 'main');
    const overrides = { GITHUB_SHA: trusted };
    f.pr.base.sha = trusted;

    const publishFixture = (content, message) => {
      f.git('switch', '-q', branch);
      f.git('reset', '--hard', 'main');
      writeFileSync(join(f.cwd, path), content);
      f.git('add', path);
      f.git('commit', '-qm', message);
      f.git('push', '-q', '--force', 'origin', branch);
      f.pr.head.sha = f.git('rev-parse', 'HEAD');
      f.savePr();
      f.git('switch', '-q', 'main');
    };
    publishFixture(baseline.replace('Old label', 'Updated label'), 'safe static copy');
    for (const [role, status] of [
      ['developer', 'proposed'], ['qa', 'passed'],
      ['security', 'passed'], ['reviewer', 'draft-pr-eligible']
    ]) {
      const result = f.run(role, overrides);
      assert.equal(result.status, 0, role + ': ' + result.stderr);
      assert.equal(JSON.parse(result.stdout).status, status);
    }

    publishFixture(baseline.replace('open &&', 'false &&'), 'unsafe JSX visibility bypass');
    // A different immutable candidate requires fresh Developer/Security output.
    // Keep the old QA report to verify Reviewer refuses stale role evidence.
    rmSync(join(f.cwd, 'aieo-output/candidate-developer.json'));
    rmSync(join(f.cwd, 'aieo-output/candidate-security.json'));
    assert.equal(f.run('developer', overrides).status, 0, 'Git provenance still passes');
    assert.notEqual(f.run('qa', overrides).status, 0, 'independent QA blocks JSX control flow');
    assert.equal(f.run('security', overrides).status, 0,
      'generic security regex does not detect this JSX state bypass');
    assert.notEqual(f.run('reviewer', overrides).status, 0,
      'Reviewer fails closed without matching successful QA evidence');
    assert.equal(f.git('rev-parse', 'main'), trusted, 'trusted fixture main is unchanged');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('independent real-Git roles reject markup-shaped JS string edits while allowing visible copy', () => {
  const f = setup();
  try {
    f.git('switch', '-q', 'main');
    const baseline = original.replace('  const statusLabel = "Old status";', [
      '  const statusLabel = "Old status";',
      '  return <>',
      '    {(() => {',
      '      const endpoint = "https://trusted.example/<span>Old endpoint</span>";',
      '      return <a href={endpoint}>Help</a>;',
      '    })()}',
      '    <span>Visible label</span>',
      '  </>;'
    ].join('\n'));
    writeFileSync(join(f.cwd, path), baseline);
    f.git('add', path);
    f.git('commit', '-qm', 'trusted JSX baseline containing a code string');
    const trusted = f.git('rev-parse', 'HEAD');
    f.git('push', '-q', '--force', 'origin', 'main');
    f.pr.base.sha = trusted;
    const overrides = { GITHUB_SHA: trusted };

    const publish = (content, message) => {
      f.git('switch', '-q', branch);
      f.git('reset', '--hard', 'main');
      writeFileSync(join(f.cwd, path), content);
      f.git('add', path);
      f.git('commit', '-qm', message);
      f.git('push', '-q', '--force', 'origin', branch);
      f.pr.head.sha = f.git('rev-parse', 'HEAD');
      f.savePr();
      f.git('switch', '-q', 'main');
    };

    publish(baseline.replace('Visible label', 'Updated label'), 'legitimate JSX copy');
    for (const [role, status] of [
      ['developer', 'proposed'], ['qa', 'passed'],
      ['security', 'passed'], ['reviewer', 'draft-pr-eligible']
    ]) {
      const result = f.run(role, overrides);
      assert.equal(result.status, 0, role + ': ' + result.stderr);
      assert.equal(JSON.parse(result.stdout).status, status);
    }

    publish(baseline.replace('Old endpoint', 'Changed endpoint'), 'JS string disguised as JSX text');
    // Rehearse a new candidate, not an overwrite of the previous report.
    rmSync(join(f.cwd, 'aieo-output/candidate-developer.json'));
    assert.equal(f.run('developer', overrides).status, 0, 'source provenance alone is valid');
    assert.notEqual(f.run('qa', overrides).status, 0,
      'independent QA must reject edits inside a JS string');
    assert.notEqual(f.run('reviewer', overrides).status, 0,
      'Reviewer must not certify an unchanged-looking JSX string');
    assert.equal(f.git('rev-parse', 'main'), trusted, 'fixture main remains unchanged');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('independent real-Git roles allow display copy but block CSS text changes in JSX', () => {
  const f = setup();
  try {
    f.git('switch', '-q', 'main');
    const baseline = original.replace('  const statusLabel = "Old status";', [
      '  const statusLabel = "Old status";',
      '  return <>',
      '    <span>Visible label</span>',
      '    <style>visibility: visible;</style>',
      '  </>;'
    ].join('\n'));
    writeFileSync(join(f.cwd, path), baseline);
    f.git('add', path);
    f.git('commit', '-qm', 'trusted JSX baseline with style element');
    const trusted = f.git('rev-parse', 'HEAD');
    f.git('push', '-q', '--force', 'origin', 'main');
    f.pr.base.sha = trusted;
    const overrides = { GITHUB_SHA: trusted };

    const publish = (source, message) => {
      f.git('switch', '-q', branch);
      f.git('reset', '--hard', 'main');
      writeFileSync(join(f.cwd, path), source);
      f.git('add', path);
      f.git('commit', '-qm', message);
      f.git('push', '-q', '--force', 'origin', branch);
      f.pr.head.sha = f.git('rev-parse', 'HEAD');
      f.savePr();
      f.git('switch', '-q', 'main');
    };

    publish(baseline.replace('Visible label', 'Updated label'), 'safe display-only copy');
    for (const [role, status] of [
      ['developer', 'proposed'], ['qa', 'passed'],
      ['security', 'passed'], ['reviewer', 'draft-pr-eligible']
    ]) {
      const result = f.run(role, overrides);
      assert.equal(result.status, 0, role + ': ' + result.stderr);
      assert.equal(JSON.parse(result.stdout).status, status);
    }

    publish(baseline.replace('visibility: visible;', 'visibility: hidden;'),
      'unsafe style body mutation');
    rmSync(join(f.cwd, 'aieo-output/candidate-developer.json'));
    assert.equal(f.run('developer', overrides).status, 0, 'candidate Git provenance is valid');
    assert.notEqual(f.run('qa', overrides).status, 0,
      'QA must reject style content as executable presentation behavior');
    assert.notEqual(f.run('reviewer', overrides).status, 0,
      'Reviewer must refuse absent independently passing QA');
    assert.equal(f.git('rev-parse', 'main'), trusted, 'trusted fixture main remains unchanged');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('four independent real-Git roles accept actual widget copy and reject refactored JSX trust drift', () => {
  const f = setup();
  try {
    const source = readFileSync(new URL('../components/FeedbackWidget.tsx', import.meta.url), 'utf8');
    const copyTag = '<strong>تم حفظ الملاحظة</strong>';
    assert.ok(source.includes(copyTag));
    assert.ok(source.includes('\n  return <>'));
    const publish = (base, next, label) => {
      f.git('switch', '-q', 'main');
      writeFileSync(join(f.cwd, path), base);
      f.git('add', path);
      f.git('commit', '-qm', 'fixture trusted ' + label);
      const trusted = f.git('rev-parse', 'HEAD');
      f.git('push', '-q', 'origin', 'main');
      f.git('switch', '-q', branch);
      f.git('reset', '--hard', 'main');
      writeFileSync(join(f.cwd, path), next);
      f.git('add', path);
      f.git('commit', '-qm', 'candidate ' + label);
      f.git('push', '-q', '--force', 'origin', branch);
      f.pr.base.sha = trusted;
      f.pr.head.sha = f.git('rev-parse', 'HEAD');
      f.savePr();
      f.git('switch', '-q', 'main');
      return { GITHUB_SHA: trusted };
    };

    const good = source.replace(copyTag, '<strong>تم حفظ الملاحظة بنجاح</strong>');
    const goodEnv = publish(source, good, 'real-source-copy');
    for (const [role, status] of [
      ['developer', 'proposed'], ['qa', 'passed'],
      ['security', 'passed'], ['reviewer', 'draft-pr-eligible']
    ]) {
      const result = f.run(role, goodEnv);
      assert.equal(result.status, 0, role + ': ' + result.stderr);
      assert.equal(JSON.parse(result.stdout).status, status, role);
    }

    const drifted = source.replace('\n  return <>', '\n  return (\n    <>')
      .replace('\n  </>;', '\n    </>\n  );');
    const unsafe = drifted.replace('{state === "success" ?', '{true ?');
    assert.notEqual(unsafe, drifted);
    const badEnv = publish(drifted, unsafe, 'real-source-render-drift');
    // Keep stale QA/Security proofs as adversarial inputs; only the
    // regenerated Developer report belongs to this separate candidate.
    rmSync(join(f.cwd, 'aieo-output/candidate-developer.json'));
    assert.equal(f.run('developer', badEnv).status, 0,
      'valid Git provenance alone cannot detect unsafe JSX changes');
    assert.notEqual(f.run('qa', badEnv).status, 0,
      'QA must fail closed instead of using synthetic fixture fallback');
    assert.notEqual(f.run('security', badEnv).status, 0,
      'Security refuses unexpected submit-handler render boundary');
    assert.notEqual(f.run('reviewer', badEnv).status, 0,
      'Reviewer must reject stale prior-pass artifacts and unsafe new candidate');
    assert.equal(f.git('rev-parse', 'main'), badEnv.GITHUB_SHA,
      'isolated main commit stays untouched by every role');
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});


test('independent roles reject a real feedback network-error handler fix outside model copy-only scope', () => {
  // A legitimate application repair (review/feedback-network-error) must NOT
  // be automatically certified by the bounded display-copy model workflow.
  // Source here is the real trusted widget; no application file is changed.
  const f = setup();
  try {
    const source = readFileSync(new URL('../components/FeedbackWidget.tsx', import.meta.url), 'utf8');
    const before = [
      '    const { data: auth } = await supabase.auth.getUser();',
      '    if (!auth.user) { setError("انتهت جلسة الدخول. سجّل الدخول ثم حاول مرة أخرى."); setState("error"); return; }',
      '    const { error: insertError } = await supabase.from("feedback").insert({ created_by: auth.user.id, category, priority, message: cleanMessage, page_path: pagePath, control_id: controlId ? Number(controlId) : null });',
      '    if (insertError) { setError("تعذر حفظ الملاحظة. حاول مرة أخرى."); setState("error"); return; }',
      '    setMessage(""); setState("success");'
    ].join('\n');
    const after = [
      '    try {',
      '      const { data: auth, error: authError } = await supabase.auth.getUser();',
      '      if (authError || !auth.user) { setError("انتهت جلسة الدخول. سجّل الدخول ثم حاول مرة أخرى."); setState("error"); return; }',
      '      const { error: insertError } = await supabase.from("feedback").insert({ created_by: auth.user.id, category, priority, message: cleanMessage, page_path: pagePath, control_id: controlId ? Number(controlId) : null });',
      '      if (insertError) { setError("تعذر حفظ الملاحظة. حاول مرة أخرى."); setState("error"); return; }',
      '      setMessage(""); setState("success");',
      '    } catch {',
      '      setError("تعذر الاتصال بالخدمة. تحقق من اتصالك وحاول مرة أخرى.");',
      '      setState("error");',
      '    }'
    ].join('\n');
    assert.ok(source.includes(before), 'source baseline must still match real original handler');
    const repaired = source.replace(before, after);
    assert.notEqual(repaired, source);

    f.git('switch', '-q', 'main');
    writeFileSync(join(f.cwd, path), source);
    f.git('add', path);
    f.git('commit', '-qm', 'trusted real-source baseline');
    const baseSha = f.git('rev-parse', 'HEAD');
    f.git('push', '-q', 'origin', 'main');

    f.git('switch', '-q', branch);
    f.git('reset', '--hard', 'main');
    writeFileSync(join(f.cwd, path), repaired);
    f.git('add', path);
    f.git('commit', '-qm', 'realistic network failure repair candidate');
    const headSha = f.git('rev-parse', 'HEAD');
    f.git('push', '-q', '--force', 'origin', branch);
    f.pr.base.sha = baseSha;
    f.pr.head.sha = headSha;
    f.savePr();
    f.git('switch', '-q', 'main');

    const env = { GITHUB_SHA: baseSha };
    assert.equal(f.run('developer', env).status, 0,
      'Developer verifies Git provenance, not arbitrary behavioral correctness');
    assert.notEqual(f.run('qa', env).status, 0,
      'QA must reject behavioral application fixes outside its approved text-only model scope');
    assert.notEqual(f.run('security', env).status, 0,
      'Security must independently block edits to the protected submit handler');
    assert.notEqual(f.run('reviewer', env).status, 0,
      'Reviewer must refuse an otherwise legitimate but unapproved model-scope repair');
    assert.equal(f.git('rev-parse', 'main'), baseSha, 'trusted main stays unchanged');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('pre-build replay rejects live process credentials concealed by injected context before Git', () => {
  // Run the replay entry point in a disposable child with real process
  // credentials but a clean injected context. A fake Git executable records
  // whether the pre-build safety gate invoked ANY Git subprocess.
  const root = mkdtempSync(join(tmpdir(), 'aieo-replay-live-credential-'));
  const marker = join(root, 'git-invocation-marker');
  const fakeGit = join(root, 'git');
  writeFileSync(fakeGit, [
    '#!/bin/sh',
    'printf "invoked\n" >> ' + JSON.stringify(marker),
    'exit 98',
    ''
  ].join('\n'));
  chmodSync(fakeGit, 0o755);
  const url = new URL('./aieo-candidate-replay.mjs', import.meta.url).href;
  const driver = `
    import { replayReviewedCandidate } from ${JSON.stringify(url)};
    const injected = {
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_REPOSITORY: 'jayalshehri/CGP-MVP',
      GITHUB_SHA: 'a'.repeat(40),
      AIEO_PR_NUMBER: '777'
    };
    try {
      replayReviewedCandidate(injected);
      process.exitCode = 2;
    } catch (error) {
      if (!/AIEO pre-build replay blocked/.test(String(error.message))) process.exitCode = 3;
    }
  `;
  try {
    for (const name of ['GH_TOKEN', 'GITHUB_TOKEN', 'OPENROUTER_API_KEY']) {
      const child = spawnSync(process.execPath,
        ['--input-type=module', '-e', driver], {
          cwd: root, encoding: 'utf8', timeout: 15000,
          env: {
            PATH: root + delimiter + process.env.PATH,
            HOME: root,
            [name]: 'synthetic-never-real-credential'
          }
        });
      assert.equal(child.status, 0, name + ': replay must fail closed');
      assert.equal(existsSync(marker), false,
        name + ': no Git executable may run before credential rejection');
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('pre-build replay pins Git across attestation, immutable reads and diff despite PATH alias replacement', () => {
  const f = setup();
  const replayScript = join(dirname(fileURLToPath(import.meta.url)), 'aieo-candidate-replay.mjs');
  try {
    for (const role of ['developer', 'qa', 'security', 'reviewer']) {
      const checked = f.run(role);
      assert.equal(checked.status, 0, role + ': ' + checked.stderr);
    }
    const bin = join(f.root, 'bin');
    const alias = join(bin, 'git');
    const trusted = join(f.root, 'trusted-git');
    const evil = join(f.root, 'untrusted-git');
    const marker = join(f.root, 'untrusted-git-executed');
    const realGit = pinReadOnlyGitExecutable(process.env);
    writeFileSync(evil, [
      '#!/bin/sh',
      'printf "unexpected git execution\\n" > ' + JSON.stringify(marker),
      'exit 91',
      ''
    ].join('\n'));
    chmodSync(evil, 0o755);
    writeFileSync(trusted, [
      '#!/bin/sh',
      // Switch the PATH symlink during the first credential-free Git call.
      // This was previously exploitable by the later bare execFileSync('git').
      'rm -f -- ' + JSON.stringify(alias),
      'ln -s -- ' + JSON.stringify(evil) + ' ' + JSON.stringify(alias),
      'exec ' + JSON.stringify(realGit) + ' "$@"',
      ''
    ].join('\n'));
    chmodSync(trusted, 0o755);
    symlinkSync(trusted, alias);
    const replay = spawnSync(process.execPath, [replayScript], {
      cwd: f.cwd, encoding: 'utf8', timeout: 25000,
      env: { ...f.env, GH_TOKEN: '', GITHUB_TOKEN: '', OPENROUTER_API_KEY: '' }
    });
    assert.equal(readlinkSync(alias), evil,
      'the PATH alias must actually be replaced after the first Git operation');
    assert.equal(existsSync(marker), false,
      'candidate replay must never invoke the swapped untrusted Git executable');
    assert.equal(replay.status, 0, replay.stderr);
    assert.equal(JSON.parse(replay.stdout).status, 'verified-candidate-replayed-for-build');
    assert.equal(readFileSync(join(f.cwd, path), 'utf8'), candidate);
    assert.equal(f.git('rev-parse', 'main'), f.base,
      'successful isolated replay leaves the trusted main commit unchanged');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('pre-build replay accepts only four verified role handoffs and a credential-free Git blob', () => {
  const f = setup();
  const replayScript = join(dirname(fileURLToPath(import.meta.url)), 'aieo-candidate-replay.mjs');
  const runReplay = (overrides = {}) => spawnSync(process.execPath, [replayScript], {
    cwd: f.cwd, encoding: 'utf8', timeout: 25000,
    env: {
      ...f.env, GH_TOKEN: '', GITHUB_TOKEN: '', OPENROUTER_API_KEY: '',
      ...overrides
    }
  });
  try {
    assert.notEqual(runReplay().status, 0, 'no unverified role reports can be built');
    for (const role of ['developer', 'qa', 'security', 'reviewer']) {
      const r = f.run(role);
      assert.equal(r.status, 0, role + ': ' + r.stderr);
    }
    assert.notEqual(runReplay({ GH_TOKEN: 'synthetic-should-be-absent' }).status, 0,
      'the build replay must not receive GitHub credentials');
    assert.notEqual(runReplay({ GIT_CONFIG_COUNT: '1' }).status, 0,
      'inherited Git configuration injection must be rejected before reading blobs');
    assert.equal(readFileSync(join(f.cwd, path), 'utf8'), original,
      'failed replay must not change the trusted source');

    // A Git diff looks clean even when an untracked config, an ignored env
    // file or an additional downloaded handoff may change the npm build.
    // Pre-build rejection must preserve original application source bytes.
    for (const extra of ['unreviewed.config.mjs', 'aieo-output/unreviewed.cjs']) {
      const name = join(f.cwd, extra);
      writeFileSync(name, 'synthetic, unapproved build input\n');
      assert.notEqual(runReplay().status, 0, extra + ' must block before npm');
      assert.equal(readFileSync(join(f.cwd, path), 'utf8'), original);
      rmSync(name);
    }
    // Unlike --exclude-standard, ls-files --others must also reject ignored
    // files such as a hidden .env.local consumed by the Next.js build.
    writeFileSync(join(f.cwd, '.git/info/exclude'), '.env.local\n');
    writeFileSync(join(f.cwd, '.env.local'), 'SYNTHETIC_ONLY=yes\n');
    assert.equal(f.git('check-ignore', '.env.local'), '.env.local');
    assert.notEqual(runReplay().status, 0, 'ignored env override must fail closed');
    assert.equal(readFileSync(join(f.cwd, path), 'utf8'), original);
    rmSync(join(f.cwd, '.env.local'));

    // A validated PR is not permission to write through an unowned or
    // special-mode workspace input. Reject before mutating the baseline.
    const replayTarget = join(f.cwd, path);
    const replayParent = dirname(replayTarget);
    for (const [name, entry, unsafeMode] of [
      ['owner-unreadable source', replayTarget, 0o200],
      ['setuid source', replayTarget, 0o4644],
      ['setgid source', replayTarget, 0o2644],
      ['sticky source', replayTarget, 0o1644],
      ['setuid source directory', replayParent, 0o4755],
      ['setgid source directory', replayParent, 0o2755],
      ['sticky source directory', replayParent, 0o1755]
    ]) {
      const safeMode = statSync(entry).mode & 0o7777;
      try {
        chmodSync(entry, unsafeMode);
        if (unsafeMode & 0o7000) {
          assert.equal(statSync(entry).mode & 0o7000, unsafeMode & 0o7000,
            name + ' must actually have the tested special bit');
        }
        const blocked = runReplay();
        assert.notEqual(blocked.status, 0, name + ' must block replay');
        assert.match(blocked.stderr, /pre-build replay blocked/,
          name + ' must fail closed without exposing candidate data');
      } finally {
        chmodSync(entry, safeMode);
      }
      assert.equal(readFileSync(replayTarget, 'utf8'), original,
        name + ' must preserve original source bytes');
    }

    const accepted = runReplay();
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(JSON.parse(accepted.stdout).status, 'verified-candidate-replayed-for-build');
    assert.equal(readFileSync(join(f.cwd, path), 'utf8'), candidate);
    assert.equal(f.git('rev-parse', 'HEAD'), f.base, 'candidate replay does not create a commit');

    f.git('restore', '--', path);
    const qaPath = join(f.cwd, 'aieo-output/candidate-qa.json');
    const qa = JSON.parse(readFileSync(qaPath, 'utf8'));
    writeFileSync(qaPath, JSON.stringify({ ...qa, status: 'passed', routeCasesPassed: 0 }));
    assert.notEqual(runReplay().status, 0, 'forged QA evidence must block compilation');
    assert.equal(readFileSync(join(f.cwd, path), 'utf8'), original);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('post-build gate reattests the exact independently reviewed blob and current remote Draft', () => {
  const f = setup();
  try {
    for (const role of ['developer', 'qa', 'security', 'reviewer']) {
      const result = f.run(role);
      assert.equal(result.status, 0, role + ': ' + result.stderr);
    }
    // Simulate the read-only workflow's candidate replay before npm build.
    const reviewedSource = execFileSync('git', ['show', f.head + ':' + path],
      { cwd: f.cwd, encoding: 'utf8' });
    writeFileSync(join(f.cwd, path), reviewedSource);
    const verify = (overrides = {}) => spawnSync(process.execPath, [finalizerScript], {
      cwd: f.cwd, env: { ...f.env, ...overrides }, encoding: 'utf8', timeout: 25000
    });
    const good = verify();
    assert.equal(good.status, 0, good.stderr);
    const outcome = JSON.parse(good.stdout);
    assert.equal(outcome.status, 'post-build-draft-reverified');
    assert.equal(outcome.headSha, f.head);
    assert.equal(outcome.requiresHumanMerge, true);
    assert.equal(f.git('rev-parse', 'main'), f.base);
    const developerProof = JSON.parse(readFileSync(
      join(f.cwd, 'aieo-output/candidate-developer.json'), 'utf8'));
    assert.equal(developerProof.headRef, branch,
      'Developer pins the exact remotely reviewed head branch');

    // A valid new branch can point to exactly the same immutable candidate.
    // Retargeting the Draft after all four roles but before finalization must
    // not borrow earlier attestations based solely on identical commit SHAs.
    const otherBranch = 'aieo/model-proposal-77331-2';
    f.git('push', '-q', 'origin', f.head + ':refs/heads/' + otherBranch);
    f.pr.head.ref = otherBranch;
    f.savePr();
    assert.equal(f.pr.head.sha, f.head);
    const retargeted = verify();
    assert.notEqual(retargeted.status, 0,
      'post-build must reject same-SHA retarget to a second allowed branch');
    assert.match(retargeted.stderr, /post-build check blocked/);
    f.pr.head.ref = branch;
    f.savePr();
    assert.equal(verify().status, 0, 'restoring exact reviewed branch passes');
    assert.equal(f.git('rev-parse', 'main'), f.base);

    // Source bytes are unchanged, but insecure permissions could let an
    // unrelated process alter the build replay between two approvals.
    const reviewedPath = join(f.cwd, path);
    chmodSync(reviewedPath, 0o666);
    assert.notEqual(verify().status, 0,
      'post-build source readable but writable by others must fail');
    chmodSync(reviewedPath, 0o644);
    assert.equal(verify().status, 0, 'secure source mode must recover');
    const componentDir = join(f.cwd, 'components');
    chmodSync(componentDir, 0o777);
    assert.notEqual(verify().status, 0, 'writable source directory must fail');
    chmodSync(componentDir, 0o755);
    assert.equal(verify().status, 0, 'secure directory must recover');

    // The old byte-only verifier would accept a handoff symlink or hardlink
    // pointing outside the trusted workspace, provided its JSON matched.
    // Neither alias must be accepted, even when the allowed untracked path
    // and all independently recomputed report bytes are unchanged.
    for (const role of ['developer', 'qa', 'security', 'reviewer']) {
      const reportPath = join(f.cwd, 'aieo-output/candidate-' + role + '.json');
      const prior = readFileSync(reportPath, 'utf8');
      const outside = join(f.root, 'external-' + role + '.json');
      for (const [alias, create] of [
        ['symbolic', symlinkSync], ['hard', linkSync]
      ]) {
        writeFileSync(outside, prior);
        rmSync(reportPath);
        create(outside, reportPath);
        assert.equal(f.git('ls-files', '--others', '--exclude-standard',
          '--', 'aieo-output/candidate-' + role + '.json'),
          'aieo-output/candidate-' + role + '.json',
          'Git lists the aliased report under an otherwise allowlisted path');
        assert.notEqual(verify().status, 0,
          'post-build gate must reject ' + alias + '-linked ' + role + ' evidence');
        rmSync(reportPath);
        rmSync(outside);
        writeFileSync(reportPath, prior, { mode: 0o600 });
        assert.equal(verify().status, 0,
          'restoring ordinary ' + role + ' evidence must pass');
      }
    }

    // A reviewed build source can be hardlinked to an identical file outside
    // the workspace. Git's diff still reports only the approved candidate,
    // yet the source's inode is shared with an untrusted external path.
    const sourcePath = join(f.cwd, path);
    const externalSource = join(f.root, 'external-reviewed-widget.tsx');
    writeFileSync(externalSource, reviewedSource);
    rmSync(sourcePath);
    linkSync(externalSource, sourcePath);
    assert.equal(f.git('diff', '--name-only'), path,
      'Git diff cannot reveal a byte-identical external source hardlink');
    assert.equal(readFileSync(sourcePath, 'utf8'), reviewedSource);
    assert.notEqual(verify().status, 0,
      'post-build attestation must reject hardlinked reviewed source');
    rmSync(sourcePath);
    rmSync(externalSource);
    writeFileSync(sourcePath, reviewedSource);
    assert.equal(verify().status, 0,
      'ordinary singly-linked reviewed source passes after restoration');

    // Untracked files do not appear in git diff. Do not attest a build that
    // generated a new source/config or an unexpected extra role artifact.
    for (const untrackedPath of [
      'scripts/unexpected-build-source.mjs',
      'aieo-output/unexpected-review-artifact.json'
    ]) {
      const unexpectedFile = join(f.cwd, untrackedPath);
      writeFileSync(unexpectedFile, '{"unexpected":true}\\n');
      assert.equal(f.git('diff', '--name-only'), path,
        'normal git diff must not observe untracked build-time files');
      assert.notEqual(verify().status, 0,
        'post-build gate must reject unexpected untracked path: ' + untrackedPath);
      rmSync(unexpectedFile);
      assert.equal(verify().status, 0,
        'removing the unexpected file restores the valid candidate proof');
    }

    // A generic Git exclude hides ignored files from --exclude-standard.
    // Only the four known Next/npm build outputs may be present after build.
    writeFileSync(join(f.cwd, '.git/info/exclude'),
      '.env.local\nruntime.pem\n/backups/\n/node_modules/\n/.next/\nnext-env.d.ts\ntsconfig.tsbuildinfo\n');
    for (const ignoredPath of ['.env.local', 'runtime.pem', 'backups/extra.json']) {
      const full = join(f.cwd, ignoredPath);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, 'synthetic unreviewed post-build input\n');
      assert.equal(f.git('check-ignore', ignoredPath), ignoredPath,
        ignoredPath + ' must really be hidden by Git ignore rules');
      assert.equal(f.git('diff', '--name-only'), path);
      assert.notEqual(verify().status, 0,
        'post-build gate must reject ignored config/credential/backup: ' + ignoredPath);
      rmSync(full);
      // Git --directory still reports even an empty ignored directory.
      // Its removal is required before any post-build attestation can pass.
      if (ignoredPath === 'backups/extra.json') {
        assert.notEqual(verify().status, 0,
          'empty ignored backup directory also remains out of scope');
        rmSync(join(f.cwd, 'backups'), { recursive: true, force: true });
      }
      assert.equal(verify().status, 0, 'removing ignored input recovers attestation');
    }
    for (const built of ['node_modules/example/index.js', '.next/cache/item',
      'next-env.d.ts', 'tsconfig.tsbuildinfo']) {
      const full = join(f.cwd, built);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, 'synthetic generated build output\n');
    }
    assert.equal(verify().status, 0,
      'post-build gate must allow only the four known generated output paths');
    rmSync(join(f.cwd, 'node_modules'), { recursive: true, force: true });
    rmSync(join(f.cwd, '.next'), { recursive: true, force: true });
    rmSync(join(f.cwd, 'next-env.d.ts'));
    rmSync(join(f.cwd, 'tsconfig.tsbuildinfo'));
    assert.equal(verify().status, 0, 'clean baseline remains valid');

    // Simulate a build tool modifying another tracked source while setting an
    // index flag that hides the change from the previous diff-only finalizer.
    // The approved candidate itself remains byte-identical.
    const trustedBuildPath = 'scripts/trusted-build-step.mjs';
    const trustedBuild = join(f.cwd, trustedBuildPath);
    const trustedBuildOriginal = readFileSync(trustedBuild, 'utf8');
    for (const [hide, unhide] of [
      ['--assume-unchanged', '--no-assume-unchanged'],
      ['--skip-worktree', '--no-skip-worktree']
    ]) {
      writeFileSync(trustedBuild, 'export const approved = false;\n');
      f.git('update-index', hide, trustedBuildPath);
      assert.equal(f.git('diff', '--name-only'), path,
        'a normal diff conceals the unapproved tracked build-time change');
      assert.notEqual(verify().status, 0,
        hide + ': final post-build attestation must reject hidden source tampering');
      f.git('update-index', unhide, trustedBuildPath);
      f.git('restore', '--worktree', '--', trustedBuildPath);
      assert.equal(readFileSync(trustedBuild, 'utf8'), trustedBuildOriginal);
      assert.equal(verify().status, 0, 'clean restored checkout still passes');
    }

    writeFileSync(join(f.cwd, path), reviewedSource.replace('Current status', 'Changed after review'));
    assert.notEqual(verify().status, 0, 'source mutated during build must be rejected');
    writeFileSync(join(f.cwd, path), reviewedSource);
    assert.equal(verify().status, 0, 'restoring reviewed bytes recovers the check');

    for (const mutate of [
      (pr) => { pr.head.sha = 'f'.repeat(40); },
      (pr) => { pr.base.sha = 'f'.repeat(40); },
      (pr) => { pr.draft = false; },
      (pr) => { pr.state = 'closed'; },
      (pr) => { pr.merged_at = '2026-11-13T00:00:00Z'; },
      (pr) => { pr.user.id = 191056639; },
      (pr) => { pr.head.repo.full_name = 'foreign/CGP-MVP'; }
    ]) {
      const saved = JSON.parse(JSON.stringify(f.pr));
      mutate(f.pr);
      f.savePr();
      assert.notEqual(verify().status, 0, 'remote PR drift must fail closed');
      Object.assign(f.pr, saved);
      f.savePr();
    }
    const reviewerFile = join(f.cwd, 'aieo-output/candidate-reviewer.json');
    const prior = readFileSync(reviewerFile, 'utf8');
    writeFileSync(reviewerFile, '{"status":"draft-pr-eligible"}');
    assert.notEqual(verify().status, 0, 'forged reviewer evidence must be rejected');
    writeFileSync(reviewerFile, prior);
    assert.notEqual(verify({ GITHUB_SHA: '0'.repeat(40) }).status, 0,
      'stale trusted workflow SHA must be rejected');
    assert.equal(verify().status, 0, 'restored evidence and unchanged Draft pass');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('independent QA, Security and Reviewer reject aliased inbound role artifacts', () => {
  const f = setup();
  try {
    assert.equal(f.run('developer').status, 0);
    const directory = join(f.cwd, 'aieo-output');
    const developerPath = join(directory, 'candidate-developer.json');
    const originalDeveloper = readFileSync(developerPath, 'utf8');
    const externalDeveloper = join(f.root, 'external-developer.json');
    writeFileSync(externalDeveloper, originalDeveloper);
    for (const alias of [symlinkSync, linkSync]) {
      rmSync(developerPath);
      alias(externalDeveloper, developerPath);
      assert.notEqual(f.run('qa').status, 0,
        'QA must not consume a linked Developer artifact, even if bytes match');
      assert.notEqual(f.run('security').status, 0,
        'Security must independently reject linked Developer evidence');
    }
    rmSync(developerPath);
    writeFileSync(developerPath, originalDeveloper, { mode: 0o600 });
    assert.equal(f.run('qa').status, 0, 'ordinary restored Developer evidence is valid');
    assert.equal(f.run('security').status, 0);

    const qaPath = join(directory, 'candidate-qa.json');
    const originalQa = readFileSync(qaPath, 'utf8');
    const externalQa = join(f.root, 'external-qa.json');
    writeFileSync(externalQa, originalQa);
    for (const alias of [symlinkSync, linkSync]) {
      rmSync(qaPath);
      alias(externalQa, qaPath);
      assert.notEqual(f.run('reviewer').status, 0,
        'Reviewer must not consume aliased QA evidence');
    }
    rmSync(qaPath);
    writeFileSync(qaPath, originalQa, { mode: 0o600 });
    assert.equal(f.run('reviewer').status, 0,
      'Reviewer can verify ordinary restored QA and Security evidence');
    assert.equal(f.git('rev-parse', 'main'), f.base);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('independent role output cannot overwrite external files through symlinks or hardlinks', () => {
  const f = setup();
  try {
    const directory = join(f.cwd, 'aieo-output');
    // A successful post-alias control must also meet the private handoff
    // directory contract; a default 0755 mkdir is now correctly rejected.
    mkdirSync(directory, { mode: 0o700 });
    const output = join(directory, 'candidate-developer.json');
    const outside = join(f.root, 'external-report.txt');
    const sentinel = 'DO NOT MODIFY EXTERNAL CONTENT\n';
    writeFileSync(outside, sentinel);
    for (const alias of [symlinkSync, linkSync]) {
      alias(outside, output);
      assert.notEqual(f.run('developer').status, 0,
        'output artifact path must be an unaliased regular file');
      assert.equal(readFileSync(outside, 'utf8'), sentinel,
        'reject before truncating aliased external content');
      rmSync(output);
    }
    assert.equal(f.run('developer').status, 0,
      'regular output is accepted after removing aliases');
    assert.ok(readFileSync(output, 'utf8').includes('"role": "developer"'));
    assert.equal(f.git('rev-parse', 'main'), f.base);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('independent QA, Security and Reviewer use bounded role handoffs and recover from invalid evidence', () => {
  const f = setup();
  try {
    assert.equal(f.run('developer').status, 0);
    const developerPath = join(f.cwd, 'aieo-output/candidate-developer.json');
    const originalDeveloper = readFileSync(developerPath, 'utf8');
    for (const evidence of [
      originalDeveloper + ' '.repeat(65537), // valid JSON but over byte limit
      '' // empty/truncated handoff
    ]) {
      writeFileSync(developerPath, evidence);
      assert.notEqual(f.run('qa').status, 0, 'QA rejects invalid Developer evidence');
      assert.notEqual(f.run('security').status, 0, 'Security independently rejects invalid Developer evidence');
    }
    writeFileSync(developerPath, originalDeveloper);
    assert.equal(f.run('qa').status, 0, 'ordinary Developer evidence restores QA');
    assert.equal(f.run('security').status, 0, 'ordinary Developer evidence restores Security');
    const securityPath = join(f.cwd, 'aieo-output/candidate-security.json');
    const originalSecurity = readFileSync(securityPath, 'utf8');
    writeFileSync(securityPath, originalSecurity + ' '.repeat(65537));
    assert.notEqual(f.run('reviewer').status, 0, 'Reviewer rejects oversized valid JSON evidence');
    writeFileSync(securityPath, originalSecurity);
    assert.equal(f.run('reviewer').status, 0, 'Reviewer accepts restored bounded Security evidence');
    assert.equal(f.git('rev-parse', 'main'), f.base, 'trusted main is unchanged');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('post-build reattestation enforces bounded role evidence and accepts exact restoration', () => {
  const f = setup();
  try {
    for (const role of ['developer', 'qa', 'security', 'reviewer']) {
      const result = f.run(role);
      assert.equal(result.status, 0, role + ': ' + result.stderr);
    }
    const reviewed = execFileSync('git', ['show', f.head + ':' + path],
      { cwd: f.cwd, encoding: 'utf8' });
    writeFileSync(join(f.cwd, path), reviewed);
    const verify = () => spawnSync(process.execPath, [finalizerScript], {
      cwd: f.cwd, env: f.env, encoding: 'utf8', timeout: 25000
    });
    assert.equal(verify().status, 0, 'valid remote Draft and role evidence pass');
    const reviewerPath = join(f.cwd, 'aieo-output/candidate-reviewer.json');
    const originalReviewer = readFileSync(reviewerPath, 'utf8');
    writeFileSync(reviewerPath, originalReviewer + ' '.repeat(65537));
    assert.notEqual(verify().status, 0, 'post-build check rejects oversized valid JSON Reviewer evidence');
    writeFileSync(reviewerPath, originalReviewer);
    assert.equal(verify().status, 0, 'restoring the exact ordinary evidence passes');
    assert.equal(f.git('rev-parse', 'main'), f.base);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('independent roles and final attestation reject group/world-writable handoffs', () => {
  const f = setup();
  try {
    const dir = join(f.cwd, 'aieo-output');
    assert.equal(f.run('developer').status, 0);
    const developer = join(dir, 'candidate-developer.json');
    chmodSync(developer, 0o666);
    assert.notEqual(f.run('qa').status, 0, 'QA rejects world-writable Developer evidence');
    assert.notEqual(f.run('security').status, 0, 'Security rejects world-writable Developer evidence');
    chmodSync(developer, 0o600);
    assert.equal(f.run('qa').status, 0);
    assert.equal(f.run('security').status, 0);
    const qa = join(dir, 'candidate-qa.json');
    chmodSync(qa, 0o664);
    assert.notEqual(f.run('reviewer').status, 0, 'Reviewer rejects group-writable QA evidence');
    chmodSync(qa, 0o600);
    assert.equal(f.run('reviewer').status, 0);

    const reviewed = execFileSync('git', ['show', f.head + ':' + path],
      { cwd: f.cwd, encoding: 'utf8' });
    writeFileSync(join(f.cwd, path), reviewed);
    const verify = () => spawnSync(process.execPath, [finalizerScript], {
      cwd: f.cwd, env: f.env, encoding: 'utf8', timeout: 25000
    });
    assert.equal(verify().status, 0, 'clean evidence passes post-build verification');
    const reviewer = join(dir, 'candidate-reviewer.json');
    chmodSync(reviewer, 0o666);
    assert.notEqual(verify().status, 0, 'finalizer rejects world-writable Reviewer evidence');
    chmodSync(reviewer, 0o600);
    assert.equal(verify().status, 0, 'restored Reviewer evidence passes');

    chmodSync(dir, 0o777);
    assert.notEqual(f.run('developer').status, 0, 'Developer cannot write into writable handoff directory');
    assert.notEqual(f.run('qa').status, 0, 'QA cannot read evidence in writable handoff directory');
    assert.notEqual(f.run('security').status, 0, 'Security cannot read evidence in writable handoff directory');
    assert.notEqual(f.run('reviewer').status, 0, 'Reviewer cannot read evidence in writable handoff directory');
    assert.notEqual(verify().status, 0, 'post-build verifier rejects writable handoff directory');
    chmodSync(dir, 0o755);
    assert.notEqual(verify().status, 0, 'world-traversable evidence must not be accepted');
    chmodSync(dir, 0o700);
    assert.equal(verify().status, 0, 'safe private directory permissions restore final attestation');
    assert.equal(f.git('rev-parse', 'main'), f.base);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('Developer refuses a writable preexisting output before truncating its contents', () => {
  const f = setup();
  try {
    const dir = join(f.cwd, 'aieo-output');
    mkdirSync(dir, { mode: 0o700 });
    const output = join(dir, 'candidate-developer.json');
    const sentinel = 'PRESERVE UNTRUSTED FILE';
    writeFileSync(output, sentinel);
    chmodSync(output, 0o666);
    assert.notEqual(f.run('developer').status, 0, 'untrusted writable output must fail');
    assert.equal(readFileSync(output, 'utf8'), sentinel, 'reject before truncation');
    chmodSync(output, 0o600);
    assert.notEqual(f.run('developer').status, 0,
      'even a private but nonmatching existing output must never be overwritten');
    assert.equal(readFileSync(output, 'utf8'), sentinel);
    rmSync(output);
    assert.equal(f.run('developer').status, 0, 'fresh exclusive output is allowed');
    assert.ok(readFileSync(output, 'utf8').includes('"role": "developer"'));
    assert.equal(f.git('rev-parse', 'main'), f.base);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('candidate role output is idempotent but immutable once created', () => {
  const f = setup();
  try {
    assert.equal(f.run('developer').status, 0, 'fresh Developer evidence is created');
    const output = join(f.cwd, 'aieo-output/candidate-developer.json');
    const originalBytes = readFileSync(output, 'utf8');
    const originalInode = statSync(output).ino;
    assert.equal(f.run('developer').status, 0, 'exactly matching retry is idempotent');
    assert.equal(readFileSync(output, 'utf8'), originalBytes);
    assert.equal(statSync(output).ino, originalInode,
      'an idempotent retry must not replace the original evidence inode');

    const tampered = JSON.parse(originalBytes);
    tampered.status = 'approved';
    const forgedBytes = JSON.stringify(tampered, null, 2) + '\n';
    writeFileSync(output, forgedBytes, { mode: 0o600 });
    assert.notEqual(f.run('developer').status, 0,
      'a private but different handoff cannot be rewritten into approval');
    assert.equal(readFileSync(output, 'utf8'), forgedBytes,
      'rejected output cannot be truncated or overwritten');

    const duplicateKeys = originalBytes.replace(
      '"role": "developer",', '"role": "qa",\n  "role": "developer",');
    assert.notEqual(duplicateKeys, originalBytes);
    writeFileSync(output, duplicateKeys, { mode: 0o600 });
    assert.notEqual(f.run('developer').status, 0,
      'duplicate keys with the same final values must not be accepted as a replay');
    assert.equal(readFileSync(output, 'utf8'), duplicateKeys);

    writeFileSync(output, originalBytes, { mode: 0o600 });
    assert.equal(f.run('developer').status, 0, 'restored exact evidence is idempotent');
    assert.equal(f.git('rev-parse', 'main'), f.base, 'trusted main remains unchanged');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('candidate role outputs refuse public pre-existing reports and preserve private evidence', () => {
  const f = setup();
  try {
    const dir = join(f.cwd, 'aieo-output');
    mkdirSync(dir, { mode: 0o700 });
    const output = join(dir, 'candidate-developer.json');
    const sentinel = 'DO NOT OVERWRITE READABLE EVIDENCE';
    // The old O_NOFOLLOW-only writer truncated these ordinary, readable files.
    for (const mode of [0o644, 0o640, 0o604]) {
      writeFileSync(output, sentinel, { mode: 0o600 });
      chmodSync(output, mode);
      assert.notEqual(f.run('developer').status, 0,
        'refuse pre-existing evidence readable or executable by other users');
      assert.equal(readFileSync(output, 'utf8'), sentinel,
        'reject exposed output before truncation');
      rmSync(output);
    }
    for (const role of ['developer', 'qa', 'security', 'reviewer']) {
      const result = f.run(role);
      assert.equal(result.status, 0, role + ': ' + result.stderr);
      const file = join(dir, 'candidate-' + role + '.json');
      assert.equal(statSync(file).mode & 0o777, 0o600,
        'each independent role must create private evidence');
    }
    assert.equal(f.git('rev-parse', 'main'), f.base);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('bounded role reader rejects a same-byte inode replacement during a report read', () => {
  const f = setup();
  try {
    assert.equal(f.run('developer').status, 0, 'fixture Developer must create private evidence');
    const reportPath = join(f.cwd, 'aieo-output/candidate-developer.json');
    const shim = join(f.root, 'swap-after-read.mjs');
    // The imported reader obtains the original fd, then the injected readSync
    // replaces its pathname with an identical new file before the final fstat.
    // The old fd remains unchanged; only a final pathname inode check detects it.
    writeFileSync(shim, [
      "import fs from 'node:fs';",
      "import { syncBuiltinESMExports } from 'node:module';",
      'const originalRead = fs.readSync;',
      'let swapped = false;',
      'fs.readSync = (...args) => {',
      '  const count = originalRead(...args);',
      "  const name = 'aieo-output/candidate-developer.json';",
      '  const opened = fs.fstatSync(args[0]);',
      '  const report = fs.lstatSync(name);',
      '  if (!swapped && opened.dev === report.dev && opened.ino === report.ino) {',
      '    swapped = true;',
      '    const bytes = fs.readFileSync(name);',
      "    fs.renameSync(name, name + '.parked');",
      '    fs.writeFileSync(name, bytes, { mode: 0o600 });',
      '  }',
      '  return count;',
      '};',
      'syncBuiltinESMExports();',
      ''
    ].join('\n'));
    const readerUrl = new URL('./aieo-role-artifact-io.mjs', import.meta.url).href;
    const code = 'import { readBoundedRoleReport } from ' +
      JSON.stringify(readerUrl) + ";\nreadBoundedRoleReport('developer');";
    const result = spawnSync(process.execPath,
      ['--import', shim, '--input-type=module', '--eval', code], {
        cwd: f.cwd, env: f.env, encoding: 'utf8', timeout: 25000
      });
    assert.equal(existsSync(reportPath + '.parked'), true,
      'test hook must demonstrably replace the original evidence path');
    assert.notEqual(result.status, 0, 'a post-read pathname swap must fail closed');
    assert.match(result.stderr, /AIEO role artifact rejected/,
      'the failure must come from the evidence boundary, not the test shim');
    assert.equal(readFileSync(reportPath, 'utf8'),
      readFileSync(reportPath + '.parked', 'utf8'),
      'rejected replacement deliberately has identical contents');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('report reader rejects same-inode metadata changes before open and after descriptor read', () => {
  // These regressions deliberately preserve the bytes, inode and file size.
  // A reader that checks only inode/size (or only fd timestamps after open)
  // previously trusted both changed handoffs.
  for (const boundary of ['before-open', 'after-read']) {
    const f = setup();
    try {
      assert.equal(f.run('developer').status, 0, 'fixture Developer must create evidence');
      const report = join(f.cwd, 'aieo-output/candidate-developer.json');
      const before = statSync(report);
      const bytes = readFileSync(report, 'utf8');
      const timestamp = boundary === 'before-open' ? 946684800000 : 978307200000;
      const shim = join(f.root, 'report-timestamp-' + boundary + '.mjs');
      const inject = boundary === 'before-open' ? [
        'const originalOpen = fs.openSync;',
        'fs.openSync = (path, ...args) => {',
        '  if (path === name) touch();',
        '  return originalOpen(path, ...args);',
        '};'
      ] : [
        'const originalLstat = fs.lstatSync;',
        'let seen = 0;',
        'fs.lstatSync = (path, ...args) => {',
        '  if (path === name && ++seen === 2) touch();',
        '  return originalLstat(path, ...args);',
        '};'
      ];
      writeFileSync(shim, [
        "import fs from 'node:fs';",
        "import { syncBuiltinESMExports } from 'node:module';",
        "const name = 'aieo-output/candidate-developer.json';",
        'const touch = () => fs.utimesSync(name, new Date(' + timestamp +
          '), new Date(' + timestamp + '));',
        ...inject,
        'syncBuiltinESMExports();',
        ''
      ].join('\n'));
      const readerUrl = new URL('./aieo-role-artifact-io.mjs', import.meta.url).href;
      const script = 'import { readBoundedRoleReport } from ' +
        JSON.stringify(readerUrl) + ";\nreadBoundedRoleReport('developer');";
      const result = spawnSync(process.execPath,
        ['--import', shim, '--input-type=module', '--eval', script], {
          cwd: f.cwd, env: f.env, encoding: 'utf8', timeout: 25000
        });
      const after = statSync(report);
      assert.equal(after.ino, before.ino, boundary + ': file inode unchanged');
      assert.equal(after.size, before.size, boundary + ': file size unchanged');
      assert.equal(readFileSync(report, 'utf8'), bytes, boundary + ': bytes unchanged');
      assert.equal(after.mtimeMs, timestamp, boundary + ': test must change metadata');
      assert.notEqual(result.status, 0, boundary + ': reject stale metadata');
      assert.match(result.stderr, /AIEO role artifact rejected/,
        boundary + ': failure must come from strict evidence reader');
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});


test('independent Developer rejects malformed candidate Git blob before emitting provenance evidence', () => {
  const f = setup();
  try {
    f.git('switch', '-q', branch);
    f.git('reset', '--hard', 'main');
    const bytes = Buffer.from(candidate.replace(
      '  const statusLabel = "Current status";',
      '  const statusLabel = "Current status"; // X'));
    const marker = bytes.indexOf(Buffer.from('// X'));
    assert.ok(marker >= 0);
    bytes[marker + 3] = 0xff;
    assert.notDeepEqual(Buffer.from(bytes.toString('utf8')), bytes,
      'decoded Git content differs from its original bytes');
    writeFileSync(join(f.cwd, path), bytes);
    f.git('add', path);
    f.git('commit', '-qm', 'fixture malformed candidate blob');
    f.git('push', '-q', '--force', 'origin', branch);
    f.pr.head.sha = f.git('rev-parse', 'HEAD');
    f.savePr();
    f.git('switch', '-q', 'main');
    assert.equal(f.git('rev-list', '--parents', '-n', '1', f.pr.head.sha),
      f.pr.head.sha + ' ' + f.base, 'one-commit candidate has valid ancestry');
    assert.equal(f.git('diff', '--name-only', f.base, f.pr.head.sha), path,
      'only the allowlisted source file changed');
    const result = f.run('developer');
    assert.notEqual(result.status, 0, 'malformed candidate bytes cannot be attested');
    assert.equal(existsSync(join(f.cwd, 'aieo-output/candidate-developer.json')), false);
    assert.equal(f.git('rev-parse', 'main'), f.base);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('independent Developer rejects malformed trusted baseline Git blob', () => {
  const f = setup();
  try {
    f.git('switch', '-q', 'main');
    const bytes = Buffer.from(original.replace(
      '  const statusLabel = "Old status";',
      '  const statusLabel = "Old status"; // X'));
    const marker = bytes.indexOf(Buffer.from('// X'));
    assert.ok(marker >= 0);
    bytes[marker + 3] = 0xff;
    writeFileSync(join(f.cwd, path), bytes);
    f.git('add', path);
    f.git('commit', '-qm', 'fixture malformed trusted baseline');
    const base = f.git('rev-parse', 'HEAD');
    f.git('push', '-q', '--force', 'origin', 'main');
    f.git('switch', '-q', branch);
    f.git('reset', '--hard', 'main');
    const updated = Buffer.from(bytes);
    const old = Buffer.from('Old status');
    const offset = updated.indexOf(old);
    assert.ok(offset >= 0);
    Buffer.from('New status').copy(updated, offset);
    writeFileSync(join(f.cwd, path), updated);
    f.git('add', path);
    f.git('commit', '-qm', 'fixture still contains invalid baseline bytes');
    f.git('push', '-q', '--force', 'origin', branch);
    const head = f.git('rev-parse', 'HEAD');
    f.pr.base.sha = base;
    f.pr.head.sha = head;
    f.savePr();
    f.git('switch', '-q', 'main');
    assert.equal(f.git('rev-list', '--parents', '-n', '1', head), head + ' ' + base);
    assert.equal(f.git('diff', '--name-only', base, head), path);
    const result = f.run('developer', { GITHUB_SHA: base });
    assert.notEqual(result.status, 0, 'malformed base bytes cannot be trusted');
    assert.equal(existsSync(join(f.cwd, 'aieo-output/candidate-developer.json')), false);
    assert.equal(f.git('rev-parse', 'main'), base);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('candidate and model role readers reject malformed UTF-8 evidence before parsing lossy JSON', () => {
  const f = setup();
  try {
    assert.equal(f.run('developer').status, 0);
    const reportPath = join(f.cwd, 'aieo-output/candidate-developer.json');
    const original = readFileSync(reportPath);
    const json = original.toString('utf8');
    assert.match(json, /\n}\n$/);
    const malformed = Buffer.from(json.replace(/\n}\n$/,
      ',\n  "untrusted": "MARKER"\n}\n'), 'utf8');
    const at = malformed.indexOf(Buffer.from('MARKER'));
    assert.ok(at >= 0);
    malformed[at] = 0xff;
    assert.equal(JSON.parse(malformed.toString('utf8')).untrusted.startsWith('\ufffd'), true,
      'the lossy text would otherwise parse as valid JSON');
    assert.notDeepEqual(Buffer.from(malformed.toString('utf8')), malformed,
      'original evidence bytes cannot round-trip through UTF-8');

    const reader = new URL('./aieo-role-artifact-io.mjs', import.meta.url).href;
    const check = (kind) => spawnSync(process.execPath, ['--input-type=module', '-e',
      'import { readBoundedRoleReport, readBoundedModelReport } from ' +
      JSON.stringify(reader) + '; ' +
      (kind === 'candidate' ? 'readBoundedRoleReport("developer");' :
        'readBoundedModelReport("qa");')], {
      cwd: f.cwd, env: f.env, encoding: 'utf8', timeout: 25000
    });
    writeFileSync(reportPath, malformed);
    assert.notEqual(check('candidate').status, 0,
      'candidate handoff must reject invalid UTF-8 bytes even if JSON.parse accepts the decoded string');

    const modelPath = join(f.cwd, 'aieo-output/model-qa.json');
    writeFileSync(modelPath, malformed, { mode: 0o600 });
    assert.notEqual(check('model').status, 0,
      'model handoff shares the same strict-byte provenance requirement');
    rmSync(modelPath);
    writeFileSync(reportPath, original, { mode: 0o600 });
    assert.equal(check('candidate').status, 0,
      'the restored byte-valid report remains independently readable');
    assert.equal(f.run('qa').status, 0, 'normal downstream QA can still consume restored evidence');
    assert.equal(f.git('rev-parse', 'main'), f.base, 'fixture trusted main stays unchanged');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('post-build finalizer rejects malformed replay bytes that decode to approved U+FFFD text', () => {
  const f = setup();
  try {
    // A valid Git proposal may contain the literal U+FFFD codepoint. A
    // malformed worktree with 0xff at that position decodes to the identical
    // JavaScript string, but it is NOT the byte-identical compiled source.
    const reviewed = candidate.replace('Current status', 'Current \ufffd status');
    assert.notEqual(reviewed, candidate);
    f.git('switch', '-q', branch);
    f.git('reset', '--hard', 'main');
    writeFileSync(join(f.cwd, path), reviewed);
    f.git('add', path);
    f.git('commit', '-qm', 'fixture valid UTF-8 replacement character');
    const reviewedHead = f.git('rev-parse', 'HEAD');
    f.git('push', '-q', '--force', 'origin', branch);
    f.pr.head.sha = reviewedHead;
    f.savePr();
    f.git('switch', '-q', 'main');

    for (const role of ['developer', 'qa', 'security', 'reviewer']) {
      const result = f.run(role);
      assert.equal(result.status, 0, role + ': ' + result.stderr);
    }

    const replayPath = join(f.cwd, path);
    const verify = () => spawnSync(process.execPath, [finalizerScript], {
      cwd: f.cwd, env: f.env, encoding: 'utf8', timeout: 25000
    });
    writeFileSync(replayPath, reviewed);
    assert.equal(verify().status, 0, 'valid reviewed UTF-8 source must pass');

    const bytes = Buffer.from(reviewed, 'utf8');
    const marker = Buffer.from('\ufffd', 'utf8');
    const at = bytes.indexOf(marker);
    assert.ok(at >= 0);
    const malformed = Buffer.concat([
      bytes.subarray(0, at), Buffer.from([0xff]), bytes.subarray(at + marker.length)
    ]);
    assert.equal(malformed.toString('utf8'), reviewed,
      'lossy text still matches the independently approved Git candidate');
    assert.equal(Buffer.from(malformed.toString('utf8')).equals(malformed), false);
    writeFileSync(replayPath, malformed);
    assert.equal(f.git('diff', '--name-only'), path,
      'normal Git scope check still sees the approved path');
    assert.notEqual(verify().status, 0,
      'post-build finalizer must reject malformed compiled source bytes');

    writeFileSync(replayPath, reviewed);
    assert.equal(verify().status, 0, 'restored byte-identical source passes');
    assert.equal(f.git('rev-parse', 'main'), f.base, 'trusted main remains untouched');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('post-build Git blobs preserve exact UTF-8 bytes, not lossy decoded strings', () => {
  const f = setup();
  try {
    const invoke = 'import { readStrictReviewedGitSource } from ' +
      JSON.stringify(new URL('./aieo-candidate-finalize.mjs', import.meta.url).href) +
      '; process.stdout.write(readStrictReviewedGitSource(process.argv[1]));';
    const inspect = (sha) => spawnSync(process.execPath,
      ['--input-type=module', '--eval', invoke, sha],
      { cwd: f.cwd, encoding: 'utf8', timeout: 25000 });

    assert.equal(inspect(f.base).status, 0, 'valid original Git bytes must be accepted');
    assert.equal(inspect(f.head).status, 0, 'valid proposed Git bytes must be accepted');
    assert.notEqual(inspect('HEAD:untrusted').status, 0,
      'revision/path injection must not be interpreted as a trusted commit');

    // A lossy Node git-show reader sees U+FFFD for an invalid source byte.
    // Another *valid* UTF-8 blob containing U+FFFD would decode identically.
    // Post-build attestation must distinguish their actual immutable bytes.
    const decoded = candidate.replace('Current status', 'Current \uFFFD status');
    assert.notEqual(decoded, candidate);
    const validBytes = Buffer.from(decoded, 'utf8');
    const replacement = Buffer.from('\uFFFD', 'utf8');
    const index = validBytes.indexOf(replacement);
    assert.ok(index >= 0, 'fixture contains one replacement character');
    const invalidBytes = Buffer.concat([
      validBytes.subarray(0, index), Buffer.from([0xff]),
      validBytes.subarray(index + replacement.length)
    ]);
    assert.equal(invalidBytes.toString('utf8'), decoded,
      'ordinary Node UTF-8 decoding loses the byte-level distinction');

    f.git('switch', '-q', branch);
    f.git('reset', '--hard', 'main');
    writeFileSync(join(f.cwd, path), invalidBytes);
    f.git('add', path);
    f.git('commit', '-qm', 'fixture invalid UTF-8 candidate');
    const invalidSha = f.git('rev-parse', 'HEAD');
    assert.equal(execFileSync('git', ['show', invalidSha + ':' + path],
      { cwd: f.cwd, encoding: 'utf8' }), decoded,
    'the old text reader would have accepted the silently replaced content');
    assert.notEqual(inspect(invalidSha).status, 0,
      'finalizer must reject Git blobs with malformed UTF-8');

    // Positive recovery control: identical decoded text stored as genuinely
    // valid UTF-8 is allowed when read from a distinct real Git commit.
    writeFileSync(join(f.cwd, path), validBytes);
    f.git('add', path);
    f.git('commit', '-qm', 'fixture valid UTF-8 candidate');
    const repairedSha = f.git('rev-parse', 'HEAD');
    assert.equal(inspect(repairedSha).status, 0,
      'valid UTF-8 bytes must still pass the strict post-build reader');
    assert.equal(inspect(repairedSha).stdout, decoded);
    assert.equal(f.git('rev-parse', 'main'), f.base, 'fixture main is untouched');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('independent roles and post-build verification suppress executable Git fsmonitor and textconv helpers', () => {
  const f = setup();
  const marker = join(f.root, 'git-helper-was-invoked');
  try {
    // Use a harmless synthetic executable and prove that the previous
    // --no-ext-diff flag ALONE executes textconv in a Git-to-Git comparison.
    const helper = join(f.root, 'synthetic-git-helper.sh');
    writeFileSync(helper, [
      '#!/bin/sh',
      'if [ "$#" -eq 1 ]; then',
      '  printf "textconv\\n" >> "$AIEO_HELPER_MARKER"',
      '  cat "$1"',
      'else',
      '  printf "fsmonitor\\n" >> "$AIEO_HELPER_MARKER"',
      '  printf "/\\n"',
      'fi',
      ''
    ].join('\n'));
    chmodSync(helper, 0o755);
    f.git('config', 'diff.synthetic.textconv', helper);
    f.git('config', 'core.fsmonitor', helper);
    writeFileSync(join(f.cwd, '.git/info/attributes'), path + ' diff=synthetic\n');

    const controlledEnv = { ...f.env, AIEO_HELPER_MARKER: marker };
    const oldDiff = spawnSync('git',
      ['diff', '--no-ext-diff', '--unified=0', f.base, f.head, '--', path],
      { cwd: f.cwd, env: controlledEnv, encoding: 'utf8', timeout: 20000 });
    assert.equal(oldDiff.status, 0, oldDiff.stderr);
    assert.match(readFileSync(marker, 'utf8'), /textconv/,
      'control: executable textconv still runs with --no-ext-diff alone');
    rmSync(marker);

    const oldStatus = spawnSync('git',
      ['status', '--porcelain=v1', '--untracked-files=no'],
      { cwd: f.cwd, env: controlledEnv, encoding: 'utf8', timeout: 20000 });
    assert.equal(oldStatus.status, 0, oldStatus.stderr);
    assert.match(readFileSync(marker, 'utf8'), /fsmonitor/,
      'control: local fsmonitor executable runs during ordinary Git status');
    rmSync(marker);

    for (const role of ['developer', 'qa', 'security', 'reviewer']) {
      const result = f.run(role, { AIEO_HELPER_MARKER: marker });
      assert.equal(result.status, 0, role + ': ' + result.stderr);
      assert.equal(existsSync(marker), false,
        role + ' must not execute local Git helper with its read-scoped token');
    }

    const reviewed = execFileSync('git', ['show', f.head + ':' + path],
      { cwd: f.cwd, encoding: 'utf8' });
    writeFileSync(join(f.cwd, path), reviewed);
    const final = spawnSync(process.execPath, [finalizerScript], {
      cwd: f.cwd, env: controlledEnv, encoding: 'utf8', timeout: 25000
    });
    assert.equal(final.status, 0, final.stderr);
    assert.equal(JSON.parse(final.stdout).status, 'post-build-draft-reverified');
    assert.equal(existsSync(marker), false,
      'post-build re-attestation must not execute either Git helper');
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('independent roles and post-build reject inherited Git execution and trace overrides before any subprocess', () => {
  const f = setup();
  const trace = join(f.root, 'untrusted-git-trace.json');
  try {
    // Positive control: Git normally writes a trace file from this inherited
    // environment setting, even for a read-only command.
    const control = spawnSync('git', ['status', '--porcelain=v1'], {
      cwd: f.cwd, env: { ...f.env, GIT_TRACE2_EVENT: trace },
      encoding: 'utf8', timeout: 20000
    });
    assert.equal(control.status, 0, control.stderr);
    assert.equal(existsSync(trace), true, 'control must prove Git trace side effect');
    rmSync(trace);

    const attacks = [
      { GIT_TRACE2_EVENT: trace },
      { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.fsmonitor',
        GIT_CONFIG_VALUE_0: 'synthetic-untrusted-helper' },
      { GIT_CONFIG_GLOBAL: join(f.root, 'foreign-git-config') },
      { GIT_WORK_TREE: f.root },
      { GIT_SSH_COMMAND: 'synthetic-untrusted-transport' },
      { GIT_CEILING_DIRECTORIES: f.root },
      { GIT_DISCOVERY_ACROSS_FILESYSTEM: '1' },
      { GIT_ALLOW_PROTOCOL: 'ext' },
      { GIT_SSL_CAINFO: join(f.root, 'untrusted-git-ca.pem') },
      { SSL_CERT_FILE: join(f.root, 'untrusted-trust.pem') },
      { HTTPS_PROXY: 'http://untrusted-proxy.invalid:8080' },
      { ALL_PROXY: 'socks5://untrusted-proxy.invalid:1080' },
      // GH_TOKEN is legitimate, but GH_HOST / GH_REPO / CLI config overrides
      // must not redirect independent verification to another repository.
      { GH_HOST: 'untrusted.example.invalid' },
      { GH_REPO: 'other/foreign-repository' },
      { GH_CONFIG_DIR: join(f.root, 'foreign-gh-config') },
      { GH_DEBUG: 'api' },
      { GH_PAGER: 'untrusted-helper' },
      { GH_ENTERPRISE_TOKEN: 'synthetic-placeholder-only' }
    ];
    for (const attack of attacks) {
      const rejected = f.run('developer', attack);
      assert.notEqual(rejected.status, 0,
        'Developer must refuse inherited Git environment: ' + Object.keys(attack)[0]);
      assert.equal(existsSync(join(f.cwd, 'aieo-output/candidate-developer.json')), false,
        'no Developer attestation may be produced under injected Git environment');
      assert.equal(existsSync(trace), false, 'no Git subprocess may write a trace');
    }

    // The ordinary independent execution is not disabled by these protections.
    for (const role of ['developer', 'qa', 'security', 'reviewer']) {
      const result = f.run(role);
      assert.equal(result.status, 0, role + ': ' + result.stderr);
    }
    const reviewed = execFileSync('git', ['show', f.head + ':' + path],
      { cwd: f.cwd, encoding: 'utf8' });
    writeFileSync(join(f.cwd, path), reviewed);
    const verify = (extra = {}) => spawnSync(process.execPath, [finalizerScript], {
      cwd: f.cwd, env: { ...f.env, ...extra }, encoding: 'utf8', timeout: 25000
    });
    assert.equal(verify().status, 0, 'trusted post-build baseline must succeed');
    for (const attack of attacks) {
      const rejected = verify(attack);
      assert.notEqual(rejected.status, 0,
        'post-build gate must reject inherited Git environment: ' + Object.keys(attack)[0]);
      assert.equal(existsSync(trace), false,
        'post-build gate cannot execute even a read-only traced Git subprocess');
    }
    assert.equal(verify().status, 0, 'clean execution recovers after rejected injections');
    assert.equal(f.git('rev-parse', 'main'), f.base, 'fixture main must remain unchanged');
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('read-only Developer, QA, Security, Reviewer and finalizer Git subprocesses receive no credentials', () => {
  const f = setup();
  try {
    // Instrument ONLY child Git processes: each CLI still receives synthetic
    // tokens for its mocked GitHub API call. A helper would see a token if
    // the subprocess environment were inherited unchanged.
    const systemGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
    const marker = join(f.root, 'git-credential-leak-marker');
    const interceptedGit = join(f.root, 'bin/git');
    writeFileSync(interceptedGit,
      '#!/usr/bin/env node\n' +
      'const {appendFileSync}=require("node:fs");\n' +
      'const {spawnSync}=require("node:child_process");\n' +
      'if(process.env.GH_TOKEN||process.env.GITHUB_TOKEN||process.env.OPENROUTER_API_KEY||' +
      'process.env.NPM_TOKEN||process.env.AWS_SECRET_ACCESS_KEY||process.env.DATABASE_URL||' +
      'process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SSH_AUTH_SOCK||' +
      'process.env.ORG_SESSION_DATA||process.env.CUSTOM_PAT||process.env.HTTPS_PROXY)' +
      'appendFileSync(' + JSON.stringify(marker) + ', "credential seen\\n");\n' +
      'const run=spawnSync(' + JSON.stringify(systemGit) +
        ',process.argv.slice(2),{stdio:"inherit"});\n' +
      'process.exit(run.status??1);\n');
    chmodSync(interceptedGit, 0o755);
    const env = { ...f.env, GITHUB_TOKEN: 'synthetic-fixture-not-a-secret',
      OPENROUTER_API_KEY: 'synthetic-provider-token',
      NPM_TOKEN: 'synthetic-npm-token',
      AWS_SECRET_ACCESS_KEY: 'synthetic-cloud-key',
      DATABASE_URL: 'postgres://synthetic:password@example.invalid/db',
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role-key',
      SSH_AUTH_SOCK: '/tmp/synthetic-agent.sock',
      ORG_SESSION_DATA: 'synthetic-new-secret-name',
      CUSTOM_PAT: 'synthetic-undocumented-pat' };
    for (const [role, status] of [
      ['developer', 'proposed'], ['qa', 'passed'],
      ['security', 'passed'], ['reviewer', 'draft-pr-eligible']
    ]) {
      const run = f.run(role, env);
      assert.equal(run.status, 0, role + ': ' + run.stderr);
      assert.equal(JSON.parse(run.stdout).status, status);
    }
    const reviewed = execFileSync(systemGit, ['show', f.head + ':' + path],
      { cwd: f.cwd, encoding: 'utf8' });
    writeFileSync(join(f.cwd, path), reviewed);
    const verified = spawnSync(process.execPath, [finalizerScript], {
      cwd: f.cwd, env, encoding: 'utf8', timeout: 25000
    });
    assert.equal(verified.status, 0, verified.stderr);
    assert.equal(JSON.parse(verified.stdout).status, 'post-build-draft-reverified');
    assert.equal(existsSync(marker), false,
      'none of the five independent steps may pass a token to Git');
    assert.equal(f.git('rev-parse', 'main'), f.base,
      'trusted main remains untouched');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('independent Developer rejects repository-configured executable Git transport before evidence', () => {
  const f = setup();
  try {
    const marker = join(f.root, 'untrusted-transport-executed');
    const helper = join(f.root, 'untrusted-remote.sh');
    writeFileSync(helper, '#!/bin/sh\n' +
      'touch ' + JSON.stringify(marker) + '\nexit 1\n');
    chmodSync(helper, 0o755);
    f.git('remote', 'set-url', 'origin', 'ext::' + helper);
    f.git('config', 'protocol.ext.allow', 'always');
    // Positive control: unguarded Git really executes the hostile transport.
    const unguarded = spawnSync('git', ['fetch', '--no-tags', 'origin', 'refs/heads/' + branch], {
      cwd: f.cwd, env: f.env, encoding: 'utf8', timeout: 10000
    });
    assert.notEqual(unguarded.status, 0, 'synthetic remote exits nonzero');
    assert.equal(existsSync(marker), true, 'positive control must actually execute remote helper');
    rmSync(marker);
    const rejected = f.run('developer');
    assert.notEqual(rejected.status, 0, 'independent role must reject executable transport');
    assert.equal(existsSync(marker), false, 'role may not invoke executable Git transport');
    assert.equal(existsSync(join(f.cwd, 'aieo-output/candidate-developer.json')), false,
      'no evidence may be produced from an unsafe remote');
    // Keep the read-only file transport used by our isolated local fixture.
    f.git('remote', 'set-url', 'origin', join(f.root, 'remote.git'));
    const safe = f.run('developer');
    assert.equal(safe.status, 0, safe.stderr);
    assert.equal(f.git('rev-parse', 'main'), f.base, 'main remains unchanged');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('independent role and post-build gate refuse executable clean filters before worktree diff', () => {
  const f = setup();
  try {
    const marker = join(f.root, 'clean-filter-was-executed');
    const helper = join(f.root, 'untrusted-clean-filter.sh');
    const attrs = join(f.cwd, '.git/info/attributes');
    const attrsText = path + ' filter=unsafe\n';
    writeFileSync(helper, '#!/bin/sh\n' +
      'touch ' + JSON.stringify(marker) + '\ncat\n');
    chmodSync(helper, 0o755);
    f.git('config', 'filter.unsafe.clean', helper);
    writeFileSync(attrs, attrsText);
    // Positive control: Git executes a clean filter on the modified source
    // EVEN when textconv and external diff helpers are disabled.
    writeFileSync(join(f.cwd, path), candidate);
    const unsafe = spawnSync('git', ['diff', '--no-ext-diff', '--no-textconv', '--name-only'], {
      cwd: f.cwd, env: f.env, encoding: 'utf8', timeout: 10000
    });
    assert.equal(unsafe.status, 0, unsafe.stderr);
    assert.equal(existsSync(marker), true, 'positive control must execute the clean filter');
    rmSync(marker);
    writeFileSync(join(f.cwd, path), original);
    const rejected = f.run('developer');
    assert.notEqual(rejected.status, 0, 'Developer must refuse active clean filters');
    assert.equal(existsSync(marker), false, 'Developer must never execute clean filter');
    assert.equal(existsSync(join(f.cwd, 'aieo-output/candidate-developer.json')), false,
      'a rejected role cannot create positive review evidence');

    // Restore a clean local fixture; all four roles must still succeed.
    rmSync(attrs);
    for (const role of ['developer', 'qa', 'security', 'reviewer']) {
      const result = f.run(role);
      assert.equal(result.status, 0, role + ': ' + result.stderr);
    }
    // Post-build examines the model candidate as a modified worktree file.
    writeFileSync(join(f.cwd, path), candidate);
    writeFileSync(attrs, attrsText);
    const verify = () => spawnSync(process.execPath, [finalizerScript], {
      cwd: f.cwd, env: f.env, encoding: 'utf8', timeout: 25000
    });
    const blockedFinal = verify();
    assert.notEqual(blockedFinal.status, 0, 'post-build must fail before worktree diff');
    assert.equal(existsSync(marker), false, 'post-build must not invoke executable clean filter');
    rmSync(attrs);
    const cleanFinal = verify();
    assert.equal(cleanFinal.status, 0, cleanFinal.stderr);
    assert.equal(f.git('rev-parse', 'main'), f.base, 'trusted main must remain unchanged');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('replacement refs cannot rewrite immutable blobs observed by independent roles and finalizer', () => {
  const f = setup();
  try {
    // A mutable local replacement ref reinterprets the already-pinned base
    // commit as the candidate, without changing either real commit SHA.
    f.git('replace', f.base, f.head);
    assert.equal(f.git('show', f.base + ':' + path), candidate.trimEnd(),
      'positive control: ordinary Git is fooled by a local replacement ref');
    assert.equal(execFileSync('git', ['--no-replace-objects', 'show', f.base + ':' + path],
      { cwd: f.cwd, encoding: 'utf8' }).trim(), original.trimEnd(),
      'the protected Git view must recover original immutable bytes');
    for (const [role, status] of [
      ['developer', 'proposed'], ['qa', 'passed'],
      ['security', 'passed'], ['reviewer', 'draft-pr-eligible']
    ]) {
      const result = f.run(role);
      assert.equal(result.status, 0, role + ': ' + result.stderr);
      assert.equal(JSON.parse(result.stdout).status, status);
    }
    writeFileSync(join(f.cwd, path), candidate);
    const final = spawnSync(process.execPath, [finalizerScript], {
      cwd: f.cwd, env: f.env, encoding: 'utf8', timeout: 25000
    });
    assert.equal(final.status, 0, final.stderr);
    assert.equal(JSON.parse(final.stdout).status, 'post-build-draft-reverified');
    assert.equal(f.git('rev-parse', 'main'), f.base, 'trusted main must not be changed');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('Actions candidate fetch refuses local, foreign and rewritten Git origins before fetch', () => {
  const official = 'https://github.com/jayalshehri/CGP-MVP';
  for (const url of [official, official + '.git']) {
    assert.equal(verifyOfficialCandidateFetchOrigin([url]), true,
      'official HTTPS repository is allowed');
  }
  for (const urls of [
    [], [official, official], ['http://github.com/jayalshehri/CGP-MVP'],
    ['https://github.com/jayalshehri/CGP-MVP/'],
    ['https://github.com/other/CGP-MVP'],
    ['file:///tmp/synthetic-candidate.git'],
    ['ext::synthetic-transport'],
    ['https://github.com/jayalshehri/CGP-MVP.git#foreign']
  ]) {
    assert.throws(() => verifyOfficialCandidateFetchOrigin(urls),
      /AIEO candidate role blocked/, 'unofficial/multiple fetch targets cannot be trusted');
  }

  const f = setup();
  try {
    // Offline fixture still runs all four independent roles against a local,
    // synthetic bare Git repo and never contacts GitHub.
    const offline = f.run('developer', { GITHUB_ACTIONS: 'false' });
    assert.equal(offline.status, 0, offline.stderr);
    rmSync(join(f.cwd, 'aieo-output'), { recursive: true, force: true });

    // In an Actions context, even a content-identical local mirror must not
    // be contacted as the trusted candidate fetch origin.
    const blocked = f.run('developer', { GITHUB_ACTIONS: 'true' });
    assert.notEqual(blocked.status, 0, 'local candidate remote is forbidden in Actions');
    assert.equal(existsSync(join(f.cwd, 'aieo-output/candidate-developer.json')), false,
      'no positive evidence on rejected remote');

    // Git rewrites a seemingly official origin with url.*.insteadOf. Assert
    // the resolved URL is checked, not merely the literal remote config.
    f.git('remote', 'set-url', 'origin', official + '.git');
    f.git('config', 'url.https://foreign.example.invalid/mirror/.insteadOf',
      'https://github.com/');
    const effective = f.git('remote', 'get-url', '--all', 'origin');
    assert.match(effective, /^https:\/\/foreign\.example\.invalid\//);
    assert.throws(() => verifyOfficialCandidateFetchOrigin([effective]),
      /AIEO candidate role blocked/);
    const rewriteBlocked = f.run('developer', { GITHUB_ACTIONS: 'true' });
    assert.notEqual(rewriteBlocked.status, 0, 'Actions role must reject expanded rewrite');
    assert.equal(existsSync(join(f.cwd, 'aieo-output/candidate-developer.json')), false);
    assert.equal(f.git('rev-parse', 'main'), f.base, 'no baseline mutation');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('candidate role handoff reader refuses group-readable reports before QA runs', () => {
  const f = setup();
  try {
    assert.equal(f.run('developer').status, 0);
    const developerFile = join(f.cwd, 'aieo-output/candidate-developer.json');
    for (const mode of [0o640, 0o604, 0o644]) {
      chmodSync(developerFile, mode);
      const result = f.run('qa');
      assert.notEqual(result.status, 0, 'independent QA must reject mode ' + mode.toString(8));
      assert.match(result.stderr, /AIEO role artifact rejected/);
      chmodSync(developerFile, 0o600);
    }
    assert.equal(f.run('qa').status, 0, 'private role evidence remains valid');
    assert.equal(f.git('rev-parse', 'main'), f.base, 'trusted main unchanged');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('post-build finalizer refuses foreign-owned and special-mode compiled source before GitHub review', () => {
  const f = setup();
  try {
    for (const role of ['developer', 'qa', 'security', 'reviewer']) {
      const result = f.run(role);
      assert.equal(result.status, 0, role + ': ' + result.stderr);
    }
    const target = join(f.cwd, path);
    const parent = dirname(target);
    const reviewed = execFileSync('git', ['show', f.head + ':' + path], {
      cwd: f.cwd, encoding: 'utf8'
    });
    writeFileSync(target, reviewed);
    const verify = (args = [], extra = {}) => spawnSync(process.execPath,
      [...args, finalizerScript], {
        cwd: f.cwd, env: { ...f.env, ...extra }, encoding: 'utf8', timeout: 25000
      });
    assert.equal(verify().status, 0, 'unchanged trusted post-build candidate is accepted');
    for (const [label, altered, mode, restored] of [
      ['owner-unreadable file', target, 0o200, 0o644],
      ['setuid file', target, 0o4644, 0o644],
      ['setgid file', target, 0o2644, 0o644],
      ['sticky file', target, 0o1644, 0o644],
      ['setuid parent', parent, 0o4755, 0o755],
      ['setgid parent', parent, 0o2755, 0o755],
      ['sticky parent', parent, 0o1755, 0o755]
    ]) {
      chmodSync(altered, mode);
      if (!label.includes('unreadable')) {
        assert.notEqual(statSync(altered).mode & 0o7000, 0,
          label + ' fixture must actually set the special bit');
      }
      const rejected = verify();
      assert.notEqual(rejected.status, 0, label + ' cannot be approved');
      assert.match(rejected.stderr, /post-build check blocked/,
        label + ' must be refused by the post-build gate');
      chmodSync(altered, restored);
      assert.equal(verify().status, 0,
        label + ' removal must restore a valid source fixture');
    }
    const shim = join(f.root, 'foreign-runner-uid.mjs');
    writeFileSync(shim, [
      'const originalUid = process.getuid();',
      'process.getuid = () => originalUid + 1;',
      ''
    ].join('\n'));
    const foreign = verify(['--import', shim]);
    assert.notEqual(foreign.status, 0, 'runner UID mismatch must be rejected');
    // The shared role-artifact guard can reject a foreign UID even earlier
    // than the finalizer's own source reader; exercise the latter directly.
    assert.match(foreign.stderr, /role artifact rejected|post-build check blocked/);
    const direct = [
      'import { readVerifiedBuildSource } from ' + JSON.stringify('file://' + finalizerScript) + ';',
      'const uid = process.getuid(); process.getuid = () => uid + 1;',
      'readVerifiedBuildSource(' + JSON.stringify(path) + ');'
    ].join('\n');
    const sourceProbe = spawnSync(process.execPath, ['--input-type=module', '-e', direct], {
      cwd: f.cwd, env: f.env, encoding: 'utf8', timeout: 25000
    });
    assert.notEqual(sourceProbe.status, 0,
      'post-build source reader must independently reject a foreign UID');
    assert.match(sourceProbe.stderr, /post-build check blocked/);
    assert.equal(verify().status, 0, 'clean current-user finalizer still succeeds');
    assert.equal(f.git('rev-parse', 'main'), f.base,
      'no change is made to the baseline branch');
    assert.equal(f.git('ls-remote', '--heads', 'origin', 'refs/heads/main'),
      f.base + '\trefs/heads/main', 'remote baseline remains immutable');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('independent Developer refuses special-mode evidence directories without writing a report', () => {
  const f = setup();
  try {
    const dir = join(f.cwd, 'aieo-output');
    const report = join(dir, 'candidate-developer.json');
    mkdirSync(dir, { mode: 0o700 });
    for (const [label, mode] of [
      ['setuid', 0o4700], ['setgid', 0o2700], ['sticky', 0o1700]
    ]) {
      chmodSync(dir, mode);
      assert.equal(statSync(dir).mode & 0o7000, mode & 0o7000,
        label + ' fixture must actually set the unsafe bit');
      const rejected = f.run('developer');
      assert.notEqual(rejected.status, 0, label + ' directory must be rejected');
      assert.match(rejected.stderr, /AIEO candidate role blocked/);
      assert.equal(existsSync(report), false,
        label + ' cannot produce trusted Developer evidence');
    }
    chmodSync(dir, 0o700);
    const accepted = f.run('developer');
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(JSON.parse(accepted.stdout).status, 'proposed');
    assert.equal(statSync(report).mode & 0o7777, 0o600);
    assert.equal(f.git('rev-parse', 'main'), f.base);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('independent Developer refuses evidence directory with a different runner UID', () => {
  const f = setup();
  try {
    const dir = join(f.cwd, 'aieo-output');
    const report = join(dir, 'candidate-developer.json');
    mkdirSync(dir, { mode: 0o700 });
    // Process-only simulation; do not chown real files or require root.
    const shim = join(f.root, 'foreign-runner-uid.mjs');
    writeFileSync(shim, [
      'const uid = process.getuid();',
      'process.getuid = () => uid + 1;',
      ''
    ].join('\n'));
    const blocked = spawnSync(process.execPath,
      ['--import', shim, roleScript, 'developer'],
      { cwd: f.cwd, env: f.env, encoding: 'utf8', timeout: 25000 });
    assert.notEqual(blocked.status, 0, 'foreign-owned evidence directory cannot be trusted');
    assert.match(blocked.stderr, /AIEO candidate role blocked/);
    assert.equal(existsSync(report), false, 'no report on ownership mismatch');
    const valid = f.run('developer');
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(JSON.parse(valid.stdout).status, 'proposed');
    assert.equal(f.git('rev-parse', 'main'), f.base);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('real candidate Developer process refuses nonprivate evidence directories before the first handoff', () => {
  const f = setup();
  try {
    const directory = join(f.cwd, 'aieo-output');
    const report = join(directory, 'candidate-developer.json');
    mkdirSync(directory, { mode: 0o700 });
    for (const mode of [0o755, 0o750, 0o711, 0o705, 0o770]) {
      chmodSync(directory, mode);
      const blocked = f.run('developer');
      assert.notEqual(blocked.status, 0, 'unsafe directory mode ' + mode.toString(8));
      assert.match(blocked.stderr, /AIEO candidate role blocked/);
      assert.equal(existsSync(report), false,
        'no evidence file may be created in a nonprivate directory');
    }

    chmodSync(directory, 0o700);
    const valid = f.run('developer');
    assert.equal(valid.status, 0, 'private 0700 directory must remain supported: ' + valid.stderr);
    assert.equal(JSON.parse(valid.stdout).status, 'proposed');
    const original = readFileSync(report, 'utf8');

    chmodSync(directory, 0o755);
    const replay = f.run('developer');
    assert.notEqual(replay.status, 0, 'idempotent retry must also refuse a widened directory');
    assert.match(replay.stderr, /AIEO candidate role blocked/);
    assert.equal(readFileSync(report, 'utf8'), original,
      'unsafe retry must never replace an existing Developer report');
    assert.equal(f.git('rev-parse', 'main'), f.base);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('all four real role CLIs and post-build check scope gh API children to GH_TOKEN only', () => {
  const f = setup();
  try {
    const gh = join(f.root, 'bin', 'gh');
    const stub = readFileSync(gh, 'utf8');
    const needle = 'const after=process.env.AIEO_FAKE_PR_SECOND;';
    assert.ok(stub.includes(needle), 'the isolated GitHub API stub must be active');
    const guard = [
      "if (process.env.GH_TOKEN !== 'fixture-never-live' ||",
      "    !process.env.AIEO_FAKE_PR_FILE ||",
      "    ['GITHUB_TOKEN', 'OPENROUTER_API_KEY', 'NPM_TOKEN',",
      "     'DATABASE_URL', 'ORG_SESSION_DATA', 'CUSTOM_PAT',",
      "     'AIEO_UNRELATED_SESSION'].some((name) =>",
      "       Object.hasOwn(process.env, name))) process.exit(93);"
    ].join('\n') + '\n';
    writeFileSync(gh, stub.replace(needle, guard + needle));

    const inherited = {
      ...f.env,
      GITHUB_TOKEN: 'synthetic-fixture-not-a-secret',
      OPENROUTER_API_KEY: 'synthetic-provider-credential',
      NPM_TOKEN: 'synthetic-package-credential',
      DATABASE_URL: 'postgres://synthetic:password@example.invalid/test',
      ORG_SESSION_DATA: 'synthetic-org-session',
      CUSTOM_PAT: 'synthetic-unknown-credential',
      AIEO_UNRELATED_SESSION: 'synthetic-private-value'
    };
    for (const [role, status] of [
      ['developer', 'proposed'],
      ['qa', 'passed'],
      ['security', 'passed'],
      ['reviewer', 'draft-pr-eligible']
    ]) {
      const result = f.run(role, inherited);
      assert.equal(result.status, 0,
        role + ' must preserve API readback without leaking other credentials: ' + result.stderr);
      assert.equal(JSON.parse(result.stdout).status, status);
    }
    // The finalizer is a distinct process and must obey the same gh API
    // environment restriction AFTER the candidate build.
    const reviewed = execFileSync('git', ['show', f.head + ':' + path],
      { cwd: f.cwd, encoding: 'utf8' });
    writeFileSync(join(f.cwd, path), reviewed);
    const final = spawnSync(process.execPath, [finalizerScript], {
      cwd: f.cwd, env: inherited, encoding: 'utf8', timeout: 25000
    });
    assert.equal(final.status, 0, 'post-build gh API must be scoped: ' + final.stderr);
    assert.equal(JSON.parse(final.stdout).status, 'post-build-draft-reverified');
    assert.equal(f.git('rev-parse', 'main'), f.base, 'fixture main is never changed');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('all independent role readbacks pin gh despite a swapped PATH symlink', () => {
  const f = setup();
  try {
    // The first gh API response is legitimate, but its subprocess changes
    // the PATH entry to a malicious executable before the role's second
    // readback. Each role must still invoke the original resolved binary.
    const gh = join(f.root, 'bin', 'gh');
    const trusted = join(f.root, 'bin', 'gh-trusted');
    const malicious = join(f.root, 'bin', 'gh-replacement');
    const marker = join(f.root, 'untrusted-gh-invoked');
    const originalGh = readFileSync(gh, 'utf8');
    const needle = 'const after=process.env.AIEO_FAKE_PR_SECOND;';
    assert.ok(originalGh.includes(needle));
    renameSync(gh, trusted);
    const switchAlias = [
      "const {unlinkSync,symlinkSync}=require('node:fs');",
      'unlinkSync(' + JSON.stringify(gh) + ');',
      'symlinkSync(' + JSON.stringify(malicious) + ',' + JSON.stringify(gh) + ');'
    ].join('\n') + '\n';
    writeFileSync(trusted, originalGh.replace(needle, switchAlias + needle));
    chmodSync(trusted, 0o755);
    writeFileSync(malicious, '#!/usr/bin/env node\n' +
      'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ', "called");\n' +
      'process.exit(97);\n');
    chmodSync(malicious, 0o755);
    const resetAlias = () => {
      if (existsSync(gh)) unlinkSync(gh);
      symlinkSync(trusted, gh);
    };

    for (const [role, status] of [
      ['developer', 'proposed'],
      ['qa', 'passed'],
      ['security', 'passed'],
      ['reviewer', 'draft-pr-eligible']
    ]) {
      resetAlias();
      const result = f.run(role);
      assert.equal(result.status, 0,
        role + ' must keep the pinned CLI through its second API read: ' + result.stderr);
      assert.equal(JSON.parse(result.stdout).status, status);
      assert.equal(existsSync(marker), false, role + ' may not execute replacement CLI');
    }
    // The post-build finalizer is another process with an independent pin.
    const reviewed = execFileSync('git', ['show', f.head + ':' + path],
      { cwd: f.cwd, encoding: 'utf8' });
    writeFileSync(join(f.cwd, path), reviewed);
    resetAlias();
    const final = spawnSync(process.execPath, [finalizerScript], {
      cwd: f.cwd, env: f.env, encoding: 'utf8', timeout: 25000
    });
    assert.equal(final.status, 0, 'finalizer must still validate: ' + final.stderr);
    assert.equal(JSON.parse(final.stdout).status, 'post-build-draft-reverified');
    assert.equal(existsSync(marker), false);
    assert.equal(f.git('rev-parse', 'main'), f.base);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('independent roles and post-build finalizer retain pinned Git after PATH alias swap', () => {
  const f = setup();
  try {
    const bin = join(f.root, 'bin');
    const alias = join(bin, 'git');
    const trusted = join(bin, 'git-trusted');
    const malicious = join(bin, 'git-replacement');
    const marker = join(f.root, 'untrusted-git-executed');
    // The first safe Git invocation deliberately swaps the PATH alias to an
    // adversarial executable. Later Git operations must use the original
    // resolved executable even when they inspect a valid local fixture.
    const systemGit = execFileSync('sh', ['-c', 'command -v git'], {
      encoding: 'utf8'
    }).trim();
    assert.ok(systemGit.startsWith('/'));
    writeFileSync(trusted, '#!/bin/sh\n' +
      'rm -f ' + JSON.stringify(alias) + '\n' +
      'ln -s ' + JSON.stringify(malicious) + ' ' + JSON.stringify(alias) + '\n' +
      'exec ' + JSON.stringify(systemGit) + ' "$@"\n', { mode: 0o755 });
    chmodSync(trusted, 0o755);
    writeFileSync(malicious, '#!/bin/sh\n' +
      'printf unexpected > ' + JSON.stringify(marker) + '\nexit 97\n',
      { mode: 0o755 });
    chmodSync(malicious, 0o755);
    const resetAlias = () => {
      if (existsSync(alias)) unlinkSync(alias);
      symlinkSync(trusted, alias);
    };
    for (const [role, status] of [
      ['developer', 'proposed'], ['qa', 'passed'],
      ['security', 'passed'], ['reviewer', 'draft-pr-eligible']
    ]) {
      resetAlias();
      const result = f.run(role);
      assert.equal(result.status, 0, role + ' must use pinned Git: ' + result.stderr);
      assert.equal(JSON.parse(result.stdout).status, status);
      assert.equal(existsSync(marker), false, role + ' invoked replaced Git executable');
    }
    writeFileSync(join(f.cwd, path), candidate);
    resetAlias();
    const final = spawnSync(process.execPath, [finalizerScript], {
      cwd: f.cwd, env: f.env, encoding: 'utf8', timeout: 25000
    });
    assert.equal(final.status, 0, 'post-build finalizer must use pinned Git: ' + final.stderr);
    assert.equal(JSON.parse(final.stdout).status, 'post-build-draft-reverified');
    assert.equal(existsSync(marker), false, 'post-build executed substituted Git');
    assert.equal(f.git('rev-parse', 'main'), f.base);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('late executable clean filters block role, pre-build replay and finalizer before Git status/diff', () => {
  const replayScript = join(dirname(fileURLToPath(import.meta.url)), 'aieo-candidate-replay.mjs');
  const realGit = pinReadOnlyGitExecutable(process.env);

  for (const stage of ['developer', 'replay', 'finalizer']) {
    const f = setup();
    try {
      if (stage !== 'developer') {
        for (const role of ['developer', 'qa', 'security', 'reviewer']) {
          const checked = f.run(role);
          assert.equal(checked.status, 0, role + ': ' + checked.stderr);
        }
      }
      if (stage === 'finalizer') {
        // This stage must see the approved candidate in the build workspace.
        writeFileSync(join(f.cwd, path), candidate);
      }
      const marker = join(f.root, 'unsafe-clean-filter-executed');
      const stamp = join(f.root, 'initial-check-attr-finished');
      const helper = join(f.root, 'unsafe-clean-filter.sh');
      const attributes = join(f.cwd, '.git/info/attributes');
      writeFileSync(helper, [
        '#!/bin/sh',
        'printf "executed\\n" >> ' + JSON.stringify(marker),
        'cat',
        ''
      ].join('\n'));
      chmodSync(helper, 0o755);
      f.git('config', 'filter.synthetic.clean', helper);

      // The first attestation sees no filter. Immediately AFTER Git returns
      // that trusted check-attr result, a separate executable changes the
      // effective attributes and touches the source, making status/diff run
      // the synthetic clean filter on an unguarded code path.
      const wrapper = join(f.root, 'bin/git');
      writeFileSync(wrapper, [
        '#!/bin/sh',
        JSON.stringify(realGit) + ' "$@"',
        'result=$?',
        'case " $* " in',
        '  *" check-attr "*)',
        '    if [ ! -e ' + JSON.stringify(stamp) + ' ]; then',
        '      printf "%s\\n" ' + JSON.stringify(path + ' filter=synthetic') +
          ' > ' + JSON.stringify(attributes),
        '      touch ' + JSON.stringify(join(f.cwd, path)),
        '      : > ' + JSON.stringify(stamp),
        '    fi',
        '    ;;',
        'esac',
        'exit "$result"',
        ''
      ].join('\n'));
      chmodSync(wrapper, 0o755);

      const result = stage === 'developer' ? f.run('developer') :
        spawnSync(process.execPath, [stage === 'replay' ? replayScript : finalizerScript], {
          cwd: f.cwd, encoding: 'utf8', timeout: 25000,
          env: stage === 'replay'
            ? { ...f.env, GH_TOKEN: '', GITHUB_TOKEN: '', OPENROUTER_API_KEY: '' }
            : f.env
        });
      assert.equal(existsSync(stamp), true, stage + ': late mutation was not exercised');
      assert.notEqual(result.status, 0, stage + ': late filter activation must block');
      assert.match(result.stderr,
        /candidate role blocked|pre-build replay blocked|post-build check blocked/);
      assert.equal(existsSync(marker), false,
        stage + ': untrusted filter must never execute during security verification');
      assert.equal(readFileSync(join(f.cwd, path), 'utf8'),
        stage === 'finalizer' ? candidate : original,
        stage + ': blocked verification must not alter reviewed source');

      // Positive executable-filter control: Git status may skip normalization
      // due to index stat-cache optimizations. An explicit renormalization of
      // this disposable fixture always executes the newly activated clean
      // helper; this action runs ONLY after the safeguarded process has failed.
      const control = spawnSync(realGit, ['add', '--renormalize', '--', path], {
        cwd: f.cwd, encoding: 'utf8', timeout: 20000
      });
      assert.equal(control.status, 0, control.stderr);
      assert.equal(existsSync(marker), true,
        stage + ': control must prove the late filter is executable');
      assert.equal(f.git('rev-parse', 'main'), f.base,
        stage + ': the disposable fixture default branch must remain unchanged');
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});
