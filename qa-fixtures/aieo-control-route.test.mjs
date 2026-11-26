import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { controlIdFromPath } from './aieo-control-route.mjs';
import { fixtureSource } from '../scripts/aieo-fixture-source.mjs';
import { APPROVED_TASK, developerAgent, qaAgent, securityAgent, reviewerAgent } from '../aieo/lib/engine.mjs';

// Immutable proof from the live, *synthetic-only* OpenRouter run.
// This test replays that exact candidate; it does not claim a new provider call.
const verifiedSourceHash = '486457a1b176c89ba13ee3c2b8e206ae5dac69998b9889c06a0da1bedf1dfde8';
const verifiedCandidateHash = '77a519d8183dd2356ce84778d2f9f6b956cf2127d3e9aba456e75f063ae07046';
const digest = s => createHash('sha256').update(s).digest('hex');

test('QA pilot replays the exact historical, provider-approved synthetic replacement', () => {
  const dev = developerAgent({ task: APPROVED_TASK, source: fixtureSource });
  assert.equal(dev.status, 'proposed');
  assert.equal(dev.sourceHash, verifiedSourceHash);
  assert.equal(dev.candidateHash, verifiedCandidateHash);
  assert.notEqual(dev.sourceHash, dev.candidateHash);
  assert.equal(digest(dev.patchedSource), verifiedCandidateHash);
  const qa = qaAgent({ developer: dev, source: fixtureSource });
  const security = securityAgent({ developer: dev, source: fixtureSource });
  const review = reviewerAgent({ developer: dev, qa, security });
  assert.equal(qa.status, 'passed');
  assert.equal(security.status, 'passed');
  assert.equal(review.status, 'draft-pr-eligible');
  assert.equal(review.requiresHumanMerge, true);
});

test('QA pilot route boundary rejects invalid suffixes', () => {
  const cases = [
    ['/controls/12', '12'],
    ['/controls/12/edit', '12'],
    ['/controls/123', '123'],
    ['/controls/12/', '12'],
    ['/controls/12junk', null],
    ['/controls/12?preview=1', null],
    ['/controls/', null],
    ['/control/12', null],
    ['/controls/١٢', null],
    ['/controls/0', '0'],
    ['/controls/12-extra', null]
  ];
  for (const [path, expected] of cases) assert.equal(controlIdFromPath(path), expected, path);
});

test('Security pilot keeps the candidate isolated from application code', () => {
  const source = readFileSync(new URL('./aieo-control-route.mjs', import.meta.url), 'utf8');
  assert.match(source, /export function controlIdFromPath\(pagePath\)/);
  assert.match(source, /\(\?:\\\/\|\$\)/);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|eval|child_process|process\.env)\b/);
  assert.doesNotMatch(source, /\b(?:import|require)\s*\(/);
});
