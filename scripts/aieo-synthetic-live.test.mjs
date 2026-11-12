import test from 'node:test';
import assert from 'node:assert/strict';
import { ORIGINAL, EXPECTED, buildSyntheticRequest, validateSyntheticResult, runSyntheticLive } from './aieo-synthetic-live.mjs';

const response = (find = ORIGINAL, replace = EXPECTED, finish_reason = 'stop') => ({
  choices: [{ finish_reason, message: { content: JSON.stringify({ find, replace }) } }]
});

test('request can contain only a fixed synthetic line, never CGP source', () => {
  const body = JSON.stringify(buildSyntheticRequest());
  assert.equal(buildSyntheticRequest().model, 'openrouter/free');
  assert.equal(buildSyntheticRequest().messages.length, 2);
  assert.match(body, /Old status/);
  assert.doesNotMatch(body, /FeedbackWidget|SUPABASE|GITHUB_TOKEN|\/home\/|\/components\//i);
});

test('accept the exact safe synthetic one-line repair', () => {
  assert.equal(validateSyntheticResult(response()).status, 'PASS');
});

test('fail closed on unsafe or incomplete replies', () => {
  for (const candidate of [
    response(ORIGINAL, 'eval("unexpected")'),
    response('other source', EXPECTED),
    response(ORIGINAL, EXPECTED, 'length'),
    { choices: [{ finish_reason: 'stop', message: { content: '```json\n{}\n```' } }] },
    { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ find: ORIGINAL, replace: EXPECTED, extra: true }) } }] },
    { choices: [] }
  ]) assert.equal(validateSyntheticResult(candidate).status, 'INCONCLUSIVE');
});

test('mock transport sees only synthetic content and free model', async () => {
  const result = await runSyntheticLive({
    key: 'synthetic-test-key',
    transport: async (url, opts) => {
      assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.equal(JSON.parse(opts.body).model, 'openrouter/free');
      assert.ok(JSON.parse(opts.body).messages[1].content.includes(ORIGINAL));
      return { ok: true, json: async () => response() };
    }
  });
  assert.equal(result.status, 'PASS');
});

test('reject missing API key before transport', async () => {
  let called = false;
  await assert.rejects(() => runSyntheticLive({key:'', transport:async()=>{called=true;}}), /not configured/);
  assert.equal(called, false);
});
