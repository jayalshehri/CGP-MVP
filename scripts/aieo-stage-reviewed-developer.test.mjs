import test from 'node:test';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync,
  symlinkSync, linkSync, renameSync, chmodSync, rmSync, existsSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stageReviewedDeveloperArtifact } from './aieo-stage-reviewed-developer.mjs';

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'aieo-developer-artifact-'));
  t.after(() => rmSync(cwd, { force: true, recursive: true }));
  mkdirSync(join(cwd, 'components'), { mode: 0o700 });
  writeFileSync(join(cwd, 'components', 'FeedbackWidget.tsx'), 'trusted baseline\n');
  mkdirSync(join(cwd, 'aieo-staging', 'components'),
    { recursive: true, mode: 0o700 });
  writeFileSync(join(cwd, 'aieo-staging', 'components', 'FeedbackWidget.tsx'),
    'verified developer candidate\n');
  return cwd;
}
function assertUntouched(cwd) {
  assert.equal(readFileSync(join(cwd, 'components', 'FeedbackWidget.tsx'), 'utf8'),
    'trusted baseline\n');
  assert.equal(existsSync(join(cwd, 'aieo-staging')), true);
}
test('one bounded developer artifact stages without executing source', (t) => {
  const cwd = fixture(t);
  assert.deepEqual(stageReviewedDeveloperArtifact({ cwd, env: {} }),
    { status: 'developer-artifact-staged', files: 1 });
  assert.equal(readFileSync(join(cwd, 'components', 'FeedbackWidget.tsx'), 'utf8'),
    'verified developer candidate\n');
  assert.equal(existsSync(join(cwd, 'aieo-staging')), false);
});
for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'OPENROUTER_API_KEY']) {
  test('rejects supplied credential before staging: ' + key, (t) => {
    const cwd = fixture(t);
    assert.throws(() => stageReviewedDeveloperArtifact({
      cwd, env: { [key]: 'synthetic-not-live' }
    }), /stage blocked/);
    assertUntouched(cwd);
  });
}
test('live process credentials cannot be hidden by a supplied environment', (t) => {
  const cwd = fixture(t);
  const prior = process.env.GH_TOKEN;
  try {
    process.env.GH_TOKEN = 'synthetic-do-not-use';
    assert.throws(() => stageReviewedDeveloperArtifact({ cwd, env: {} }),
      /stage blocked/);
    assertUntouched(cwd);
  } finally {
    if (prior === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = prior;
  }
});
test('unexpected extra artifact cannot be imported', (t) => {
  const cwd = fixture(t);
  writeFileSync(join(cwd, 'aieo-staging', 'unexpected.sh'), 'exit 0\n');
  assert.throws(() => stageReviewedDeveloperArtifact({ cwd, env: {} }),
    /stage blocked/);
  assertUntouched(cwd);
});
test('symlinked artifact cannot replace trusted source', (t) => {
  const cwd = fixture(t);
  const candidate = join(cwd, 'aieo-staging', 'components', 'FeedbackWidget.tsx');
  rmSync(candidate);
  symlinkSync(join(cwd, 'components', 'FeedbackWidget.tsx'), candidate);
  assert.throws(() => stageReviewedDeveloperArtifact({ cwd, env: {} }),
    /stage blocked/);
  assertUntouched(cwd);
});
test('invalid UTF-8 payload is rejected without source modification', (t) => {
  const cwd = fixture(t);
  writeFileSync(join(cwd, 'aieo-staging', 'components', 'FeedbackWidget.tsx'),
    Buffer.from([0x66, 0x80, 0x0a]));
  assert.throws(() => stageReviewedDeveloperArtifact({ cwd, env: {} }),
    /stage blocked/);
  assertUntouched(cwd);
});
test('oversized patch is refused before overwriting baseline', (t) => {
  const cwd = fixture(t);
  writeFileSync(join(cwd, 'aieo-staging', 'components', 'FeedbackWidget.tsx'),
    'a'.repeat(48001));
  assert.throws(() => stageReviewedDeveloperArtifact({ cwd, env: {} }),
    /stage blocked/);
  assertUntouched(cwd);
});

test('refuses swapped developer payload inode after pathname attestation', (t) => {
  const cwd = fixture(t);
  const source = join(cwd, 'aieo-staging', 'components', 'FeedbackWidget.tsx');
  const held = join(cwd, 'original-staged-source');
  const replacement = join(cwd, 'replacement-staged-source');
  writeFileSync(replacement, 'malicious substituted source\\n');
  const oldLstat = fs.lstatSync;
  let swapped = false;
  try {
    fs.lstatSync = (path, ...args) => {
      const stat = oldLstat(path, ...args);
      if (!swapped && path === source) {
        swapped = true;
        renameSync(source, held);
        renameSync(replacement, source);
      }
      return stat;
    };
    syncBuiltinESMExports();
    assert.throws(() => stageReviewedDeveloperArtifact({ cwd, env: {} }),
      /stage blocked/);
  } finally {
    fs.lstatSync = oldLstat;
    syncBuiltinESMExports();
  }
  assert.equal(swapped, true);
  assertUntouched(cwd);
});

test('bounds developer payload reads against concurrent growth', (t) => {
  const cwd = fixture(t);
  const source = join(cwd, 'aieo-staging', 'components', 'FeedbackWidget.tsx');
  const oldRead = fs.readSync;
  const maxExpected = Buffer.byteLength('verified developer candidate\\n');
  let expanded = false;
  let largestRead = 0;
  try {
    fs.readSync = (fd, buffer, offset, length, position) => {
      // The baseline source is read first, then the downloaded candidate.
      if (!expanded && length === maxExpected) {
        expanded = true;
        fs.appendFileSync(source, 'X'.repeat(1024 * 1024));
      }
      largestRead = Math.max(largestRead, length);
      return oldRead(fd, buffer, offset, length, position);
    };
    syncBuiltinESMExports();
    assert.throws(() => stageReviewedDeveloperArtifact({ cwd, env: {} }),
      /stage blocked/);
  } finally {
    fs.readSync = oldRead;
    syncBuiltinESMExports();
  }
  assert.equal(expanded, true);
  assert.ok(largestRead <= maxExpected);
  assertUntouched(cwd);
});

test('rejects trusted source swapped to external symlink before write', (t) => {
  const cwd = fixture(t);
  const target = join(cwd, 'components', 'FeedbackWidget.tsx');
  const held = join(cwd, 'original-trusted-source');
  const outside = join(cwd, 'outside-writable-source');
  writeFileSync(outside, 'external original\\n');
  const oldOpen = fs.openSync;
  let swapped = false;
  try {
    fs.openSync = (path, flags, ...args) => {
      if (!swapped && path === target && (flags & fs.constants.O_WRONLY)) {
        swapped = true;
        renameSync(target, held);
        symlinkSync(outside, target);
      }
      return oldOpen(path, flags, ...args);
    };
    syncBuiltinESMExports();
    assert.throws(() => stageReviewedDeveloperArtifact({ cwd, env: {} }),
      /ELOOP|stage blocked/);
  } finally {
    fs.openSync = oldOpen;
    syncBuiltinESMExports();
  }
  assert.equal(swapped, true);
  assert.equal(readFileSync(outside, 'utf8'), 'external original\\n');
  assert.equal(readFileSync(held, 'utf8'), 'trusted baseline\\n');
  assertUntouched(cwd);
});

test('rejects hardlinked or group-writable trusted source', (t) => {
  const cwd = fixture(t);
  const target = join(cwd, 'components', 'FeedbackWidget.tsx');
  linkSync(target, join(cwd, 'other-hardlink'));
  assert.throws(() => stageReviewedDeveloperArtifact({ cwd, env: {} }),
    /stage blocked/);
  assertUntouched(cwd);
});

test('rejects writable-by-group trusted component directory', (t) => {
  const cwd = fixture(t);
  chmodSync(join(cwd, 'components'), 0o770);
  assert.throws(() => stageReviewedDeveloperArtifact({ cwd, env: {} }),
    /stage blocked/);
  assertUntouched(cwd);
});
