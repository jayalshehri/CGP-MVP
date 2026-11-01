import test from 'node:test';
import assert from 'node:assert/strict';
import { APPROVED_PATH, APPROVED_TASK, MESSAGE_TRIM_TASK, developerAgent, qaAgent, securityAgent, reviewerAgent, orchestrate, publicReport } from '../aieo/lib/engine.mjs';

const oldLine = '  const controlId = useMemo(() => /^\\/controls\\/(\\d+)/.exec(pagePath)?.[1] ?? null, [pagePath]);';
const newLine = '  const controlId = useMemo(() => /^\\/controls\\/(\\d+)(?:\\/|$)/.exec(pagePath)?.[1] ?? null, [pagePath]);';
const original = 'function example() {\n' + oldLine + '\n}\n';
const fixed = 'function example() {\n' + newLine + '\n}\n';

test('developer proposes exactly the bounded one-line correction', () => {
  const agent = developerAgent({ task: APPROVED_TASK, path: APPROVED_PATH, source: original });
  assert.equal(agent.status, 'proposed');
  assert.equal(agent.patchedSource, fixed);
  assert.equal(agent.addedLines.length, 1);
});
test('developer is idempotent on already corrected code', () => {
  assert.equal(developerAgent({ task: APPROVED_TASK, source: fixed }).status, 'no-change');
});
test('developer fails closed on drift, repeated matches and unapproved scopes', () => {
  for (const source of ['unrelated source', original + oldLine]) {
    assert.equal(developerAgent({ task: APPROVED_TASK, source }).status, 'blocked');
  }
  assert.equal(developerAgent({ task: 'any-other-task', source: original }).status, 'blocked');
  assert.equal(developerAgent({ task: APPROVED_TASK, path: '.github/workflows/unsafe.yml', source: original }).status, 'blocked');
});
test('QA checks corrected source and five route examples', () => {
  const good = developerAgent({ task: APPROVED_TASK, source: original });
  assert.equal(qaAgent({ developer: good, source: original }).status, 'passed');
  assert.equal(qaAgent({ developer: { ...good, patchedSource: original }, source: original }).status, 'failed');
  assert.equal(qaAgent({ developer: { status: 'blocked' }, source: original }).status, 'failed');
});
test('security blocks unauthorized replacement and credentials', () => {
  const good = developerAgent({ task: APPROVED_TASK, source: original });
  assert.equal(securityAgent({ developer: good, source: original }).status, 'passed');
  assert.equal(securityAgent({ developer: { ...good, patchedSource: good.patchedSource + 'malicious' }, source: original }).status, 'failed');
  assert.equal(securityAgent({ developer: { ...good, sourceHash: 'wrong' }, source: original }).status, 'failed');
  assert.equal(securityAgent({ developer: { ...good, path: 'supabase/migrations/unsafe.sql' }, source: original }).status, 'failed');
  assert.equal(securityAgent({ developer: { ...good, addedLines: ['ghp_' + 'a'.repeat(30)] }, source: original }).status, 'failed');
});
test('reviewer never authorizes merging; blocks on any failed verdict', () => {
  const good = orchestrate({ source: original });
  assert.equal(good.reviewer.status, 'draft-pr-eligible');
  assert.equal(good.reviewer.requiresHumanMerge, true);
  assert.equal(reviewerAgent({ ...good, qa: { status: 'failed' } }).status, 'blocked');
  assert.equal(reviewerAgent({ ...good, security: { status: 'failed' } }).status, 'blocked');
});
test('full four-agent handoff supports no-change and sanitized report', () => {
  const result = orchestrate({ source: fixed });
  assert.equal(result.developer.status, 'no-change');
  assert.equal(result.qa.status, 'passed');
  assert.equal(result.security.status, 'passed');
  assert.equal(result.reviewer.status, 'verified-no-change');
  const report = publicReport(orchestrate({ source: original }));
  assert.equal(JSON.stringify(report).includes(original), false);
  assert.equal(JSON.stringify(report).includes('patchedSource'), false);
  assert.equal(report.mergePerformed, false);
  assert.equal(report.productionChanges, false);
});


test('second approved deterministic task repairs blank-message validation without any general code edits', () => {
  const vulnerable = 'function example() {\n    const cleanMessage = message;\n}\n';
  const corrected = 'function example() {\n    const cleanMessage = message.trim();\n}\n';
  const proposed = orchestrate({ task: MESSAGE_TRIM_TASK, source: vulnerable });
  assert.equal(proposed.developer.status, 'proposed');
  assert.equal(proposed.developer.patchedSource, corrected);
  assert.equal(proposed.developer.task, MESSAGE_TRIM_TASK);
  assert.equal(proposed.qa.status, 'passed');
  assert.deepEqual(proposed.qa.checks, ['single-corrected-source-line', 'five-message-trim-regressions']);
  assert.equal(proposed.qa.casesPassed, 5);
  assert.equal(proposed.security.status, 'passed');
  assert.equal(proposed.reviewer.status, 'draft-pr-eligible');
  assert.equal(proposed.reviewer.requiresHumanMerge, true);
  const alreadyFixed = orchestrate({ task: MESSAGE_TRIM_TASK, source: corrected });
  assert.equal(alreadyFixed.developer.status, 'no-change');
  assert.equal(alreadyFixed.reviewer.status, 'verified-no-change');
});

test('second repair fails closed on drift, forged identity/hash and mixed-task replacement', () => {
  const vulnerable = 'function example() {\n    const cleanMessage = message;\n}\n';
  const proposed = developerAgent({ task: MESSAGE_TRIM_TASK, source: vulnerable });
  assert.equal(developerAgent({ task: MESSAGE_TRIM_TASK, source: vulnerable.repeat(2) }).status, 'blocked');
  assert.equal(developerAgent({ task: 'feedback-unapproved', source: vulnerable }).status, 'blocked');
  assert.equal(developerAgent({ task: MESSAGE_TRIM_TASK, path: 'app/login/page.tsx', source: vulnerable }).status, 'blocked');
  const forged = { ...proposed, task: APPROVED_TASK };
  assert.equal(qaAgent({ developer: forged, source: vulnerable }).status, 'failed');
  assert.equal(securityAgent({ developer: forged, source: vulnerable }).status, 'failed');
  const forgedHash = { ...proposed, candidateHash: '0'.repeat(64) };
  assert.equal(qaAgent({ developer: forgedHash, source: vulnerable }).status, 'failed');
  assert.equal(securityAgent({ developer: forgedHash, source: vulnerable }).status, 'failed');
  assert.equal(securityAgent({ developer: { ...proposed, addedLines: ['const cleanMessage = message;'] }, source: vulnerable }).status, 'failed');
});
