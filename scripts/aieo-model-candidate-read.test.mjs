// Credential-free independent candidate-read regressions. Every candidate
// lives in a disposable workspace; no provider or GitHub API is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync,
  symlinkSync, linkSync, renameSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const script = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)),
  'aieo-model-candidate-read.mjs')).href;
const original = 'function syntheticCandidate() { return 3; }\n';
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'aieo-independent-candidate-'));
  const source = join(root, 'components', 'FeedbackWidget.tsx');
  mkdirSync(dirname(source));
  writeFileSync(source, original);
  return { root, source };
}
function run(f) {
  return spawnSync(process.execPath, ['--input-type=module', '-e',
    'import { readVerifiedModelCandidate } from ' + JSON.stringify(script) +
    '; process.stdout.write(readVerifiedModelCandidate())'], {
    cwd: f.root, encoding: 'utf8', timeout: 15000
  });
}

test('ordinary private bounded candidate is read identically by independent roles', () => {
  const f = fixture();
  try {
    const result = run(f);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, original);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

const rejectionCases = [
  ['oversized candidate', (f) => writeFileSync(f.source, 'x'.repeat(48001))],
  ['empty candidate', (f) => writeFileSync(f.source, '')],
  ['malformed UTF-8 candidate', (f) => writeFileSync(f.source, Buffer.from([0xff, 0xfe]))],
  ['world-writable candidate', (f) => chmodSync(f.source, 0o666)],
  ['group-writable parent directory', (f) => chmodSync(dirname(f.source), 0o777)],
  ['symlinked source inode', (f) => {
    const outside = join(f.root, 'external-source.tsx');
    writeFileSync(outside, original);
    unlinkSync(f.source);
    symlinkSync(outside, f.source);
  }],
  ['hardlinked source inode', (f) => {
    const outside = join(f.root, 'external-source.tsx');
    writeFileSync(outside, original);
    unlinkSync(f.source);
    linkSync(outside, f.source);
  }],
  ['symlinked parent directory', (f) => {
    const external = join(f.root, 'external-components');
    renameSync(dirname(f.source), external);
    symlinkSync(external, dirname(f.source));
  }]
];
for (const [name, mutate] of rejectionCases) {
  test('independent candidate reader rejects ' + name, () => {
    const f = fixture();
    try {
      mutate(f);
      const result = run(f);
      assert.notEqual(result.status, 0, 'untrusted candidate must not reach role review');
      assert.match(result.stderr, /AIEO independent model review blocked/);
      assert.doesNotMatch(result.stderr, /syntheticCandidate/,
        'the rejection must not print candidate source');
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
}

test('rejecting a hardlinked candidate never changes the external inode', () => {
  const f = fixture();
  try {
    const outside = join(f.root, 'external-sentinel.tsx');
    writeFileSync(outside, original);
    unlinkSync(f.source);
    linkSync(outside, f.source);
    assert.notEqual(run(f).status, 0);
    assert.equal(readFileSync(outside, 'utf8'), original);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
