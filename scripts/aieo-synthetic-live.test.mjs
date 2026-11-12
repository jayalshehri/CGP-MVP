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
      return new Response(JSON.stringify(response()), { headers: { 'content-type': 'application/json' } });
    }
  });
  assert.equal(result.status, 'PASS');
});

test('reject missing API key before transport', async () => {
  let called = false;
  await assert.rejects(() => runSyntheticLive({key:'', transport:async()=>{called=true;}}), /not configured/);
  assert.equal(called, false);
});

test('live probe forbids redirects, sends no referrer and has a timeout', async () => {
  const result = await runSyntheticLive({
    key: 'synthetic-test-key',
    transport: async (_url, options) => {
      assert.equal(options.redirect, 'error');
      assert.equal(options.referrerPolicy, 'no-referrer');
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.signal.aborted, false);
      return { ok: true, redirected: true };
    }
  });
  assert.equal(result.status, 'INCONCLUSIVE');
});

test('reject declared oversized provider response even with correct fixture', async () => {
  const result = await runSyntheticLive({
    key: 'synthetic-test-key',
    transport: async () => new Response(JSON.stringify(response()), {
      headers: { 'content-length': '18001' }
    })
  });
  assert.equal(result.status, 'INCONCLUSIVE');
});

test('reject actual oversized streamed response regardless of content-length', async () => {
  const result = await runSyntheticLive({
    key: 'synthetic-test-key',
    transport: async () => new Response(JSON.stringify(response()) + ' '.repeat(20_000))
  });
  assert.equal(result.status, 'INCONCLUSIVE');
});

test('reject malformed UTF-8 bytes instead of replacing them lossily', async () => {
  const result = await runSyntheticLive({
    key: 'synthetic-test-key',
    transport: async () => new Response(Uint8Array.of(0xff, 0xfe, 0xfd))
  });
  assert.equal(result.status, 'INCONCLUSIVE');
});

test('reject non-streaming fake responses rather than trusting unbounded json()', async () => {
  let jsonCalled = false;
  const result = await runSyntheticLive({
    key: 'synthetic-test-key',
    transport: async () => ({
      ok: true,
      redirected: false,
      json: async () => { jsonCalled = true; return response(); }
    })
  });
  assert.equal(jsonCalled, false);
  assert.equal(result.status, 'INCONCLUSIVE');
});

test('accept split streaming JSON only when exact synthetic fixture is returned', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(response()));
  const result = await runSyntheticLive({
    key: 'synthetic-test-key',
    transport: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 12));
        controller.enqueue(bytes.subarray(12));
        controller.close();
      }
    }))
  });
  assert.equal(result.status, 'PASS');
});
