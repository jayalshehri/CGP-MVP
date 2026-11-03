import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DEFAULT_FREE_MODEL, isFreeOnlyModel, requireFreeModel } from '../aieo/lib/free-model-policy.mjs';
import { buildModelRequest, requestModelPatch } from '../aieo/lib/model-provider.mjs';

const source = 'function example() { return 1; }\n';
const task = 'Change one synthetic numeric constant, never access any external file.';
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const baseEnv = {
  AIEO_MODEL_ENABLED: 'true', AIEO_SOURCE_SHARING_APPROVED: 'true',
  GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
  OPENROUTER_API_KEY: 'fake-test-key', OPENROUTER_MODEL_ID: DEFAULT_FREE_MODEL,
  AIEO_APPROVED_SOURCE_SHA256: sha256(source)
};

test('only the free router and explicitly free-suffixed models are accepted', () => {
  for (const id of ['openrouter/free', 'nvidia/nemotron-3.5-super:free', 'provider/coding-model:free']) {
    assert.equal(isFreeOnlyModel(id), true, id);
    assert.equal(requireFreeModel(id), id);
  }
  for (const id of [
    '', 'openai/gpt-4.1-mini', 'anthropic/claude-sonnet-4',
    'openrouter/auto', 'provider/model:free,provider/paid',
    'provider/model:FREE ', 'provider/model:free\n', null
  ]) {
    assert.equal(isFreeOnlyModel(id), false, String(id));
    assert.throws(() => requireFreeModel(id));
  }
});

test('free router is used unchanged for the only allowed provider request', () => {
  const data = buildModelRequest({ source, task, model: DEFAULT_FREE_MODEL, shareApproved: true });
  assert.equal(data.model, DEFAULT_FREE_MODEL);
  assert.equal(data.messages[1].content.includes(source), true);
  assert.throws(() => buildModelRequest({ source, task, model: 'openrouter/auto', shareApproved: true }));
  assert.throws(() => buildModelRequest({ source, task, model: 'openai/gpt-4.1-mini', shareApproved: true }));
});

test('paid model fails closed BEFORE transport, even with consent and a key', async () => {
  for (const id of ['openrouter/auto', 'openai/gpt-4.1-mini', 'provider/paid']) {
    let calls = 0;
    const result = await requestModelPatch({
      source, task, env: { ...baseEnv, OPENROUTER_MODEL_ID: id },
      transport: async () => { calls++; throw new Error('network must not be used'); }
    });
    assert.equal(result.status, 'blocked');
    assert.equal(calls, 0);
  }
});

test('free-only routing does not override source-sharing consent', async () => {
  let calls = 0;
  const result = await requestModelPatch({
    source, task, env: { ...baseEnv, AIEO_SOURCE_SHARING_APPROVED: 'false' },
    transport: async () => { calls++; throw new Error('network must not be used'); }
  });
  assert.equal(result.status, 'blocked');
  assert.equal(calls, 0);
});
