import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, linkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = dirname(scriptRoot);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const route = String.raw`  const controlId = useMemo(() => /^\/controls\/(\d+)(?:\/|$)/.exec(pagePath)?.[1] ?? null, [pagePath]);`;

test('model proposal passes three distinct CLI processes; forged handoffs fail closed', () => {
  // This is a temporary Git fixture, not a provider call or a production change.
  const root = mkdtempSync(join(tmpdir(), 'aieo-model-e2e-'));
  const path = join(root, 'components', 'FeedbackWidget.tsx');
  const output = join(root, 'aieo-output');
  const artifact = (name) => join(output, 'model-' + name + '.json');
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' });
  const run = (name, role) => spawnSync(process.execPath,
    [join(scriptRoot, 'aieo-model-' + name + '.mjs'), ...(role ? [role] : [])],
    { cwd: root, timeout: 15000, encoding: 'utf8' });
  try {
    assert.ok(readFileSync(join(repositoryRoot, 'components', 'FeedbackWidget.tsx'), 'utf8').includes(route),
      'Fixture invariant must match actual CGP source');
    mkdirSync(dirname(path), { recursive: true });
    mkdirSync(output);
    const original = 'function fixture() {\n' + route + '\n  const sample = 1;\n}\n';
    const actual = original.replace('  const sample = 1;', '  const sample = 2;');
    git('init', '-q');
    writeFileSync(path, original);
    git('add', 'components/FeedbackWidget.tsx');
    git('-c', 'user.email=aieo@example.invalid', '-c', 'user.name=AIEO Test', 'commit', '-qm', 'fixture');
    writeFileSync(path, actual);
    writeFileSync(artifact('proposal'), JSON.stringify({
      schemaVersion: 1, status: 'proposed', path: 'components/FeedbackWidget.tsx',
      sourceHash: sha(original), proposedHash: sha(actual)
    }), { mode: 0o600 });
    for (const [name, role] of [['gates', 'qa'], ['security', null], ['gates', 'reviewer']]) {
      const child = run(name, role);
      assert.equal(child.status, 0, (role || name) + ': ' + child.stderr);
    }
    for (const role of ['qa', 'security', 'reviewer']) {
      assert.equal(statSync(artifact(role)).mode & 0o777, 0o600,
        'independent role evidence must not be exposed to other users');
    }
    const reviewer = JSON.parse(readFileSync(artifact('reviewer'), 'utf8'));
    assert.equal(reviewer.status, 'draft-pr-eligible');
    assert.equal(reviewer.requiresHumanMerge, true);
    const qa = JSON.parse(readFileSync(artifact('qa'), 'utf8'));
    writeFileSync(artifact('qa'), JSON.stringify({ ...qa, sourceHash: '0'.repeat(64) }));
    assert.notEqual(run('gates', 'reviewer').status, 0, 'Forged QA evidence must fail');
    writeFileSync(artifact('qa'), JSON.stringify(qa));
    const security = JSON.parse(readFileSync(artifact('security'), 'utf8'));
    writeFileSync(artifact('security'), JSON.stringify({ ...security, addedLines: 0 }));
    assert.notEqual(run('gates', 'reviewer').status, 0, 'Forged security evidence must fail');
    assert.equal(readFileSync(path, 'utf8'), actual);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('independent model-role CLI refuses output aliases and pre-existing reports without truncation', () => {
  const routeLine = String.raw`  const controlId = useMemo(() => /^\/controls\/(\d+)(?:\/|$)/.exec(pagePath)?.[1] ?? null, [pagePath]);`;
  for (const [role, alias] of [
    ['qa', 'symlink'], ['security', 'hardlink'], ['reviewer', 'existing-file']
  ]) {
    const root = mkdtempSync(join(tmpdir(), 'aieo-model-role-output-'));
    const target = join(root, 'components', 'FeedbackWidget.tsx');
    const evidence = join(root, 'aieo-output');
    const report = (name) => join(evidence, 'model-' + name + '.json');
    const external = join(root, 'external-sentinel.txt');
    const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' });
    const run = (name, param) => spawnSync(process.execPath,
      [join(scriptRoot, 'aieo-model-' + name + '.mjs'), ...(param ? [param] : [])],
      { cwd: root, timeout: 15000, encoding: 'utf8' });
    try {
      mkdirSync(dirname(target), { recursive: true });
      mkdirSync(evidence);
      const original = ['function fixture() {', routeLine, '  const sample = 1;', '}', ''].join('\n');
      const actual = original.replace('  const sample = 1;', '  const sample = 2;');
      git('init', '-q');
      writeFileSync(target, original);
      git('add', 'components/FeedbackWidget.tsx');
      git('-c', 'user.email=aieo@example.invalid', '-c', 'user.name=AIEO Test',
        'commit', '-qm', 'fixture');
      writeFileSync(target, actual);
      writeFileSync(report('proposal'), JSON.stringify({
        schemaVersion: 1, status: 'proposed', path: 'components/FeedbackWidget.tsx',
        sourceHash: sha(original), proposedHash: sha(actual)
      }), { mode: 0o600 });

      if (role === 'reviewer') {
        assert.equal(run('gates', 'qa').status, 0);
        assert.equal(run('security').status, 0);
      }
      const sentinel = 'PRESERVE EXTERNAL FILE CONTENT\n';
      writeFileSync(external, sentinel);
      if (alias === 'symlink') symlinkSync(external, report(role));
      else if (alias === 'hardlink') linkSync(external, report(role));
      else writeFileSync(report(role), sentinel);
      const attempted = role === 'security' ? run('security') : run('gates', role);
      assert.notEqual(attempted.status, 0, role + ' must reject ' + alias);
      assert.equal(readFileSync(report(role), 'utf8'), sentinel,
        role + ' must never truncate an existing report path');
      assert.equal(readFileSync(external, 'utf8'), sentinel,
        role + ' must not alter an external file');
      assert.equal(readFileSync(target, 'utf8'), actual,
        role + ' must not change candidate source');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
