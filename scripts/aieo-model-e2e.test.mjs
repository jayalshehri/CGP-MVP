import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync, renameSync, symlinkSync, linkSync } from 'node:fs';
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
  const externalDiff = join(output, 'untrusted-diff.sh');
  const diffSentinel = join(output, 'external-diff-ran');
  const fsmonitor = join(output, 'untrusted-fsmonitor.sh');
  const fsmonitorSentinel = join(output, 'fsmonitor-ran');
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
    writeFileSync(join(root, 'README.md'), 'Tracked fixture file\n');
    git('add', 'components/FeedbackWidget.tsx', 'README.md');
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
    writeFileSync(artifact('security'), JSON.stringify(security));
    // Regression: Git diff --name-only silently omits non-ignored untracked
    // source files and separately staged tracked changes. All three independent
    // review processes must reject both, not just the final publisher.
    const unexpected = join(root, 'components', 'Unexpected.tsx');
    writeFileSync(unexpected, 'export const unexpected = true;\n');
    for (const [name, role] of [['gates', 'qa'], ['security', null], ['gates', 'reviewer']]) {
      const child = run(name, role);
      assert.notEqual(child.status, 0, (role || name) + ' must reject an untracked source file');
      const verdict = JSON.parse(readFileSync(artifact(role || name), 'utf8'));
      assert.notEqual(verdict.status, role === 'reviewer' ? 'draft-pr-eligible' : 'passed');
      assert.ok(verdict.findings.some((finding) => /scope|file changes/i.test(finding)),
        (role || name) + ' must independently report out-of-scope change');
    }
    rmSync(unexpected);
    writeFileSync(join(root, 'README.md'), 'Changed but staged fixture\n');
    git('-c', 'core.fsmonitor=false', 'add', 'README.md');
    for (const [name, role] of [['gates', 'qa'], ['security', null], ['gates', 'reviewer']]) {
      const child = run(name, role);
      assert.notEqual(child.status, 0, (role || name) + ' must reject separately staged files');
      const verdict = JSON.parse(readFileSync(artifact(role || name), 'utf8'));
      assert.notEqual(verdict.status, role === 'reviewer' ? 'draft-pr-eligible' : 'passed');
      assert.ok(verdict.findings.some((finding) => /scope|file changes/i.test(finding)),
        (role || name) + ' must independently report out-of-scope change');
    }
    // Restore the baseline fixture: workspace integrity checks below must
    // identify unsafe paths, not fail due to the staged README test above.
    git('-c', 'core.fsmonitor=false', 'reset', '-q', 'HEAD', '--', 'README.md');
    writeFileSync(join(root, 'README.md'), 'Tracked fixture file\n');
    for (const [name, role] of [['gates', 'qa'], ['security', null], ['gates', 'reviewer']]) {
      const child = run(name, role);
      assert.equal(child.status, 0, (role || name) + ' must pass on clean local files: ' + child.stderr);
    }
    // A symlinked artifact directory can redirect reads/writes outside the
    // trusted checkout even if untracked aieo-output is excluded from scope.
    const redirected = mkdtempSync(join(tmpdir(), 'aieo-review-redirect-'));
    try {
      const actualOutput = join(redirected, 'real-output');
      renameSync(output, actualOutput);
      symlinkSync(actualOutput, output, 'dir');
      try {
        for (const [name, role] of [['gates', 'qa'], ['security', null], ['gates', 'reviewer']]) {
          const child = run(name, role);
          assert.notEqual(child.status, 0, (role || name) + ' must reject symlinked output directory');
          assert.match(child.stderr, /Unsafe model review workspace entry: aieo-output/);
        }
      } finally {
        rmSync(output);
        renameSync(actualOutput, output);
      }
      // Individually redirected verdicts are also dangerous. Check symlinks
      // and hardlinks separately and verify the external file is untouched.
      const externalReport = join(redirected, 'external-report.json');
      writeFileSync(externalReport, 'KEEP THIS FILE\n');
      const qaBefore = readFileSync(artifact('qa'), 'utf8');
      rmSync(artifact('qa'));
      symlinkSync(externalReport, artifact('qa'));
      try {
        for (const [name, role] of [['gates', 'qa'], ['security', null], ['gates', 'reviewer']]) {
          const child = run(name, role);
          assert.notEqual(child.status, 0, (role || name) + ' must reject redirected QA verdict');
          assert.match(child.stderr, /Unsafe model review workspace entry: aieo-output\/model-qa.json/);
        }
        assert.equal(readFileSync(externalReport, 'utf8'), 'KEEP THIS FILE\n');
      } finally {
        rmSync(artifact('qa'));
        writeFileSync(artifact('qa'), qaBefore);
      }
      const securityBefore = readFileSync(artifact('security'), 'utf8');
      rmSync(artifact('security'));
      linkSync(externalReport, artifact('security'));
      try {
        for (const [name, role] of [['gates', 'qa'], ['security', null], ['gates', 'reviewer']]) {
          const child = run(name, role);
          assert.notEqual(child.status, 0, (role || name) + ' must reject multiply linked Security verdict');
          assert.match(child.stderr, /Unsafe model review workspace entry: aieo-output\/model-security.json/);
        }
        assert.equal(readFileSync(externalReport, 'utf8'), 'KEEP THIS FILE\n');
      } finally {
        rmSync(artifact('security'));
        writeFileSync(artifact('security'), securityBefore);
      }
    } finally {
      rmSync(redirected, { recursive: true, force: true });
    }
    // No unsafe-path tests should weaken the passing ordinary review chain.
    for (const [name, role] of [['gates', 'qa'], ['security', null], ['gates', 'reviewer']]) {
      const child = run(name, role);
      assert.equal(child.status, 0, (role || name) + ' must pass after restoring genuine inputs: ' + child.stderr);
    }
    assert.equal(readFileSync(path, 'utf8'), actual);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
