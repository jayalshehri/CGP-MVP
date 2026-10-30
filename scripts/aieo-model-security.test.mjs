import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';
import { inspectModelDiff } from './aieo-model-security.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const original = 'const items = 1;\n';
const actual = 'const items = 2;\n';
const report = { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) };
const diff = '@@ -1 +1 @@\n-const items = 1;\n+const items = 2;\n';
const input = { original, actual, changedPaths: [MODEL_ALLOWED_PATH], diff, report };

test('independent security accepts one exact clean change', () => {
  assert.equal(inspectModelDiff(input).status, 'passed');
});
test('security blocks changed-file scope and hash tampering', () => {
  assert.equal(inspectModelDiff({ ...input, changedPaths: ['supabase/config.toml'] }).status, 'failed');
  assert.equal(inspectModelDiff({ ...input, changedPaths: [MODEL_ALLOWED_PATH, 'package.json'] }).status, 'failed');
  assert.equal(inspectModelDiff({ ...input, report: { ...report, proposedHash: 'wrong' } }).status, 'failed');
});
test('security blocks suspicious newly introduced calls and credentials', () => {
  assert.equal(inspectModelDiff({ ...input, diff: '+fetch("https://example.invalid")' }).status, 'failed');
  assert.equal(inspectModelDiff({ ...input, diff: '+ghp_' + 'a'.repeat(30) }).status, 'failed');
});
test('security blocks no-op and massive diffs', () => {
  assert.equal(inspectModelDiff({ ...input, actual: original }).status, 'failed');
  assert.equal(inspectModelDiff({ ...input, diff: '+safe\n'.repeat(25) }).status, 'failed');
});

test('security rejects browser exfiltration primitives and modern credentials', () => {
  for (const addition of [
    '+const raw = document.cookie;',
    '+localStorage.getItem("token");',
    '+new WebSocket("wss://example.invalid");',
    '+<div dangerouslySetInnerHTML={{ __html: message }} />;',
    '+import { execSync } from "child_process";',
    '+sk-or-v1-' + 'a'.repeat(40),
    '+github_pat_' + 'b'.repeat(40),
    '+Bearer ' + 'c'.repeat(36)
  ]) {
    assert.equal(inspectModelDiff({ ...input, diff: addition }).status, 'failed', addition);
  }
});

test('security refuses removal of existing feedback authentication and ownership guards', () => {
  const protectedSource = [
    'const auth = await supabase.auth.getUser();',
    'if (!auth.user) return;',
    'const record = { created_by: auth.user.id };',
    'await supabase.from("feedback").insert(record);',
    ''
  ].join('\n');
  const variants = [
    protectedSource.replace('if (!auth.user)', 'if (true)'),
    protectedSource.replace('created_by: auth.user.id', 'created_by: null'),
    protectedSource.replace('await supabase.auth.getUser()', 'Promise.resolve(null)')
  ];
  for (const current of variants) {
    const evidence = {
      status: 'proposed', sourceHash: hash(protectedSource), proposedHash: hash(current)
    };
    const result = inspectModelDiff({
      original: protectedSource, actual: current, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '@@ -1 +1 @@\n+const safe = 1;\n', report: evidence
    });
    assert.equal(result.status, 'failed');
    assert.ok(result.findings.some((value) => value.includes('authentication or ownership')));
  }
});
