import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync,
  symlinkSync, linkSync, renameSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';
import { inspectModelQa, inspectModelReviewer } from '../aieo/lib/model-gates.mjs';
import { inspectModelDiff } from './aieo-model-security.mjs';
import { stageReviewedModelArtifact } from './aieo-stage-reviewed-model.mjs';

const reports = ['model-proposal.json', 'model-qa.json',
  'model-security.json', 'model-reviewer.json'];
const route = String.raw`  const controlId = useMemo(() => /^\/controls\/(\d+)(?:\/|$)/.exec(pagePath)?.[1] ?? null, [pagePath]);`;
const trustedBaseline = 'function fixture() {\n' + route + '\n  const sample = 1;\n}\n';
const approvedCandidate = trustedBaseline.replace('  const sample = 1;', '  const sample = 2;');
const changedDiff = '@@ -3 +3 @@\n-  const sample = 1;\n+  const sample = 2;\n';
const hash = (value) => createHash('sha256').update(value).digest('hex');
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'aieo-stage-isolated-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, 'components'), { mode: 0o700 });
  writeFileSync(join(cwd, 'components', 'FeedbackWidget.tsx'), trustedBaseline);
  mkdirSync(join(cwd, 'aieo-staging', 'components'), { recursive: true, mode: 0o700 });
  mkdirSync(join(cwd, 'aieo-staging', 'aieo-output'), { recursive: true, mode: 0o700 });
  writeFileSync(join(cwd, 'aieo-staging', 'components', 'FeedbackWidget.tsx'),
    approvedCandidate);
  const proposal = {
    schemaVersion: 1, status: 'proposed', path: MODEL_ALLOWED_PATH,
    sourceHash: hash(trustedBaseline), proposedHash: hash(approvedCandidate),
    sourceShared: true
  };
  const input = {
    original: trustedBaseline, actual: approvedCandidate,
    changedPaths: [MODEL_ALLOWED_PATH], diff: changedDiff, proposal
  };
  const qa = inspectModelQa({ ...input, report: proposal });
  const security = inspectModelDiff({ ...input, report: proposal });
  const reviewer = inspectModelReviewer({ ...input, qa, security });
  assert.equal(reviewer.status, 'draft-pr-eligible');
  for (const [index, name] of reports.entries()) {
    writeFileSync(join(cwd, 'aieo-staging', 'aieo-output', name),
      JSON.stringify([proposal, qa, security, reviewer][index], null, 2) + '\n');
  }
  return cwd;
}
function assertUntouched(cwd) {
  assert.equal(readFileSync(join(cwd, 'components', 'FeedbackWidget.tsx'), 'utf8'),
    trustedBaseline);
  assert.equal(existsSync(join(cwd, 'aieo-output')), false);
}

test('only exact, canonical, bounded model evidence stages on clean separate runner', (t) => {
  const cwd = fixture(t);
  const captured = reports.map((name) =>
    readFileSync(join(cwd, 'aieo-staging', 'aieo-output', name), 'utf8'));
  assert.deepEqual(stageReviewedModelArtifact({ cwd, env: {} }), {
    status: 'reviewed-artifact-staged', fileCount: 5
  });
  assert.equal(readFileSync(join(cwd, 'components', 'FeedbackWidget.tsx'), 'utf8'),
    approvedCandidate);
  assert.equal(fs.statSync(join(cwd, 'components', 'FeedbackWidget.tsx')).mode & 0o777,
    0o644, 'atomic replacement must preserve trusted source permissions');
  assert.deepEqual(fs.readdirSync(join(cwd, 'components')),
    ['FeedbackWidget.tsx'], 'no temporary source files remain');
  for (const [index, name] of reports.entries()) {
    const text = readFileSync(join(cwd, 'aieo-output', name), 'utf8');
    assert.equal(text, captured[index]);
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
  writeFileSync(join(outside, 'FeedbackWidget.tsx'), trustedBaseline);
  rmSync(join(cwd, 'components'), { recursive: true });
  symlinkSync(outside, join(cwd, 'components'), 'dir');
  assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }), /stage blocked/);
  assert.equal(readFileSync(join(outside, 'FeedbackWidget.tsx'), 'utf8'),
    trustedBaseline);
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
  writeFileSync(join(outside, 'FeedbackWidget.tsx'), trustedBaseline);
  rmSync(join(cwd, 'components', 'FeedbackWidget.tsx'));
  symlinkSync(join(outside, 'FeedbackWidget.tsx'),
    join(cwd, 'components', 'FeedbackWidget.tsx'));
  assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }), /stage blocked/);
  assert.equal(readFileSync(join(outside, 'FeedbackWidget.tsx'), 'utf8'),
    trustedBaseline);
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
  assert.equal(readFileSync(external, 'utf8'), approvedCandidate);
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
  const initialSize = Buffer.byteLength(approvedCandidate);
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

test('well-formed but unauthorized model code is rejected before trusted write', (t) => {
  const cwd = fixture(t);
  writeFileSync(join(cwd, 'aieo-staging', 'components', 'FeedbackWidget.tsx'),
    approvedCandidate.replace('sample = 2', 'sample = 3'));
  assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }), /stage blocked/);
  assertUntouched(cwd);
});

for (const [index, field, value] of [
  [0, 'sourceHash', '0'.repeat(64)],
  [1, 'routeCasesPassed', 0],
  [2, 'addedLines', 0],
  [3, 'requiresHumanMerge', false]
]) {
  test('tampered role evidence is rejected before writing: ' + field, (t) => {
    const cwd = fixture(t);
    const path = join(cwd, 'aieo-staging', 'aieo-output', reports[index]);
    const original = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, JSON.stringify({ ...original, [field]: value }, null, 2) + '\n');
    assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }), /stage blocked/);
    assertUntouched(cwd);
  });
}

test('a second source line change is rejected before writing', (t) => {
  const cwd = fixture(t);
  const candidate = join(cwd, 'aieo-staging', 'components', 'FeedbackWidget.tsx');
  writeFileSync(candidate, approvedCandidate.replace('function fixture()', 'function changed()'));
  assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }), /stage blocked/);
  assertUntouched(cwd);
});

test('partial report-copy failure leaves trusted source unchanged and removes output', (t) => {
  const cwd = fixture(t);
  const failedPath = join(cwd, 'aieo-output', 'model-security.json');
  const originalWrite = fs.writeFileSync;
  let simulated = false;
  try {
    fs.writeFileSync = (path, ...args) => {
      if (path === failedPath) {
        simulated = true;
        throw new Error('synthetic report-copy failure');
      }
      return originalWrite(path, ...args);
    };
    syncBuiltinESMExports();
    assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }),
      /synthetic report-copy failure/);
  } finally {
    fs.writeFileSync = originalWrite;
    syncBuiltinESMExports();
  }
  assert.equal(simulated, true);
  assertUntouched(cwd);
  assert.equal(existsSync(join(cwd, 'aieo-staging')), true);
});

test('unexpected report injected during handoff blocks before source mutation', (t) => {
  const cwd = fixture(t);
  const lastReport = join(cwd, 'aieo-output', 'model-reviewer.json');
  const originalWrite = fs.writeFileSync;
  let injected = false;
  try {
    fs.writeFileSync = (path, ...args) => {
      const value = originalWrite(path, ...args);
      if (path === lastReport && !injected) {
        injected = true;
        originalWrite(join(cwd, 'aieo-output', 'rogue.json'), '{}\\n');
      }
      return value;
    };
    syncBuiltinESMExports();
    assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }),
      /stage blocked/);
  } finally {
    fs.writeFileSync = originalWrite;
    syncBuiltinESMExports();
  }
  assert.equal(injected, true);
  assertUntouched(cwd);
  assert.equal(existsSync(join(cwd, 'aieo-staging')), true);
});

test('failed atomic rename after complete reports leaves original source intact', (t) => {
  const cwd = fixture(t);
  const source = join(cwd, 'components', 'FeedbackWidget.tsx');
  const originalRename = fs.renameSync;
  let blockedCommit = false;
  try {
    fs.renameSync = (from, to) => {
      if (to === source && from.includes('.aieo-source-')) {
        blockedCommit = true;
        throw new Error('synthetic atomic rename failure');
      }
      return originalRename(from, to);
    };
    syncBuiltinESMExports();
    assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }),
      /synthetic atomic rename failure/);
  } finally {
    fs.renameSync = originalRename;
    syncBuiltinESMExports();
  }
  assert.equal(blockedCommit, true);
  assertUntouched(cwd);
  assert.deepEqual(fs.readdirSync(join(cwd, 'components')), ['FeedbackWidget.tsx']);
  assert.equal(existsSync(join(cwd, 'aieo-staging')), false,
    'the artifact is deleted before attempting the atomic source commit');
});

test('partial temporary source write cannot truncate the trusted source', (t) => {
  const cwd = fixture(t);
  const originalWrite = fs.writeFileSync;
  let interrupted = false;
  try {
    fs.writeFileSync = (pathOrFd, value, ...args) => {
      if (!interrupted && typeof pathOrFd === 'number' &&
          Buffer.isBuffer(value) && value.equals(Buffer.from(approvedCandidate))) {
        interrupted = true;
        originalWrite(pathOrFd, value.subarray(0, 12));
        throw new Error('synthetic partial temporary source write');
      }
      return originalWrite(pathOrFd, value, ...args);
    };
    syncBuiltinESMExports();
    assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }),
      /synthetic partial temporary source write/);
  } finally {
    fs.writeFileSync = originalWrite;
    syncBuiltinESMExports();
  }
  assert.equal(interrupted, true);
  assertUntouched(cwd);
  assert.deepEqual(fs.readdirSync(join(cwd, 'components')), ['FeedbackWidget.tsx']);
});

test('failed source fsync leaves original source and review handoff untouched', (t) => {
  const cwd = fixture(t);
  const originalFsync = fs.fsyncSync;
  let interrupted = false;
  try {
    fs.fsyncSync = () => {
      interrupted = true;
      throw new Error('synthetic source fsync failure');
    };
    syncBuiltinESMExports();
    assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }),
      /synthetic source fsync failure/);
  } finally {
    fs.fsyncSync = originalFsync;
    syncBuiltinESMExports();
  }
  assert.equal(interrupted, true);
  assertUntouched(cwd);
  assert.deepEqual(fs.readdirSync(join(cwd, 'components')), ['FeedbackWidget.tsx']);
});

test('failed staging cleanup cannot leave a modified trusted source', (t) => {
  const cwd = fixture(t);
  const staging = join(cwd, 'aieo-staging');
  const originalRemove = fs.rmSync;
  let interrupted = false;
  try {
    fs.rmSync = (path, options) => {
      if (path === staging) {
        interrupted = true;
        throw new Error('synthetic staging cleanup failure');
      }
      return originalRemove(path, options);
    };
    syncBuiltinESMExports();
    assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }),
      /synthetic staging cleanup failure/);
  } finally {
    fs.rmSync = originalRemove;
    syncBuiltinESMExports();
  }
  assert.equal(interrupted, true);
  assertUntouched(cwd);
  assert.equal(existsSync(staging), true);
  assert.deepEqual(fs.readdirSync(join(cwd, 'components')),
    ['FeedbackWidget.tsx']);
});

test('substituted staging tree is refused rather than recursively removed', (t) => {
  const cwd = fixture(t);
  const staging = join(cwd, 'aieo-staging');
  const held = join(cwd, 'original-staging');
  const outside = mkdtempSync(join(tmpdir(), 'aieo-stage-cleanup-victim-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, 'sentinel.txt'), 'must survive');
  const finalReport = join(cwd, 'aieo-output', 'model-reviewer.json');
  const originalWrite = fs.writeFileSync;
  let swapped = false;
  try {
    fs.writeFileSync = (path, ...args) => {
      const result = originalWrite(path, ...args);
      if (path === finalReport && !swapped) {
        swapped = true;
        renameSync(staging, held);
        symlinkSync(outside, staging, 'dir');
      }
      return result;
    };
    syncBuiltinESMExports();
    assert.throws(() => stageReviewedModelArtifact({ cwd, env: {} }),
      /stage blocked/);
  } finally {
    fs.writeFileSync = originalWrite;
    syncBuiltinESMExports();
  }
  assert.equal(swapped, true);
  assertUntouched(cwd);
  assert.equal(readFileSync(join(outside, 'sentinel.txt'), 'utf8'),
    'must survive');
  assert.equal(existsSync(held), true);
});
