import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, symlinkSync, linkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Real child processes, separate artifact handoffs and a purposely vulnerable
// temporary source. No repository file is modified, and no provider is contacted.
const runner = join(dirname(fileURLToPath(import.meta.url)), 'aieo-role.mjs');
const originalLine = '  const controlId = useMemo(() => /^\\/controls\\/(\\d+)/.exec(pagePath)?.[1] ?? null, [pagePath]);';
const syntheticSource = 'function example() {\n' + originalLine + '\n}\n';

test('four independent CLI processes verify a proposed fix and reject tampered handoffs', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'aieo-e2e-'));
  const sourceFile = join(workspace, 'components', 'FeedbackWidget.tsx');
  const artifact = (role) => join(workspace, 'aieo-output', role + '.json');
  const read = (role) => JSON.parse(readFileSync(artifact(role), 'utf8'));
  const write = (role, data) => writeFileSync(artifact(role), JSON.stringify(data, null, 2) + '\n');
  const run = (role) => spawnSync(process.execPath, [runner, role], {
    cwd: workspace, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, AIEO_TASK: 'feedback-control-route-boundary' }
  });
  try {
    mkdirSync(dirname(sourceFile), { recursive: true });
    writeFileSync(sourceFile, syntheticSource);
    let child = run('developer');
    assert.equal(child.status, 0, 'developer: ' + child.stderr);
    const developer = read('developer');
    assert.equal(developer.status, 'proposed');
    assert.notEqual(developer.sourceHash, developer.candidateHash);
    assert.equal(developer.bounded, true);
    assert.equal(existsSync(artifact('reviewer')), false);

    write('developer', { ...developer, candidateHash: '0'.repeat(64) });
    child = run('qa');
    assert.notEqual(child.status, 0, 'QA must reject forged candidate hash');
    write('developer', developer);

    for (const role of ['qa', 'security']) {
      child = run(role);
      assert.equal(child.status, 0, role + ': ' + child.stderr);
      assert.equal(read(role).status, 'passed');
    }
    const security = read('security');
    write('security', { ...security, findings: ['fabricated success'] });
    child = run('reviewer');
    assert.notEqual(child.status, 0, 'reviewer must reject altered security findings');
    write('security', security);
    child = run('reviewer');
    assert.equal(child.status, 0, 'reviewer: ' + child.stderr);
    const reviewed = read('reviewer');
    assert.equal(reviewed.status, 'draft-pr-eligible');
    assert.equal(reviewed.requiresHumanMerge, true);
    assert.equal(reviewed.handoffValidated, true);
    assert.equal(readFileSync(sourceFile, 'utf8'), syntheticSource);
    for (const role of ['developer', 'qa', 'security', 'reviewer']) {
      assert.equal(readFileSync(artifact(role), 'utf8').includes(originalLine), false);
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});


test('downloaded foundation handoffs reject duplicate JSON keys and oversized files', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'aieo-bounded-foundation-'));
  const sourceFile = join(workspace, 'components', 'FeedbackWidget.tsx');
  const developerFile = join(workspace, 'aieo-output', 'developer.json');
  const run = (role) => spawnSync(process.execPath, [runner, role], {
    cwd: workspace, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, AIEO_TASK: 'feedback-control-route-boundary' }
  });
  try {
    mkdirSync(dirname(sourceFile), { recursive: true });
    writeFileSync(sourceFile, syntheticSource);
    assert.equal(run('developer').status, 0);
    const original = readFileSync(developerFile, 'utf8');
    const duplicate = original.replace(
      '  "status": "proposed",',
      '  "status": "hidden untrusted payload",\n  "status": "proposed",'
    );
    assert.notEqual(duplicate, original, 'test must insert a duplicate key');
    // The last value wins in JSON.parse, so semantic checks alone miss this.
    assert.equal(JSON.parse(duplicate).status, 'proposed');
    writeFileSync(developerFile, duplicate);
    assert.notEqual(run('qa').status, 0, 'duplicate-key evidence must fail closed');
    writeFileSync(developerFile, Buffer.alloc(65537, 0x20));
    assert.notEqual(run('qa').status, 0, 'oversized evidence must fail before parsing');
    writeFileSync(developerFile, original);
    assert.equal(run('qa').status, 0, 'canonical evidence remains accepted');
    assert.equal(readFileSync(sourceFile, 'utf8'), syntheticSource);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('foundation handoff writers never truncate existing files, symlinks or hardlinks', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'aieo-exclusive-foundation-'));
  const sourceFile = join(workspace, 'components', 'FeedbackWidget.tsx');
  const developerFile = join(workspace, 'aieo-output', 'developer.json');
  const run = (role) => spawnSync(process.execPath, [runner, role], {
    cwd: workspace, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, AIEO_TASK: 'feedback-control-route-boundary' }
  });
  try {
    mkdirSync(dirname(sourceFile), { recursive: true });
    mkdirSync(dirname(developerFile), { recursive: true, mode: 0o700 });
    writeFileSync(sourceFile, syntheticSource);
    writeFileSync(developerFile, 'preexisting report must not be overwritten');
    assert.notEqual(run('developer').status, 0, 'preexisting report must fail');
    assert.equal(readFileSync(developerFile, 'utf8'), 'preexisting report must not be overwritten');
    rmSync(developerFile);
    symlinkSync(sourceFile, developerFile);
    assert.notEqual(run('developer').status, 0, 'symlink target must be protected');
    assert.equal(readFileSync(sourceFile, 'utf8'), syntheticSource);
    rmSync(developerFile);
    linkSync(sourceFile, developerFile);
    assert.notEqual(run('developer').status, 0, 'hardlinked target must be protected');
    assert.equal(readFileSync(sourceFile, 'utf8'), syntheticSource);
    rmSync(developerFile);
    assert.equal(run('developer').status, 0, 'safe new report is accepted');
    assert.notEqual(run('developer').status, 0, 'second run cannot overwrite report');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('foundation roles refuse symlinked and hardlinked downloaded evidence', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'aieo-linked-foundation-'));
  const sourceFile = join(workspace, 'components', 'FeedbackWidget.tsx');
  const developerFile = join(workspace, 'aieo-output', 'developer.json');
  const run = (role) => spawnSync(process.execPath, [runner, role], {
    cwd: workspace, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, AIEO_TASK: 'feedback-control-route-boundary' }
  });
  try {
    mkdirSync(dirname(sourceFile), { recursive: true });
    writeFileSync(sourceFile, syntheticSource);
    assert.equal(run('developer').status, 0);
    rmSync(developerFile);
    symlinkSync(sourceFile, developerFile);
    assert.notEqual(run('qa').status, 0, 'downloaded symlink must not be followed');
    rmSync(developerFile);
    linkSync(sourceFile, developerFile);
    assert.notEqual(run('qa').status, 0, 'downloaded hardlink must be rejected');
    assert.equal(readFileSync(sourceFile, 'utf8'), syntheticSource);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('foundation handoffs refuse group- or other-readable evidence before trusting a hash', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'aieo-private-foundation-'));
  const sourceFile = join(workspace, 'components', 'FeedbackWidget.tsx');
  const developerFile = join(workspace, 'aieo-output', 'developer.json');
  const run = (role) => spawnSync(process.execPath, [runner, role], {
    cwd: workspace, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, AIEO_TASK: 'feedback-control-route-boundary' }
  });
  try {
    mkdirSync(dirname(sourceFile), { recursive: true });
    writeFileSync(sourceFile, syntheticSource);
    assert.equal(run('developer').status, 0);
    for (const mode of [0o640, 0o604, 0o644]) {
      chmodSync(developerFile, mode);
      const result = run('qa');
      assert.notEqual(result.status, 0, 'QA must refuse readable handoff mode ' + mode.toString(8));
      assert.match(result.stderr, /AIEO role artifact rejected/);
      chmodSync(developerFile, 0o600);
    }
    assert.equal(run('qa').status, 0, 'private canonical handoff is accepted');
    assert.equal(readFileSync(sourceFile, 'utf8'), syntheticSource);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('model report reader refuses other-readable evidence independently of valid JSON', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'aieo-private-model-'));
  const report = join(workspace, 'aieo-output', 'model-proposal.json');
  const reader = new URL('./aieo-role-artifact-io.mjs', import.meta.url).href;
  const code = 'import { readBoundedModelReport } from ' + JSON.stringify(reader) +
    "; readBoundedModelReport('proposal');";
  const run = () => spawnSync(process.execPath, ['--input-type=module', '--eval', code], {
    cwd: workspace, encoding: 'utf8', timeout: 15000
  });
  try {
    mkdirSync(dirname(report), { mode: 0o700 });
    writeFileSync(report, JSON.stringify({ schemaVersion: 1 }, null, 2) + '\n', { mode: 0o600 });
    assert.equal(run().status, 0);
    for (const mode of [0o640, 0o604, 0o644]) {
      chmodSync(report, mode);
      const result = run();
      assert.notEqual(result.status, 0, 'model report mode ' + mode.toString(8) + ' is not private');
      assert.match(result.stderr, /AIEO role artifact rejected/);
    }
    chmodSync(report, 0o600);
    assert.equal(run().status, 0);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
