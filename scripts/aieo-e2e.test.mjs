import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, symlinkSync, linkSync, renameSync } from 'node:fs';
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

test('four independent CLI runs reject cross-run and retry artifact replay', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'aieo-replay-e2e-'));
  const sourceFile = join(workspace, 'components', 'FeedbackWidget.tsx');
  const artifact = (role) => join(workspace, 'aieo-output', role + '.json');
  const trustedRun = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'jayalshehri/CGP-MVP',
    GITHUB_RUN_ID: '900123',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_SHA: 'a'.repeat(40)
  };
  const run = (role, change = {}) => spawnSync(process.execPath, [runner, role], {
    cwd: workspace, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, AIEO_TASK: 'feedback-control-route-boundary', ...trustedRun, ...change }
  });
  try {
    mkdirSync(dirname(sourceFile), { recursive: true });
    writeFileSync(sourceFile, syntheticSource);
    let child = run('developer');
    assert.equal(child.status, 0, 'developer: ' + child.stderr);
    const dev = JSON.parse(readFileSync(artifact('developer'), 'utf8'));
    assert.match(dev.runBinding, /^github:[a-f0-9]{64}$/);

    child = run('qa', { GITHUB_RUN_ID: '900124' });
    assert.notEqual(child.status, 0, 'QA must not accept an old run artifact');
    assert.equal(existsSync(artifact('qa')), false);

    child = run('qa', { GITHUB_RUN_ATTEMPT: '2' });
    assert.notEqual(child.status, 0, 'QA must not accept an old retry artifact');
    assert.equal(existsSync(artifact('qa')), false);

    child = run('qa');
    assert.equal(child.status, 0, 'QA: ' + child.stderr);
    child = run('security', { GITHUB_SHA: 'b'.repeat(40) });
    assert.notEqual(child.status, 0, 'Security must not accept an artifact for another checkout');
    assert.equal(existsSync(artifact('security')), false);

    child = run('security');
    assert.equal(child.status, 0, 'Security: ' + child.stderr);
    child = run('reviewer', { GITHUB_RUN_ATTEMPT: '2' });
    assert.notEqual(child.status, 0, 'Reviewer must reject a different attempt');
    assert.equal(existsSync(artifact('reviewer')), false);

    child = run('reviewer');
    assert.equal(child.status, 0, 'Reviewer: ' + child.stderr);
    const reviewer = JSON.parse(readFileSync(artifact('reviewer'), 'utf8'));
    assert.equal(reviewer.runBinding, dev.runBinding);
    assert.equal(reviewer.status, 'draft-pr-eligible');
    assert.equal(readFileSync(sourceFile, 'utf8'), syntheticSource);
    for (const role of ['developer', 'qa', 'security', 'reviewer']) {
      assert.equal(readFileSync(artifact(role), 'utf8').includes(originalLine), false);
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('independent agents refuse symlink, hardlink, oversized and malformed downloaded handoffs', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'aieo-untrusted-files-'));
  const sourceFile = join(workspace, 'components', 'FeedbackWidget.tsx');
  const folder = join(workspace, 'aieo-output');
  const artifact = (role) => join(folder, role + '.json');
  const outside = join(workspace, 'external.json');
  const run = (role) => spawnSync(process.execPath, [runner, role], {
    cwd: workspace, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, AIEO_TASK: 'feedback-control-route-boundary' }
  });
  const rejectQa = (label) => {
    const result = run('qa');
    assert.notEqual(result.status, 0, label + ': QA accepted an unsafe artifact');
    assert.equal(existsSync(artifact('qa')), false, label + ': QA wrote an artifact after failure');
    return result;
  };
  try {
    mkdirSync(dirname(sourceFile), { recursive: true });
    writeFileSync(sourceFile, syntheticSource);
    const developer = run('developer');
    assert.equal(developer.status, 0, developer.stderr);
    const safeDeveloper = readFileSync(artifact('developer'), 'utf8');
    writeFileSync(outside, safeDeveloper);

    rmSync(artifact('developer'));
    symlinkSync(outside, artifact('developer'));
    rejectQa('external file symlink');
    rmSync(artifact('developer'));

    linkSync(outside, artifact('developer'));
    rejectQa('external file hardlink');
    rmSync(artifact('developer'));

    // JSON accepts trailing whitespace, so this handoff would otherwise verify.
    writeFileSync(artifact('developer'), safeDeveloper + ' '.repeat(20 * 1024));
    rejectQa('unbounded JSON whitespace');

    const marker = 'SYNTHETIC_PRIVATE_TEST_MARKER';
    writeFileSync(artifact('developer'), '{"secret":"' + marker + '",');
    const malformed = rejectQa('invalid JSON');
    assert.equal(malformed.stderr.includes(marker), false, 'Parser leaked raw artifact contents');

    writeFileSync(artifact('developer'), safeDeveloper);
    const moved = folder + '.real';
    renameSync(folder, moved);
    symlinkSync(moved, folder);
    rejectQa('download folder symlink');
    rmSync(folder);
    renameSync(moved, folder);

    for (const role of ['qa', 'security']) {
      const result = run(role);
      assert.equal(result.status, 0, role + ': ' + result.stderr);
    }
    const safeSecurity = readFileSync(artifact('security'), 'utf8');
    rmSync(artifact('security'));
    symlinkSync(outside, artifact('security'));
    const refused = run('reviewer');
    assert.notEqual(refused.status, 0, 'Reviewer accepted unsafe security artifact');
    assert.equal(existsSync(artifact('reviewer')), false);
    rmSync(artifact('security'));
    writeFileSync(artifact('security'), safeSecurity);
    const reviewer = run('reviewer');
    assert.equal(reviewer.status, 0, reviewer.stderr);
    assert.equal(JSON.parse(readFileSync(artifact('reviewer'), 'utf8')).requiresHumanMerge, true);
    assert.equal(readFileSync(sourceFile, 'utf8'), syntheticSource);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('each independent role refuses redirected or pre-existing verdict output paths', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'aieo-verdict-output-'));
  const sourceFile = join(workspace, 'components', 'FeedbackWidget.tsx');
  const folder = join(workspace, 'aieo-output');
  const artifact = (role) => join(folder, role + '.json');
  const outside = join(workspace, 'external-sentinel.txt');
  const run = (role) => spawnSync(process.execPath, [runner, role], {
    cwd: workspace, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, AIEO_TASK: 'feedback-control-route-boundary' }
  });
  const assertRefused = (role, reason) => {
    const result = run(role);
    assert.notEqual(result.status, 0, reason + ': role unexpectedly wrote to an unsafe destination');
    assert.equal(readFileSync(outside, 'utf8'), 'SYNTHETIC_OUTSIDE_SENTINEL',
      reason + ': external content was overwritten');
  };
  try {
    mkdirSync(dirname(sourceFile), { recursive: true });
    writeFileSync(sourceFile, syntheticSource);
    writeFileSync(outside, 'SYNTHETIC_OUTSIDE_SENTINEL');

    // Developer must not follow an output-directory link, even if no prior
    // evidence is read and the directory already exists on disk.
    symlinkSync(workspace, folder);
    assertRefused('developer', 'symlinked verdict directory');
    assert.equal(existsSync(join(workspace, 'developer.json')), false);
    rmSync(folder);

    mkdirSync(folder);
    symlinkSync(outside, artifact('developer'));
    assertRefused('developer', 'symlinked developer verdict');
    rmSync(artifact('developer'));

    linkSync(outside, artifact('developer'));
    assertRefused('developer', 'hardlinked developer verdict');
    rmSync(artifact('developer'));

    assert.equal(run('developer').status, 0, 'normal developer must pass');
    const dev = JSON.parse(readFileSync(artifact('developer'), 'utf8'));
    delete dev.bounded;
    writeFileSync(artifact('developer'), JSON.stringify(dev) + '\n');
    const missing = run('qa');
    assert.notEqual(missing.status, 0, 'QA must not accept developer evidence lacking bounded=true');
    assert.equal(existsSync(artifact('qa')), false);
    assert.equal(run('developer').status !== 0, true,
      'Developer must never overwrite a previously emitted verdict');
    // Reset the missing field only in the fixture before testing output writes.
    dev.bounded = true;
    writeFileSync(artifact('developer'), JSON.stringify(dev) + '\n');

    for (const role of ['qa', 'security', 'reviewer']) {
      symlinkSync(outside, artifact(role));
      assertRefused(role, 'symlinked ' + role + ' verdict');
      rmSync(artifact(role));
      const ok = run(role);
      assert.equal(ok.status, 0, role + ': ' + ok.stderr);
      assert.equal(existsSync(artifact(role)), true);
    }
    assert.equal(JSON.parse(readFileSync(artifact('reviewer'), 'utf8')).requiresHumanMerge, true);
    assert.equal(readFileSync(sourceFile, 'utf8'), syntheticSource);
    assert.equal(readFileSync(outside, 'utf8'), 'SYNTHETIC_OUTSIDE_SENTINEL');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
