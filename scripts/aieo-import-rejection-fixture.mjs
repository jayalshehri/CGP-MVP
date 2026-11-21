// Negative integration tests for REAL downloaded GitHub artifact file trees.
// Work only with disposable copies, never chmod or mutate the original reports.
// Passing the import gate is necessary but does NOT attest the JSON claims:
// the subsequent role CLIs independently recompute and verify those claims.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync, copyFileSync, existsSync, linkSync, lstatSync, mkdirSync,
  mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const roles = ['developer', 'qa', 'security'];
const cwd = process.cwd();
const inputDir = join(cwd, 'aieo-output');
const importer = join(dirname(fileURLToPath(import.meta.url)), 'aieo-import-handoffs.mjs');
const originals = Object.fromEntries(roles.map(role => [
  role, readFileSync(join(inputDir, role + '.json'))
]));
assert.deepEqual(readdirSync(inputDir).sort(), roles.map(r => r + '.json').sort(),
  'input must be an exact downloaded Developer/QA/Security bundle');
for (const role of roles) {
  const report = lstatSync(join(inputDir, role + '.json'));
  assert.equal(report.isFile() && !report.isSymbolicLink(), true);
  assert.ok(originals[role].length >= 2 && originals[role].length <= 65536);
}

function caseRun(label, mutate = () => {}, shouldPass = false) {
  const work = mkdtempSync(join(tmpdir(), 'aieo-gh-import-'));
  const output = join(work, 'aieo-output');
  try {
    mkdirSync(output, { mode: 0o700 });
    for (const role of roles) {
      const target = join(output, role + '.json');
      copyFileSync(join(inputDir, role + '.json'), target);
      // This models GitHub artifact extraction, which resets files to 0644.
      chmodSync(target, 0o644);
    }
    mutate({ work, output });
    const result = spawnSync(process.execPath,
      [importer, 'foundation', ...roles], {
        cwd: work,
        env: { PATH: process.env.PATH || '/usr/bin:/bin' },
        encoding: 'utf8', timeout: 10000
      });
    assert.equal(result.error, undefined, label + ': importer did not execute');
    if (shouldPass) {
      assert.equal(result.status, 0, label + ': valid downloaded bundle rejected: ' + result.stderr);
      assert.deepEqual(readdirSync(output).sort(), roles.map(r => r + '.json').sort());
      for (const role of roles) {
        const report = lstatSync(join(output, role + '.json'));
        assert.equal(report.mode & 0o7777, 0o600, label + ': imported file not private');
        assert.deepEqual(readFileSync(join(output, role + '.json')), originals[role],
          label + ': importer unexpectedly changed evidence bytes');
      }
    } else {
      assert.notEqual(result.status, 0, label + ': unsafe artifact import succeeded');
      assert.match(result.stderr, /AIEO imported handoff rejected: unsafe artifact/,
        label + ': expected explicit importer rejection');
    }
    console.log(label + ': ' + (shouldPass ? 'valid bundle normalized' : 'import blocked'));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

caseRun('unaltered GitHub-downloaded bundle', () => {}, true);
const cases = [
  ['extra unreviewed artifact file', ({ output }) =>
    writeFileSync(join(output, 'payload.txt'), 'not an approved role report')],
  ['extra nested directory', ({ output }) =>
    mkdirSync(join(output, 'unexpected'))],
  ['missing Security report', ({ output }) =>
    rmSync(join(output, 'security.json'))],
  ['symlink substituted for Security', ({ output }) => {
    rmSync(join(output, 'security.json'));
    symlinkSync('developer.json', join(output, 'security.json'));
  }],
  ['hardlinked Security report', ({ output, work }) =>
    linkSync(join(output, 'security.json'), join(work, 'outside-link'))],
  ['group-writable QA report', ({ output }) =>
    chmodSync(join(output, 'qa.json'), 0o664)],
  ['executable Developer report', ({ output }) =>
    chmodSync(join(output, 'developer.json'), 0o755)],
  ['owner-unreadable Developer report', ({ output }) =>
    chmodSync(join(output, 'developer.json'), 0o200)],
  ['oversized Developer report', ({ output }) =>
    writeFileSync(join(output, 'developer.json'), 'x'.repeat(65537), { mode: 0o644 })],
  ['group-writable evidence directory', ({ output }) =>
    chmodSync(output, 0o770)],
  ['group/other traversable evidence directory', ({ output }) =>
    chmodSync(output, 0o755)],
  ['group-readable evidence directory', ({ output }) =>
    chmodSync(output, 0o750)],
  ['nonstandard Unicode role filename', ({ output }) =>
    writeFileSync(join(output, 'securіty.json'), 'lookalike')]
];
for (const [label, mutate] of cases) caseRun(label, mutate);
for (const role of roles) {
  assert.equal(existsSync(join(inputDir, role + '.json')), true);
  assert.deepEqual(readFileSync(join(inputDir, role + '.json')), originals[role],
    'negative cases changed the real downloaded ' + role + ' evidence');
}
console.log('AIEO downloaded bundle import: 1 real clean pass + ' +
  cases.length + ' fail-closed file-tree attacks');
