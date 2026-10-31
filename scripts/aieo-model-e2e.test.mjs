import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync } from 'node:fs';
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
  const externalDiff = join(root, 'untrusted-diff.sh');
  const diffSentinel = join(root, 'external-diff-ran');
  const fsmonitor = join(root, 'untrusted-fsmonitor.sh');
  const fsmonitorSentinel = join(root, 'fsmonitor-ran');
  const guardedEnv = { ...process.env, GIT_EXTERNAL_DIFF: externalDiff, AIEO_TEST_DIFF_SENTINEL: diffSentinel };
  const artifact = (name) => join(output, 'model-' + name + '.json');
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' });
  const run = (name, role) => spawnSync(process.execPath,
    [join(scriptRoot, 'aieo-model-' + name + '.mjs'), ...(role ? [role] : [])],
    { cwd: root, timeout: 15000, encoding: 'utf8', env: guardedEnv });
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
    // Prove the fixture actually executes an inherited GIT_EXTERNAL_DIFF when
    // --no-ext-diff is omitted. Then require every independent role to avoid it.
    writeFileSync(externalDiff, '#!/bin/sh\nprintf invoked > "$AIEO_TEST_DIFF_SENTINEL"\nexit 93\n');
    chmodSync(externalDiff, 0o755);
    const unguarded = spawnSync('git', ['diff', '--unified=0', '--', 'components/FeedbackWidget.tsx'],
      { cwd: root, encoding: 'utf8', env: guardedEnv, timeout: 10000 });
    assert.notEqual(unguarded.status, 0, 'control must reject malicious external diff failure');
    assert.equal(existsSync(diffSentinel), true, 'control must prove unguarded Git executes the helper');
    rmSync(diffSentinel);
    // A hostile fsmonitor also runs on index reads, independently of any
    // external diff driver. Prove that an ordinary diff invokes it, then
    // require all three agent processes to avoid it without disabling checks.
    writeFileSync(fsmonitor, '#!/bin/sh\nprintf invoked >> ' + JSON.stringify(fsmonitorSentinel) + '\nexit 93\n');
    chmodSync(fsmonitor, 0o755);
    git('config', 'core.fsmonitor', fsmonitor);
    spawnSync('git', ['diff', '--no-ext-diff', '--no-textconv', '--name-only'],
      { cwd: root, encoding: 'utf8', env: guardedEnv, timeout: 10000 });
    assert.equal(existsSync(fsmonitorSentinel), true,
      'control must prove Git runs an inherited fsmonitor');
    rmSync(fsmonitorSentinel);
    writeFileSync(artifact('proposal'), JSON.stringify({
      schemaVersion: 1, status: 'proposed', path: 'components/FeedbackWidget.tsx',
      sourceHash: sha(original), proposedHash: sha(actual)
    }));
    for (const [name, role] of [['gates', 'qa'], ['security', null], ['gates', 'reviewer']]) {
      const child = run(name, role);
      assert.equal(child.status, 0, (role || name) + ': ' + child.stderr);
      assert.equal(existsSync(diffSentinel), false,
        (role || name) + ' must not execute untrusted Git diff driver');
      assert.equal(existsSync(fsmonitorSentinel), false,
        (role || name) + ' must not execute untrusted Git fsmonitor');
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
