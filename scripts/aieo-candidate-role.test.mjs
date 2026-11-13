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
