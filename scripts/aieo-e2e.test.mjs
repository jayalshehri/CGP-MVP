import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
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
  const write = (role, data) => writeFileSync(artifact(role), JSON.stringify(data) + '\n');
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


test('second bounded repair crosses all four separate CLI processes and rejects forged task evidence', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'aieo-trim-e2e-'));
  const sourceFile = join(workspace, 'components', 'FeedbackWidget.tsx');
  const source = 'function example() {\n    const cleanMessage = message;\n}\n';
  const artifact = (role) => join(workspace, 'aieo-output', role + '.json');
  const read = (role) => JSON.parse(readFileSync(artifact(role), 'utf8'));
  const write = (role, data) => writeFileSync(artifact(role), JSON.stringify(data) + '\n');
  const run = (role) => spawnSync(process.execPath, [runner, role], {
    cwd: workspace, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, AIEO_TASK: 'feedback-trim-whitespace' }
  });
  try {
    mkdirSync(dirname(sourceFile), { recursive: true });
    writeFileSync(sourceFile, source);
    let child = run('developer');
    assert.equal(child.status, 0, 'developer: ' + child.stderr);
    const developer = read('developer');
    assert.equal(developer.status, 'proposed');
    assert.equal(developer.task, 'feedback-trim-whitespace');
    assert.notEqual(developer.candidateHash, developer.sourceHash);
    write('developer', { ...developer, task: 'feedback-control-route-boundary' });
    child = run('qa');
    assert.notEqual(child.status, 0, 'QA rejects a mismatched approved task');
    write('developer', developer);
    for (const role of ['qa', 'security']) {
      child = run(role);
      assert.equal(child.status, 0, role + ': ' + child.stderr);
      assert.equal(read(role).status, 'passed');
      assert.equal(read(role).task, 'feedback-trim-whitespace');
    }
    const qa = read('qa');
    write('qa', { ...qa, casesPassed: 0 });
    child = run('reviewer');
    assert.notEqual(child.status, 0, 'Reviewer rejects forged QA evidence');
    write('qa', qa);
    child = run('reviewer');
    assert.equal(child.status, 0, 'reviewer: ' + child.stderr);
    assert.equal(read('reviewer').status, 'draft-pr-eligible');
    assert.equal(read('reviewer').requiresHumanMerge, true);
    assert.equal(readFileSync(sourceFile, 'utf8'), source);
    for (const role of ['developer', 'qa', 'security', 'reviewer']) {
      assert.equal(readFileSync(artifact(role), 'utf8').includes(source), false);
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});


test('no-change path completes four independent processes with strictly validated artifacts', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'aieo-no-change-e2e-'));
  const sourceFile = join(workspace, 'components', 'FeedbackWidget.tsx');
  const correctedLine = '  const controlId = useMemo(() => /^\\/controls\\/(\\d+)(?:\\/|$)/.exec(pagePath)?.[1] ?? null, [pagePath]);';
  const correctedSource = 'function example() {\n' + correctedLine + '\n}\n';
  const artifactPath = (role) => join(workspace, 'aieo-output', role + '.json');
  const run = (role) => spawnSync(process.execPath, [runner, role], {
    cwd: workspace, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, AIEO_TASK: 'feedback-control-route-boundary' }
  });
  try {
    mkdirSync(dirname(sourceFile), { recursive: true });
    writeFileSync(sourceFile, correctedSource);
    assert.equal(run('developer').status, 0);
    const dev = JSON.parse(readFileSync(artifactPath('developer'), 'utf8'));
    assert.equal(dev.status, 'no-change');
    assert.equal(dev.bounded, true);
    assert.equal(dev.sourceHash, dev.candidateHash);
    writeFileSync(artifactPath('developer'), JSON.stringify({ ...dev, exposedSource: correctedSource }));
    assert.notEqual(run('qa').status, 0, 'QA must refuse unexpected source-bearing handoff keys');
    writeFileSync(artifactPath('developer'), JSON.stringify(dev));
    for (const role of ['qa', 'security', 'reviewer']) {
      const child = run(role);
      assert.equal(child.status, 0, role + ': ' + child.stderr);
    }
    const reviewed = JSON.parse(readFileSync(artifactPath('reviewer'), 'utf8'));
    assert.equal(reviewed.status, 'verified-no-change');
    assert.equal(reviewed.requiresHumanMerge, true);
    assert.equal(readFileSync(sourceFile, 'utf8'), correctedSource);
    for (const role of ['developer', 'qa', 'security', 'reviewer']) {
      assert.equal(readFileSync(artifactPath(role), 'utf8').includes(correctedLine), false);
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
