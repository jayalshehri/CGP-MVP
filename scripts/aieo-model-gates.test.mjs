import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';
import { inspectModelDiff } from './aieo-model-security.mjs';
import { inspectModelQa, inspectModelReviewer } from '../aieo/lib/model-gates.mjs';

const hash = (v) => createHash('sha256').update(v).digest('hex');
const route = String.raw`  const controlId = useMemo(() => /^\/controls\/(\d+)(?:\/|$)/.exec(pagePath)?.[1] ?? null, [pagePath]);`;
const original = 'function fixture() {\n' + route + '\n  const sample = 1;\n}\n';
const actual = original.replace('  const sample = 1;', '  const sample = 2;');
const changedPaths = [MODEL_ALLOWED_PATH];
const diff = '@@ -3 +3 @@\n-  const sample = 1;\n+  const sample = 2;\n';
const proposal = {
  schemaVersion: 1, status: 'proposed', path: MODEL_ALLOWED_PATH,
  sourceHash: hash(original), proposedHash: hash(actual)
};
const input = { original, actual, changedPaths, diff, proposal };
const qa = inspectModelQa({ ...input, report: proposal });
const security = inspectModelDiff({ ...input, report: proposal });

test('separate model QA validates the source-bound bounded candidate and five known cases', () => {
  assert.equal(qa.status, 'passed');
  assert.equal(qa.routeCasesPassed, 5);
  assert.equal(qa.routeCasesTotal, 5);
});
test('reviewer recomputes QA and security evidence and never authorizes merge', () => {
  const result = inspectModelReviewer({ ...input, qa, security });
  assert.equal(result.status, 'draft-pr-eligible');
  assert.equal(result.requiresHumanMerge, true);
});
test('QA blocks a forged hash, out-of-scope change, no-op and removal of existing route guard', () => {
  for (const bad of [
    { report: { ...proposal, proposedHash: 'f'.repeat(64) } },
    { changedPaths: [MODEL_ALLOWED_PATH, 'supabase/config.toml'] },
    { actual: original },
    { actual: actual.replace(route, '  const controlId = null;') }
  ]) {
    const current = inspectModelQa({ ...input, report: proposal, ...bad });
    assert.equal(current.status, 'failed');
  }
});
test('reviewer blocks fabricated QA passes and security verdicts even if status says passed', () => {
  for (const bad of [
    { qa: { ...qa, sourceHash: '0'.repeat(64) } },
    { qa: { ...qa, routeCasesPassed: 0 } },
    { security: { ...security, findings: ['fabricated'] } },
    { security: { ...security, addedLines: 0 } }
  ]) assert.equal(inspectModelReviewer({ ...input, qa, security, ...bad }).status, 'blocked');
});
test('reviewer refuses unapproved file change despite forged successful artifacts', () => {
  const result = inspectModelReviewer({
    ...input, changedPaths: [MODEL_ALLOWED_PATH, 'package.json'],
    qa: { ...qa, status: 'passed' }, security: { ...security, status: 'passed' }
  });
  assert.equal(result.status, 'blocked');
});

test('QA and Reviewer reject a route expression retained only as a comment, with valid hashes', () => {
  for (const hidden of [
    actual.replace(route, '//' + route),
    actual.replace(route, '  const controlId = null; //' + route)
  ]) {
    // These both passed the old substring-only check despite disabling the route.
    assert.equal(hidden.split(route).length - 1, 1);
    const legitimateProposal = { ...proposal, proposedHash: hash(hidden) };
    const observedQa = inspectModelQa({
      original, actual: hidden, changedPaths, report: legitimateProposal
    });
    assert.equal(observedQa.status, 'failed');
    assert.equal(observedQa.routeCasesPassed, 0);
    assert.match(observedQa.findings.join(' '), /route-boundary invariant/);
    const observedDiff = '@@ -2 +2 @@\n-' + route + '\n+' +
      hidden.split('\n')[1] + '\n';
    const observedSecurity = inspectModelDiff({
      original, actual: hidden, changedPaths, diff: observedDiff, report: legitimateProposal
    });
    assert.equal(inspectModelReviewer({
      original, actual: hidden, changedPaths, diff: observedDiff,
      proposal: legitimateProposal,
      qa: { ...qa, proposedHash: hash(hidden) },
      security: observedSecurity
    }).status, 'blocked', 'Reviewer independently recomputes failed QA');
  }
});

test('QA and Reviewer reject non-executable route decoys within block comments or templates', () => {
  const decoys = [
    ['/*', route, '*/', '  const controlId = null;'].join('\n'),
    ['  const decoy = `', route, '`;', '  const controlId = null;'].join('\n')
  ];
  for (const decoy of decoys) {
    const hidden = actual.replace(route, decoy);
    assert.equal(hidden.split('\n').filter((line) => line === route).length, 1,
      'the older standalone-line guard would accept this inert code');
    const bound = { ...proposal, proposedHash: hash(hidden) };
    const checkedQa = inspectModelQa({ ...input, actual: hidden, report: bound });
    assert.equal(checkedQa.status, 'failed');
    assert.equal(checkedQa.routeCasesPassed, 0);
    assert.match(checkedQa.findings.join(' '), /route-boundary invariant/);
    const addition = decoy.split('\n');
    const trueDiff = '@@ -2 +2,' + addition.length + ' @@\n-' + route + '\n' +
      addition.map((line) => '+' + line).join('\n') + '\n';
    const checkedSecurity = inspectModelDiff({
      ...input, actual: hidden, diff: trueDiff, report: bound
    });
    assert.equal(inspectModelReviewer({
      ...input, actual: hidden, diff: trueDiff, proposal: bound,
      qa: checkedQa, security: checkedSecurity
    }).status, 'blocked');
  }
});

test('QA and Reviewer reject live-looking route guard relocated into unreachable code', () => {
  const relocated = [
    ['  if (false) {', route, '  }', '  const controlId = null;'].join('\n'),
    ['  function neverCalled() {', route, '  }', '  const controlId = null;'].join('\n')
  ];
  for (const replacement of relocated) {
    const hidden = actual.replace(route, replacement);
    assert.equal(hidden.split('\n').filter((line) => line === route).length, 1,
      'unchanged code line still appears exactly once outside comments and strings');
    const bound = { ...proposal, proposedHash: hash(hidden) };
    const verifiedQa = inspectModelQa({ ...input, actual: hidden, report: bound });
    assert.equal(verifiedQa.status, 'failed',
      'unchanged route in a dead scope must not count as the live component hook');
    assert.equal(verifiedQa.routeCasesPassed, 0);

    const additions = replacement.split('\n');
    const realDiff = '@@ -2 +2,' + additions.length + ' @@\n-' + route + '\n' +
      additions.map((line) => '+' + line).join('\n') + '\n';
    const verifiedSecurity = inspectModelDiff({
      ...input, actual: hidden, diff: realDiff, report: bound
    });
    assert.equal(verifiedSecurity.status, 'passed',
      'generic diff safety checks must not be mistaken for route validity');
    assert.equal(inspectModelReviewer({
      ...input, actual: hidden, diff: realDiff, proposal: bound,
      qa: { ...qa, proposedHash: hash(hidden) },
      security: verifiedSecurity
    }).status, 'blocked', 'Reviewer independently rejects forged QA success');
  }
});


test('QA and Reviewer block disabling the component after a preserved route hook', () => {
  const baseline = [
    'function fixture() {',
    route,
    '  if (!visible) return null;',
    '  async function submit(event: FormEvent<HTMLFormElement>) {',
    '    await save();',
    '  }',
    '  return <>',
    '    <form onSubmit={submit}><span>Old label</span></form>',
    '  </>;',
    '}',
    ''
  ].join('\n');
  const valid = baseline.replace('Old label', 'New label');
  const attested = (current) => ({
    schemaVersion: 1, status: 'proposed', path: MODEL_ALLOWED_PATH,
    sourceHash: hash(baseline), proposedHash: hash(current)
  });
  const good = inspectModelQa({
    original: baseline, actual: valid, changedPaths, report: attested(valid)
  });
  assert.equal(good.status, 'passed', 'bounded JSX label edits remain possible');

  for (const unsafe of [
    baseline.replace('if (!visible) return null;', 'if (true) return null;'),
    baseline.replace('    await save();', '    return;'),
    baseline.replace('  return <>', '  return <div>')
  ]) {
    const proposal = attested(unsafe);
    const currentQa = inspectModelQa({
      original: baseline, actual: unsafe, changedPaths, report: proposal
    });
    assert.equal(currentQa.status, 'failed', 'pre-render logic and entry point are trusted');
    assert.equal(currentQa.routeCasesPassed, 0, 'an unchanged live route line alone is not enough');
    const changedLine = unsafe.split('\n').find((line) => !baseline.split('\n').includes(line));
    const delta = '@@ -1 +1 @@\n+' + (changedLine || '  const noop = false;') + '\n';
    const sec = inspectModelDiff({
      original: baseline, actual: unsafe, changedPaths, diff: delta, report: proposal
    });
    assert.equal(inspectModelReviewer({
      original: baseline, actual: unsafe, changedPaths, diff: delta,
      proposal, qa: { ...good, proposedHash: hash(unsafe) }, security: sec
    }).status, 'blocked', 'Reviewer must reject a fabricated success report');
  }
});


test('QA and Reviewer allow literal JSX copy but block post-render state bypass with valid hashes', () => {
  const baseline = [
    'function fixture() {',
    route,
    '  if (!visible) return null;',
    '  return <>',
    '    <div>{open && <span>Old label</span>}</div>',
    '    <form onSubmit={submit}><strong>Save feedback</strong></form>',
    '  </>;',
    '}',
    ''
  ].join('\n');
  const bound = (source) => ({
    schemaVersion: 1, status: 'proposed', path: MODEL_ALLOWED_PATH,
    sourceHash: hash(baseline), proposedHash: hash(source)
  });
  const good = baseline.replace('Old label', 'Updated label');
  const checked = inspectModelQa({ original: baseline, actual: good, changedPaths, report: bound(good) });
  assert.equal(checked.status, 'passed', 'bounded static JSX copy remains permitted');

  for (const unsafe of [
    baseline.replace('open &&', 'false &&'),
    baseline.replace('<span>Old label</span>', '<span>{false && "Old label"}</span>'),
    baseline.replace('<form onSubmit={submit}>', '<form onSubmit={() => {}}>'),
    baseline.replace('<span>Old label</span>', '<span onClick={() => setOpen(false)}>Old label</span>')
  ]) {
    const proposal = bound(unsafe);
    const currentQa = inspectModelQa({ original: baseline, actual: unsafe, changedPaths, report: proposal });
    assert.equal(currentQa.status, 'failed', 'JSX expression and attribute changes must not pass as copy edits');
    assert.match(currentQa.findings.join(' '), /Rendered JSX edit/);
    const sec = inspectModelDiff({
      original: baseline, actual: unsafe, changedPaths,
      diff: '@@ -1 +1 @@\n+    <div>changed markup</div>\n', report: proposal
    });
    assert.equal(inspectModelReviewer({
      original: baseline, actual: unsafe, changedPaths,
      diff: '@@ -1 +1 @@\n+    <div>changed markup</div>\n',
      proposal, qa: { ...checked, proposedHash: hash(unsafe) }, security: sec
    }).status, 'blocked', 'Reviewer independently recomputes JSX integrity');
  }
});


test('QA and Reviewer reject markup-shaped decoys inside executable JS strings', () => {
  const baseline = [
    'function fixture() {',
    route,
    '  return <>',
    '    {(() => {',
    '      const endpoint = "https://trusted.example/<span>Stable route</span>";',
    '      return <a href={endpoint}>Actual label</a>;',
    '    })()}',
    '    <div><span>Visible text</span></div>',
    '  </>;',
    '}',
    ''
  ].join('\n');
  const attested = (source) => ({
    schemaVersion: 1, status: 'proposed', path: MODEL_ALLOWED_PATH,
    sourceHash: hash(baseline), proposedHash: hash(source)
  });
  const allowed = baseline.replace('Visible text', 'Updated text');
  assert.equal(inspectModelQa({
    original: baseline, actual: allowed, changedPaths, report: attested(allowed)
  }).status, 'passed', 'real JSX text changes remain allowed');

  for (const unsafe of [
    baseline.replace('Stable route', 'Changed destination'),
    baseline.replace(
      'const endpoint = "https://trusted.example/<span>Stable route</span>";',
      'const endpoint = \x60https://trusted.example/<span>Changed destination</span>\x60;'
    )
  ]) {
    const proposal = attested(unsafe);
    const checkedQa = inspectModelQa({
      original: baseline, actual: unsafe, changedPaths, report: proposal
    });
    assert.equal(checkedQa.status, 'failed', 'JS string/template content is not a JSX text node');
    assert.match(checkedQa.findings.join(' '), /Rendered JSX edit/);
    const changedLine = unsafe.split('\n').find((line) => !baseline.split('\n').includes(line));
    const checkedDiff = '@@ -5 +5 @@\n+ ' + (changedLine || '') + '\n';
    const checkedSecurity = inspectModelDiff({
      original: baseline, actual: unsafe, changedPaths, diff: checkedDiff, report: proposal
    });
    const forgedQa = {
      ...inspectModelQa({
        original: baseline, actual: allowed, changedPaths, report: attested(allowed)
      }),
      proposedHash: hash(unsafe)
    };
    assert.equal(inspectModelReviewer({
      original: baseline, actual: unsafe, changedPaths,
      diff: checkedDiff, proposal, qa: forgedQa, security: checkedSecurity
    }).status, 'blocked', 'Reviewer recomputes QA and refuses forged success');
  }
});


test('QA and Reviewer reject behavior-bearing JSX element contents while allowing visible copy', () => {
  const baseline = [
    'function fixture() {',
    route,
    '  return <>',
    '    <span>Visible label</span>',
    '    <style>visibility: visible;</style>',
    '    <textarea>Initial notes</textarea>',
    '    <select><option>safe-choice</option></select>',
    '    <script>location.href=allowed;</script>',
    '  </>;',
    '}',
    ''
  ].join('\n');
  const bound = (candidate) => ({
    schemaVersion: 1, status: 'proposed', path: MODEL_ALLOWED_PATH,
    sourceHash: hash(baseline), proposedHash: hash(candidate)
  });
  const displayOnly = baseline.replace('Visible label', 'Updated label');
  const validQa = inspectModelQa({
    original: baseline, actual: displayOnly, changedPaths, report: bound(displayOnly)
  });
  assert.equal(validQa.status, 'passed', 'reviewed display text remains editable');

  // Old generic JSX regex accepted all four substitutions as one text edit,
  // although CSS, defaults, option values and script bodies alter behavior.
  for (const [before, after] of [
    ['visibility: visible;', 'visibility: hidden;'],
    ['Initial notes', 'Altered notes'],
    ['safe-choice', 'changed-choice'],
    ['location.href=allowed;', 'location.href=changed;']
  ]) {
    const unsafe = baseline.replace(before, after);
    const proposal = bound(unsafe);
    const checkedQa = inspectModelQa({
      original: baseline, actual: unsafe, changedPaths, report: proposal
    });
    assert.equal(checkedQa.status, 'failed', 'must not certify semantics as copy: ' + before);
    assert.match(checkedQa.findings.join(' '), /Rendered JSX edit/);
    const delta = '@@ -1 +1 @@\n-' + before + '\n+' + after + '\n';
    const checkedSecurity = inspectModelDiff({
      original: baseline, actual: unsafe, changedPaths, diff: delta, report: proposal
    });
    const forgedQa = { ...validQa, proposedHash: hash(unsafe) };
    assert.equal(inspectModelReviewer({
      original: baseline, actual: unsafe, changedPaths, diff: delta,
      proposal, qa: forgedQa, security: checkedSecurity
    }).status, 'blocked', 'Reviewer must independently reject forged QA success');
  }
});


test('actual FeedbackWidget TSX permits Arabic display copy but rejects bidi spoofing and JSX behavior edits', () => {
  // Unlike the synthetic fixtures, this catches drift in the real bounded source.
  const baseline = readFileSync(new URL('../components/FeedbackWidget.tsx', import.meta.url), 'utf8');
  const originalTag = '<strong>تم حفظ الملاحظة</strong>';
  assert.equal(baseline.split(originalTag).length, 2, 'real feedback label must be unique');
  assert.ok(baseline.includes('  return <>\n'), 'real source must have the guarded render boundary');
  const makeProposal = (current) => ({
    schemaVersion: 1, status: 'proposed', path: MODEL_ALLOWED_PATH,
    sourceHash: hash(baseline), proposedHash: hash(current)
  });
  const evaluate = (current) => {
    const report = makeProposal(current);
    const baselineLines = baseline.split('\n');
    const changed = current.split('\n').find((line, i) => line !== baselineLines[i]);
    assert.ok(changed, 'candidate must contain a real changed line');
    const updatedDiff = '@@ -1 +1 @@\n+' + changed + '\n';
    const checkedQa = inspectModelQa({
      original: baseline, actual: current, changedPaths, report
    });
    const checkedSecurity = inspectModelDiff({
      original: baseline, actual: current, changedPaths, diff: updatedDiff, report
    });
    const review = inspectModelReviewer({
      original: baseline, actual: current, changedPaths, diff: updatedDiff,
      proposal: report, qa: checkedQa, security: checkedSecurity
    });
    return { checkedQa, checkedSecurity, review };
  };

  const harmless = baseline.replace(originalTag, '<strong>تم حفظ الملاحظة بنجاح</strong>');
  const allowed = evaluate(harmless);
  assert.equal(allowed.checkedQa.status, 'passed', 'real Arabic UI copy is in scope');
  assert.equal(allowed.checkedSecurity.status, 'passed');
  assert.equal(allowed.review.status, 'draft-pr-eligible');
  assert.equal(allowed.review.requiresHumanMerge, true);

  for (const [name, candidate] of [
    ['right-to-left override', baseline.replace(originalTag, '<strong>تم حفظ\u202e الملاحظة</strong>')],
    ['isolated bidirectional text', baseline.replace(originalTag, '<strong>تم حفظ\u2066 الملاحظة</strong>')],
    ['numeric hex JSX entity', baseline.replace(originalTag, '<strong>تم حفظ &#x202E; الملاحظة</strong>')],
    ['numeric decimal JSX entity', baseline.replace(originalTag, '<strong>تم حفظ &#8238; الملاحظة</strong>')],
    ['JSX visibility bypass', baseline.replace('state === "success"', 'true')]
  ]) {
    const result = evaluate(candidate);
    assert.equal(result.checkedQa.status, 'failed', name + ': QA must fail closed');
    assert.equal(result.review.status, 'blocked', name + ': Reviewer must recompute failed QA');
    assert.equal(result.review.requiresHumanMerge, true);
  }
});


test('actual feedback copy gate blocks default-ignorables, C1 controls and named JSX entities', () => {
  const baseline = readFileSync(new URL('../components/FeedbackWidget.tsx', import.meta.url), 'utf8');
  const tag = '<strong>تم حفظ الملاحظة</strong>';
  assert.equal(baseline.split(tag).length, 2, 'real text anchor must be unique');
  const attested = (candidate) => ({
    schemaVersion: 1, status: 'proposed', path: MODEL_ALLOWED_PATH,
    sourceHash: hash(baseline), proposedHash: hash(candidate)
  });
  const harmless = baseline.replace(tag, '<strong>تم حفظ الملاحظة بنجاح</strong>');
  const validQa = inspectModelQa({
    original: baseline, actual: harmless, changedPaths, report: attested(harmless)
  });
  assert.equal(validQa.status, 'passed', 'normal Arabic display text remains permitted');
  for (const [name, text] of [
    ['soft hyphen', 'تم\u00ad حفظ الملاحظة'],
    ['combining grapheme joiner', 'تم\u034f حفظ الملاحظة'],
    ['word joiner', 'تم\u2060 حفظ الملاحظة'],
    ['C1 next-line control', 'تم\u0085 حفظ الملاحظة'],
    ['Unicode line separator', 'تم\u2028 حفظ الملاحظة'],
    ['named zero-width joiner', 'تم &zwj; حفظ الملاحظة'],
    ['named soft hyphen', 'تم &shy; حفظ الملاحظة'],
    ['named tab', 'تم &Tab; حفظ الملاحظة'],
    ['named line separator', 'تم &NewLine; حفظ الملاحظة'],
    ['named ordinary entity (fail closed)', 'تم &amp; حفظ الملاحظة']
  ]) {
    const candidate = baseline.replace(tag, '<strong>' + text + '</strong>');
    const report = attested(candidate);
    const checkedQa = inspectModelQa({
      original: baseline, actual: candidate, changedPaths, report
    });
    assert.equal(checkedQa.status, 'failed', name + ': QA must reject encoded or hidden copy');
    assert.match(checkedQa.findings.join(' '), /Rendered JSX edit/);
    const diff = '@@ -1 +1 @@\n+<strong>' + text + '</strong>\n';
    const security = inspectModelDiff({
      original: baseline, actual: candidate, changedPaths, diff, report
    });
    const reviewer = inspectModelReviewer({
      original: baseline, actual: candidate, changedPaths, diff,
      proposal: report, qa: { ...validQa, proposedHash: hash(candidate) }, security
    });
    assert.equal(reviewer.status, 'blocked', name + ': Reviewer must recompute failed QA');
    assert.equal(reviewer.requiresHumanMerge, true);
  }
});


test('actual feedback gate rejects Unicode Other text while retaining Arabic diacritics', () => {
  const baseline = readFileSync(new URL('../components/FeedbackWidget.tsx', import.meta.url), 'utf8');
  const tag = '<strong>تم حفظ الملاحظة</strong>';
  assert.equal(baseline.split(tag).length, 2, 'actual source text anchor is unique');
  const attested = (candidate) => ({
    schemaVersion: 1, status: 'proposed', path: MODEL_ALLOWED_PATH,
    sourceHash: hash(baseline), proposedHash: hash(candidate)
  });
  const harmless = baseline.replace(tag, '<strong>تمَ حفظ الملاحظة بنجاح</strong>');
  const safeQa = inspectModelQa({
    original: baseline, actual: harmless, changedPaths, report: attested(harmless)
  });
  assert.equal(safeQa.status, 'passed', 'Arabic combining vowel marks remain allowed');

  // These characters are neither ordinary visible text nor necessarily
  // Default_Ignorable_Code_Point. Earlier Cc-only checks missed them.
  for (const [kind, codepoint] of [
    ['Arabic number sign (Cf)', '\u0600'],
    ['private-use codepoint (Co)', '\uE000'],
    ['isolated high surrogate (Cs)', '\uD800'],
    ['Unicode noncharacter (Cn)', '\uFDD0']
  ]) {
    const text = 'تم' + codepoint + ' حفظ الملاحظة';
    const candidate = baseline.replace(tag, '<strong>' + text + '</strong>');
    const proposal = attested(candidate);
    const qa = inspectModelQa({
      original: baseline, actual: candidate, changedPaths, report: proposal
    });
    assert.equal(qa.status, 'failed', kind + ': QA rejects non-printing text');
    assert.match(qa.findings.join(' '), /Rendered JSX edit/);
    const diff = '@@ -1 +1 @@\n+<strong>' + text + '</strong>\n';
    const security = inspectModelDiff({
      original: baseline, actual: candidate, changedPaths, diff, report: proposal
    });
    const reviewer = inspectModelReviewer({
      original: baseline, actual: candidate, changedPaths, diff,
      proposal, qa: { ...safeQa, proposedHash: hash(candidate) }, security
    });
    assert.equal(reviewer.status, 'blocked', kind + ': Reviewer rejects forged QA pass');
    assert.equal(reviewer.requiresHumanMerge, true);
  }
});
