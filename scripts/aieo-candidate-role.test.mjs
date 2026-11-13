// Credential-free, real Git/local-remote rehearsal of four separate role CLIs.
// The GitHub REST response comes from a fake gh executable; no real API/model calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const roleScript = join(dirname(fileURLToPath(import.meta.url)), 'aieo-candidate-role.mjs');
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
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  execFileSync('git', ['init', '--bare', '-q', remote], { cwd: root });
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('remote', 'add', 'origin', remote);
  writeFileSync(join(cwd, path), original);
  git('add', path);
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
    state: 'open', draft: true,
    user: { login: 'github-actions[bot]', id: 41898282, type: 'Bot' },
    base: { sha: base, ref: 'main', repo: { full_name: repo } },
    head: { sha: head, ref: branch, repo: { full_name: repo } }
  };
  const savePr = () => writeFileSync(prFile, JSON.stringify(pr));
  savePr();
  const gh = join(bin, 'gh');
  writeFileSync(gh, '#!/usr/bin/env node\n' +
    "const {readFileSync}=require('node:fs');\n" +
    "if(process.argv.slice(2).join(' ')!=='api repos/jayalshehri/CGP-MVP/pulls/777')process.exit(3);\n" +
    "process.stdout.write(readFileSync(process.env.AIEO_FAKE_PR_FILE,'utf8'));\n");
  chmodSync(gh, 0o755);
  const env = {
    ...process.env,
    PATH: bin + delimiter + process.env.PATH,
    GH_TOKEN: 'fixture-never-live',
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
  return { root, cwd, git, pr, savePr, run, base, head };
}

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
