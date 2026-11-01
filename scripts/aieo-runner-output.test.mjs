import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync,
  existsSync, symlinkSync, linkSync, statSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Regression fixtures are temporary; neither GitHub source nor provider is modified.
const runner = join(dirname(fileURLToPath(import.meta.url)), 'aieo-runner.mjs');
const vulnerableLine = '  const controlId = useMemo(() => /^\\/controls\\/(\\d+)/.exec(pagePath)?.[1] ?? null, [pagePath]);';
const syntheticSource = 'function synthetic() {\n' + vulnerableLine + '\n}\n';

function withFixture(verify) {
  const workspace = mkdtempSync(join(tmpdir(), 'aieo-runner-output-'));
  const sourceFile = join(workspace, 'components', 'FeedbackWidget.tsx');
  const folder = join(workspace, 'aieo-output');
  const reportFile = join(folder, 'multi-agent-report.json');
  const external = join(workspace, 'outside-sentinel.txt');
  const run = (env = {}) => spawnSync(process.execPath, [runner], {
    cwd: workspace, encoding: 'utf8', timeout: 15000,
    env: {
      ...process.env,
      AIEO_TASK: 'feedback-control-route-boundary',
      AIEO_APPLY: '0',
      AIEO_TRUSTED_WORKFLOW: '0',
      ...env
    }
  });
  try {
    mkdirSync(dirname(sourceFile), { recursive: true });
    writeFileSync(sourceFile, syntheticSource);
    writeFileSync(external, 'SYNTHETIC_OUTSIDE_SENTINEL');
    verify({ run, workspace, folder, reportFile, external, sourceFile });
    assert.equal(readFileSync(sourceFile, 'utf8'), syntheticSource,
      'Untrusted read-only report invocation must never change the source');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test('orchestrator writes only one exclusive, source-redacted report', () => {
  withFixture(({ run, reportFile }) => {
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    const reportBytes = readFileSync(reportFile, 'utf8');
    const parsed = JSON.parse(reportBytes);
    assert.equal(parsed.developer.status, 'proposed');
    assert.equal(parsed.reviewer.status, 'draft-pr-eligible');
    assert.equal(reportBytes.includes(vulnerableLine), false, 'Source escaped into retained report');
    assert.equal(statSync(reportFile).mode & 0o777, 0o600, 'Report must have restrictive permissions');
    const second = run();
    assert.notEqual(second.status, 0, 'Pre-existing report was overwritten');
    assert.match(second.stderr, /report already exists or destination is unsafe/);
    assert.equal(readFileSync(reportFile, 'utf8'), reportBytes, 'Existing report changed');
  });
});

test('orchestrator refuses symlinked output directory and cannot write outside workspace', () => {
  withFixture(({ run, workspace, folder, external }) => {
    symlinkSync(workspace, folder, 'dir');
    const result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unsafe AIEO orchestrator output directory/);
    assert.equal(existsSync(join(workspace, 'multi-agent-report.json')), false);
    assert.equal(readFileSync(external, 'utf8'), 'SYNTHETIC_OUTSIDE_SENTINEL');
  });
});

test('orchestrator refuses symlink and hardlink report destinations, leaving target unmodified', () => {
  for (const kind of ['symlink', 'hardlink']) {
    withFixture(({ run, folder, reportFile, external }) => {
      mkdirSync(folder);
      if (kind === 'symlink') symlinkSync(external, reportFile);
      else linkSync(external, reportFile);
      const result = run();
      assert.notEqual(result.status, 0, kind + ' report redirection was accepted');
      assert.match(result.stderr, /report already exists or destination is unsafe/);
      assert.equal(readFileSync(external, 'utf8'), 'SYNTHETIC_OUTSIDE_SENTINEL');
    });
  }
});

test('orchestrator refuses unauthorized apply even when reporting safely', () => {
  withFixture(({ run, reportFile }) => {
    const result = run({
      AIEO_APPLY: '1',
      AIEO_TRUSTED_WORKFLOW: '1',
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_REF: 'refs/heads/main'
    });
    assert.notEqual(result.status, 0, 'PR-triggered apply bypassed manual workflow boundary');
    assert.match(result.stderr, /Applying requires trusted manual main-branch workflow/);
    assert.equal(JSON.parse(readFileSync(reportFile, 'utf8')).mergePerformed, false);
  });
});
