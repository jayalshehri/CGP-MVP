import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
