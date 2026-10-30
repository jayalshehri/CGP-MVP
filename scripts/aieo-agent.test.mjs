import test from 'node:test';
import assert from 'node:assert/strict';
import { APPROVED_PATH, APPROVED_TASK, developerAgent, qaAgent, securityAgent, reviewerAgent, orchestrate, publicReport } from '../aieo/lib/engine.mjs';

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
  assert.equal(securityAgent({ developer: good }).status, 'passed');
  assert.equal(securityAgent({ developer: { ...good, path: 'supabase/migrations/unsafe.sql' } }).status, 'failed');
  assert.equal(securityAgent({ developer: { ...good, addedLines: ['ghp_' + 'a'.repeat(30)] } }).status, 'failed');
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
