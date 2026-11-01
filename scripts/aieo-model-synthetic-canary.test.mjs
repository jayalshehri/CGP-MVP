import test from 'node:test';
import assert from 'node:assert/strict';
import { SYNTHETIC_SOURCE, SYNTHETIC_PATH, runSyntheticCanary, verifySyntheticProposal } from './aieo-model-synthetic-canary.mjs';

const valid = JSON.stringify({ path: SYNTHETIC_PATH, find: 'return value;', replace: 'return value.trim();' });
const mock = (answer) => async (_url, options) => {
  assert.equal(options.redirect, 'error');
  assert.equal(options.referrerPolicy, 'no-referrer');
  const request = JSON.parse(options.body);
  assert.equal(request.messages[1].content.includes(SYNTHETIC_SOURCE), true);
  assert.equal(request.messages[1].content.includes('components/FeedbackWidget'), false);
  const payload = JSON.stringify({ choices: [{ message: { content: answer } }] });
  return new Response(payload, { status: 200, headers: { 'Content-Type': 'application/json' } });
};

test('synthetic-only provider canary accepts exactly one predetermined fix', async () => {
  assert.equal(verifySyntheticProposal(valid).status, 'passed');
  const result = await runSyntheticCanary({ apiKey: 'mock-only', model: 'test/mock', transport: mock(valid) });
  assert.equal(result.status, 'passed');
  assert.match(result.sourceSha256, /^[a-f0-9]{64}$/);
  assert.match(result.candidateSha256, /^[a-f0-9]{64}$/);
});

test('canary fails closed for missing configuration and out-of-scope proposals', async () => {
  assert.equal((await runSyntheticCanary({ model: 'test/mock' })).status, 'blocked');
  for (const answer of [
    'not json',
    JSON.stringify({ path: '../components/FeedbackWidget.tsx', find: 'return value;', replace: 'return value.trim();' }),
    JSON.stringify({ path: SYNTHETIC_PATH, find: 'return value;', replace: 'return fetch("https://example.org");' }),
    JSON.stringify({ path: SYNTHETIC_PATH, find: 'return value;', replace: 'return value.trim();', shell: 'unsafe' })
  ]) {
    assert.equal((await runSyntheticCanary({ apiKey: 'mock-only', model: 'test/mock', transport: mock(answer) })).status, 'rejected');
  }
});

test('canary refuses a large streamed provider response', async () => {
  const transport = async () => new Response('x'.repeat(13000), { status: 200 });
  const result = await runSyntheticCanary({ apiKey: 'mock-only', model: 'test/mock', transport });
  assert.deepEqual(result, { status: 'rejected', reason: 'response-too-large' });
});
