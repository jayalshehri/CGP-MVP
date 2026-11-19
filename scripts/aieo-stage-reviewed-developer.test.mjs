import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync,
  symlinkSync, rmSync, existsSync
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
