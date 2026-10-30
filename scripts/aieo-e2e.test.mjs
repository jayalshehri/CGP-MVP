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
