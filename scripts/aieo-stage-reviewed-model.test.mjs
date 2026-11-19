import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync,
  symlinkSync, linkSync, renameSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stageReviewedModelArtifact } from './aieo-stage-reviewed-model.mjs';

const reports = ['model-proposal.json', 'model-qa.json',
  'model-security.json', 'model-reviewer.json'];
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'aieo-stage-isolated-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, 'components'), { mode: 0o700 });
  writeFileSync(join(cwd, 'components', 'FeedbackWidget.tsx'), 'baseline source\n');
  mkdirSync(join(cwd, 'aieo-staging', 'components'), { recursive: true, mode: 0o700 });
  mkdirSync(join(cwd, 'aieo-staging', 'aieo-output'), { recursive: true, mode: 0o700 });
  writeFileSync(join(cwd, 'aieo-staging', 'components', 'FeedbackWidget.tsx'),
    'bounded untrusted model candidate\n');
  for (const name of reports) {
    writeFileSync(join(cwd, 'aieo-staging', 'aieo-output', name),
      JSON.stringify({ schemaVersion: 1, name }, null, 2) + '\n');
  }
  return cwd;
}
function assertUntouched(cwd) {
  assert.equal(readFileSync(join(cwd, 'components', 'FeedbackWidget.tsx'), 'utf8'),
    'baseline source\n');
  assert.equal(existsSync(join(cwd, 'aieo-output')), false);
}

test('only exact, canonical, bounded model evidence stages on clean separate runner', (t) => {
  const cwd = fixture(t);
  assert.deepEqual(stageReviewedModelArtifact({ cwd, env: {} }), {
    status: 'reviewed-artifact-staged', fileCount: 5
  });
  assert.equal(readFileSync(join(cwd, 'components', 'FeedbackWidget.tsx'), 'utf8'),
    'bounded untrusted model candidate\n');
  for (const name of reports) {
    const text = readFileSync(join(cwd, 'aieo-output', name), 'utf8');
    assert.deepEqual(JSON.parse(text), { schemaVersion: 1, name });
  }
  assert.equal(existsSync(join(cwd, 'aieo-staging')), false);
});

for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'OPENROUTER_API_KEY']) {
  test('refuses artifact staging when credential is present: ' + key, (t) => {
    const cwd = fixture(t);
    assert.throws(() => stageReviewedModelArtifact({
      cwd, env: { [key]: 'synthetic-do-not-use' }
    }), /stage blocked/);
    assertUntouched(cwd);
  });
}

test('extra payload files cannot be smuggled into the privileged checkout', (t) => {
  const cwd = fixture(t);
  writeFileSync(join(cwd, 'aieo-staging', 'aieo-output', 'unexpected.js'),
    'console.log("unapproved")');
  assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }), /stage blocked/);
  assertUntouched(cwd);
});

test('a symlinked candidate is refused before touching the trusted source', (t) => {
  const cwd = fixture(t);
  const candidate = join(cwd, 'aieo-staging', 'components', 'FeedbackWidget.tsx');
  rmSync(candidate);
  symlinkSync(join(cwd, 'components', 'FeedbackWidget.tsx'), candidate);
  assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }), /stage blocked/);
  assertUntouched(cwd);
});

test('duplicate-key or malformed UTF-8 handoffs are rejected before any write', (t) => {
  const cwd = fixture(t);
  writeFileSync(join(cwd, 'aieo-staging', 'aieo-output', reports[0]),
    '{"name":"approved","name":"shadowed"}\n');
  assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }), /stage blocked/);
  assertUntouched(cwd);
});

test('real process credential cannot be hidden by a synthetic staging context', (t) => {
  const cwd = fixture(t);
  const previous = process.env.GH_TOKEN;
  try {
    process.env.GH_TOKEN = 'synthetic-credential-do-not-use';
    assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }),
      /stage blocked/);
    assertUntouched(cwd);
  } finally {
    if (previous === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = previous;
  }
});

test('symlinked trusted component directory cannot redirect source write outside checkout', (t) => {
  const cwd = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), 'aieo-stage-external-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, 'FeedbackWidget.tsx'), 'baseline source\n');
  rmSync(join(cwd, 'components'), { recursive: true });
  symlinkSync(outside, join(cwd, 'components'), 'dir');
  assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }), /stage blocked/);
  assert.equal(readFileSync(join(outside, 'FeedbackWidget.tsx'), 'utf8'),
    'baseline source\n');
  assertUntouched(cwd);
  assert.equal(existsSync(join(cwd, 'aieo-staging')), true);
});

test('group-writable trusted component directory is refused before any write', (t) => {
  const cwd = fixture(t);
  chmodSync(join(cwd, 'components'), 0o770);
  assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }), /stage blocked/);
  assertUntouched(cwd);
});

test('dangling output symlink is rejected before candidate source is overwritten', (t) => {
  const cwd = fixture(t);
  symlinkSync(join(cwd, 'missing-output-target'), join(cwd, 'aieo-output'), 'dir');
  assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }), /stage blocked/);
  assertUntouched(cwd);
  assert.equal(existsSync(join(cwd, 'aieo-staging')), true);
});

test('trusted source symlink cannot redirect candidate write to another path', (t) => {
  const cwd = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), 'aieo-stage-outside-source-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, 'FeedbackWidget.tsx'), 'baseline source\n');
  rmSync(join(cwd, 'components', 'FeedbackWidget.tsx'));
  symlinkSync(join(outside, 'FeedbackWidget.tsx'),
    join(cwd, 'components', 'FeedbackWidget.tsx'));
  assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }), /stage blocked/);
  assert.equal(readFileSync(join(outside, 'FeedbackWidget.tsx'), 'utf8'),
    'baseline source\n');
  assertUntouched(cwd);
});

test('executable trusted source is rejected before artifact writes', (t) => {
  const cwd = fixture(t);
  chmodSync(join(cwd, 'components', 'FeedbackWidget.tsx'), 0o744);
  assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }), /stage blocked/);
  assertUntouched(cwd);
});

test('trusted source without owner write permission is rejected before staging', (t) => {
  const cwd = fixture(t);
  chmodSync(join(cwd, 'components', 'FeedbackWidget.tsx'), 0o444);
  assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }), /stage blocked/);
  assertUntouched(cwd);
});

test('hardlinked candidate payload is refused before touching trusted checkout', (t) => {
  const cwd = fixture(t);
  const candidate = join(cwd, 'aieo-staging', 'components', 'FeedbackWidget.tsx');
  const external = join(cwd, 'shared-candidate');
  linkSync(candidate, external);
  assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }), /stage blocked/);
  assertUntouched(cwd);
  assert.equal(readFileSync(external, 'utf8'), 'bounded untrusted model candidate\n');
});

test('symlinked model evidence cannot redirect the staged report read', (t) => {
  const cwd = fixture(t);
  const evidence = join(cwd, 'aieo-staging', 'aieo-output', reports[0]);
  const external = join(cwd, 'shared-report.json');
  writeFileSync(external, JSON.stringify({ schemaVersion: 1, name: reports[0] }, null, 2) + '\n');
  rmSync(evidence);
  symlinkSync(external, evidence);
  assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }), /stage blocked/);
  assertUntouched(cwd);
  assert.equal(existsSync(join(cwd, 'aieo-staging')), true);
});

test('replacement of candidate inode after lstat is rejected before reading substituted bytes', (t) => {
  const cwd = fixture(t);
  const candidate = join(cwd, 'aieo-staging', 'components', 'FeedbackWidget.tsx');
  const held = join(cwd, 'original-candidate');
  const replacement = join(cwd, 'replacement-candidate');
  writeFileSync(replacement, 'attacker-controlled payload\n');
  const oldLstat = fs.lstatSync;
  const oldRead = fs.readFileSync;
  let swapped = false;
  let filenameReads = 0;
  try {
    // Simulate a replacement precisely after the initial pathname attestation.
    // The old name-based read would consume the replacement before rejecting
    // the changed inode; descriptor attestation must reject without reading.
    fs.lstatSync = (path, ...args) => {
      const stat = oldLstat(path, ...args);
      if (!swapped && path === candidate) {
        swapped = true;
        renameSync(candidate, held);
        renameSync(replacement, candidate);
      }
      return stat;
    };
    fs.readFileSync = (path, ...args) => {
      if (path === candidate) filenameReads++;
      return oldRead(path, ...args);
    };
    syncBuiltinESMExports();
    assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }), /stage blocked/);
  } finally {
    fs.lstatSync = oldLstat;
    fs.readFileSync = oldRead;
    syncBuiltinESMExports();
  }
  assert.equal(swapped, true);
  assert.equal(filenameReads, 0);
  assertUntouched(cwd);
});

test('a candidate growing while read is bounded and rejected before source mutation', (t) => {
  const cwd = fixture(t);
  const candidate = join(cwd, 'aieo-staging', 'components', 'FeedbackWidget.tsx');
  const initialSize = Buffer.byteLength('bounded untrusted model candidate\n');
  const originalRead = fs.readSync;
  const originalWholeRead = fs.readFileSync;
  let grew = false;
  let largestRead = 0;
  let wholeDescriptorReads = 0;
  try {
    fs.readSync = (fd, buffer, offset, length, position) => {
      if (!grew) {
        grew = true;
        fs.appendFileSync(candidate, 'X'.repeat(1024 * 1024));
      }
      largestRead = Math.max(largestRead, length);
      return originalRead(fd, buffer, offset, length, position);
    };
    fs.readFileSync = (path, ...args) => {
      if (typeof path === 'number') wholeDescriptorReads++;
      return originalWholeRead(path, ...args);
    };
    syncBuiltinESMExports();
    assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }), /stage blocked/);
  } finally {
    fs.readSync = originalRead;
    fs.readFileSync = originalWholeRead;
    syncBuiltinESMExports();
  }
  assert.equal(grew, true);
  assert.equal(wholeDescriptorReads, 0);
  assert.ok(largestRead <= initialSize);
  assertUntouched(cwd);
});

test('a candidate truncated after attestation fails on short descriptor read', (t) => {
  const cwd = fixture(t);
  const candidate = join(cwd, 'aieo-staging', 'components', 'FeedbackWidget.tsx');
  const originalRead = fs.readSync;
  let truncated = false;
  try {
    fs.readSync = (fd, buffer, offset, length, position) => {
      if (!truncated) {
        truncated = true;
        fs.truncateSync(candidate, 0);
      }
      return originalRead(fd, buffer, offset, length, position);
    };
    syncBuiltinESMExports();
    assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }), /stage blocked/);
  } finally {
    fs.readSync = originalRead;
    syncBuiltinESMExports();
  }
  assert.equal(truncated, true);
  assertUntouched(cwd);
});
