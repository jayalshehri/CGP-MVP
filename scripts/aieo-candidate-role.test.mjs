// Credential-free, real Git/local-remote rehearsal of four separate role CLIs.
// The GitHub REST response comes from a fake gh executable; no real API/model calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, rmSync, symlinkSync, linkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  return { root, cwd, git, pr, savePr, run, base, head, env };
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
        writeFileSync(reportPath, prior);
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
    writeFileSync(developerPath, originalDeveloper);
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
    writeFileSync(qaPath, originalQa);
    assert.equal(f.run('reviewer').status, 0,
      'Reviewer can verify ordinary restored QA and Security evidence');
    assert.equal(f.git('rev-parse', 'main'), f.base);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('independent role output cannot overwrite external files through symlinks or hardlinks', () => {
  const f = setup();
  try {
    const directory = join(f.cwd, 'aieo-output');
    mkdirSync(directory);
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
    assert.equal(verify().status, 0, 'safe directory permissions restore final attestation');
    assert.equal(f.git('rev-parse', 'main'), f.base);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('Developer refuses a writable preexisting output before truncating its contents', () => {
  const f = setup();
  try {
    const dir = join(f.cwd, 'aieo-output');
    mkdirSync(dir);
    const output = join(dir, 'candidate-developer.json');
    const sentinel = 'PRESERVE UNTRUSTED FILE';
    writeFileSync(output, sentinel);
    chmodSync(output, 0o666);
    assert.notEqual(f.run('developer').status, 0, 'untrusted writable output must fail');
    assert.equal(readFileSync(output, 'utf8'), sentinel, 'reject before truncation');
    chmodSync(output, 0o600);
    assert.equal(f.run('developer').status, 0, 'secure output is allowed');
    assert.ok(readFileSync(output, 'utf8').includes('"role": "developer"'));
    assert.equal(f.git('rev-parse', 'main'), f.base);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('candidate role outputs refuse public pre-existing reports and preserve private evidence', () => {
  const f = setup();
  try {
    const dir = join(f.cwd, 'aieo-output');
    mkdirSync(dir);
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
    writeFileSync(reportPath, original);
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
    const env = { ...f.env, GITHUB_TOKEN: 'synthetic-actions-token',
      OPENROUTER_API_KEY: 'synthetic-provider-token',
      NPM_TOKEN: 'synthetic-npm-token',
      AWS_SECRET_ACCESS_KEY: 'synthetic-cloud-key',
      DATABASE_URL: 'postgres://synthetic:password@example.invalid/db',
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role-key',
      SSH_AUTH_SOCK: '/tmp/synthetic-agent.sock',
      ORG_SESSION_DATA: 'synthetic-new-secret-name',
      CUSTOM_PAT: 'synthetic-undocumented-pat',
      HTTPS_PROXY: 'https://synthetic-proxy.invalid' };
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
