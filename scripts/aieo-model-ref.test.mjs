// Isolated, source-bound regression for React ref callback side effects.
// Model-authored presentation edits must not gain a mount/unmount execution path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MODEL_ALLOWED_PATH, validateModelPatch } from '../aieo/lib/model-provider.mjs';
import { inspectModelDiff } from './aieo-model-security.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const source = 'const view = <div\n  title="safe"\n  data-ref="label"\n/>;\n';
const find = '  title="safe"';
function inspect(replace) {
  const actual = source.replace(find, replace);
  const proposal = JSON.stringify({
    path: MODEL_ALLOWED_PATH, find, replace, explanation: 'Synthetic ref safety regression'
  });
  const provider = validateModelPatch({ source, response: proposal });
  // A real zero-context unified hunk, not an invented addition-only diff.
  const diff = '@@ -2 +2 @@\n-' + find + '\n+' + replace + '\n';
  const security = inspectModelDiff({
    original: source, actual, changedPaths: [MODEL_ALLOWED_PATH], diff,
    report: { status: 'proposed', sourceHash: sha(source), proposedHash: sha(actual) }
  });
  return { provider, security };
}

test('new JSX ref callbacks cannot run existing privileged callbacks on mount', () => {
  for (const replace of [
    '  title="safe" ref={() => submit()}',
    '  title="safe" ref={existingCallback}',
    '  title="safe" ref={(node) => { if (node) invokeExistingAction(); }}'
  ]) {
    const { provider, security } = inspect(replace);
    assert.equal(provider.status, 'rejected', replace);
    assert.equal(security.status, 'failed', replace);
    assert.ok(security.findings.includes('Potentially unsafe new code'));
  }
});

test('attribute-only ref injection is refused when the added diff omits the JSX tag', () => {
  const replace = '  title="safe" ref={submit}';
  const { provider, security } = inspect(replace);
  assert.equal(provider.status, 'rejected');
  assert.equal(security.status, 'failed');
});

test('ordinary static JSX text edits and data-ref attributes remain eligible', () => {
  const { provider, security } = inspect('  title="safer"');
  assert.equal(provider.status, 'proposed');
  assert.equal(security.status, 'passed');
});
