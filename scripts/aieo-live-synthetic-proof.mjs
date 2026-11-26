// Isolated, user-approved synthetic AIEO integration proof.
// Never loads or transmits application source; no production file modifications.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fixtureSource } from './aieo-fixture-source.mjs';
import { APPROVED_TASK, developerAgent, qaAgent, securityAgent, reviewerAgent } from '../aieo/lib/engine.mjs';
import { buildModelRequest, validateModelPatch, MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';

const role = process.argv[2];
const hash = (s) => createHash('sha256').update(s).digest('hex');
const expected = developerAgent({ task: APPROVED_TASK, source: fixtureSource });
if (expected.status !== 'proposed' || !expected.patchedSource) throw Error('Synthetic baseline invalid');
const directory = 'aieo-live-proof';
function save(name, data) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(directory + '/' + name + '.json', JSON.stringify(data) + '\n', { flag: 'wx', mode: 0o600 });
}
function load(name) {
  const data = JSON.parse(readFileSync(directory + '/' + name + '.json', 'utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Invalid proof');
  return data;
}
function developer() {
  const data = load('developer');
  if (data.path !== MODEL_ALLOWED_PATH || data.source !== fixtureSource ||
      data.candidate !== expected.patchedSource || data.sourceHash !== hash(fixtureSource) ||
      data.candidateHash !== hash(expected.patchedSource) || data.sourceHash === data.candidateHash ||
      Object.keys(data).sort().join(',') !== 'candidate,candidateHash,path,source,sourceHash') {
    throw Error('Provider output does not match approved synthetic change');
  }
  return data;
}
async function propose() {
  if (process.env.GITHUB_REF !== 'refs/heads/aieo/synthetic-live-e2e-proof-20261126' ||
      process.env.GITHUB_EVENT_NAME !== 'push' ||
      process.env.GITHUB_REPOSITORY !== 'jayalshehri/CGP-MVP') throw Error('Untrusted workflow');
  const key = process.env.OPENROUTER_API_KEY, model = process.env.AIEO_MODEL_ID;
  if (!key || !model) throw Error('Provider credentials/model not configured in protected environment');
  // The only permitted provider task is a byte-for-byte substitution in
  // a synthetic fixture; explicit instructions remove model ambiguity.
  const oldLine = fixtureSource.split('\n')[1];
  const newLine = expected.patchedSource.split('\n')[1];
  const task = 'In the synthetic source, replace exactly this existing line: ' +
    JSON.stringify(oldLine) + ' with: ' + JSON.stringify(newLine) +
    '. Keep every other byte unchanged. Return exactly four JSON string fields: path, find, replace, explanation. No Markdown.';
  const request = buildModelRequest({ source: fixtureSource, task, model, shareApproved: true });
  // Reasoning-capable free model can exhaust the small completion budget
  // before producing final JSON; preserve every strict final-response gate.
  request.max_tokens = 3000;
  request.reasoning = { enabled: false };
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25000),
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });
  if (!response.ok || response.redirected) throw Error('Provider request failed: HTTP ' + response.status);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 18000) throw Error('Provider response exceeds limit');
  const envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (envelope?.choices?.length !== 1 || envelope.choices[0]?.finish_reason !== 'stop' ||
      envelope.choices[0]?.message?.role !== 'assistant' ||
      typeof envelope.choices[0]?.message?.content !== 'string' ||
      envelope.choices[0]?.message?.tool_calls != null) {
    // Protocol metadata only: never log model text, prompts or credentials.
    const finish = envelope?.choices?.[0]?.finish_reason;
    console.log('MODEL_PROTOCOL_DIAGNOSTIC', JSON.stringify({
      finish: ['stop', 'length', 'content_filter', 'tool_calls'].includes(finish) ? finish : 'other',
      assistantRole: envelope?.choices?.[0]?.message?.role === 'assistant',
      hasContent: typeof envelope?.choices?.[0]?.message?.content === 'string'
    }));
    throw Error('Provider response not final');
  }
  const check = validateModelPatch({ response: envelope.choices[0].message.content, source: fixtureSource });
  if (check.status !== 'proposed' || check.patchedSource !== expected.patchedSource) {
    // Validator-owned reasons and Boolean hashes only: never print model text.
    console.log('MODEL_PATCH_DIAGNOSTIC', JSON.stringify({
      status: check.status,
      reason: check.reason || null,
      correctSyntheticPatch: check.status === 'proposed' && check.patchedSource === expected.patchedSource
    }));
    throw Error('Live model did not propose the exact approved synthetic fix');
  }
  save('developer', { path: MODEL_ALLOWED_PATH, source: fixtureSource, candidate: check.patchedSource,
    sourceHash: hash(fixtureSource), candidateHash: hash(check.patchedSource) });
  console.log('LIVE_SYNTHETIC_PROVIDER_PROPOSED');
}
function qa() {
  const d = developer();
  const result = qaAgent({ developer: expected, source: d.source });
  if (result.status !== 'passed') throw Error('QA failed');
  save('qa', { sourceHash: d.sourceHash, candidateHash: d.candidateHash, status: result.status });
  console.log('INDEPENDENT_QA_PASSED');
}
function security() {
  const d = developer();
  const result = securityAgent({ developer: expected, source: d.source });
  if (result.status !== 'passed' || result.findings.length) throw Error('Security failed');
  save('security', { sourceHash: d.sourceHash, candidateHash: d.candidateHash, status: result.status });
  console.log('INDEPENDENT_SECURITY_PASSED');
}
function review() {
  const d = developer(), q = load('qa'), s = load('security');
  for (const evidence of [q,s]) {
    if (Object.keys(evidence).sort().join(',') !== 'candidateHash,sourceHash,status' ||
        evidence.sourceHash !== d.sourceHash || evidence.candidateHash !== d.candidateHash ||
        evidence.status !== 'passed') throw Error('Independent evidence invalid');
  }
  const r = reviewerAgent({ developer: expected, qa: qaAgent({ developer: expected, source: d.source }),
    security: securityAgent({ developer: expected, source: d.source }) });
  if (r.status !== 'draft-pr-eligible' || r.requiresHumanMerge !== true) throw Error('Reviewer blocked');
  save('reviewer', { sourceHash: d.sourceHash, candidateHash: d.candidateHash, status: r.status,
    requiresHumanMerge: true });
  console.log('INDEPENDENT_REVIEWER_ELIGIBLE');
}
function publication() {
  const d = developer(), q = load('qa'), s = load('security'), r = load('reviewer');
  if ([q,s,r].some(x=>x.sourceHash !== d.sourceHash || x.candidateHash !== d.candidateHash) ||
      q.status !== 'passed' || s.status !== 'passed' || r.status !== 'draft-pr-eligible' ||
      r.requiresHumanMerge !== true) throw Error('Unverified independent proof');
  const report = { proof: 'AIEO_LIVE_SYNTHETIC_ONLY', githubRunId: process.env.GITHUB_RUN_ID,
    sourceHash: d.sourceHash, candidateHash: d.candidateHash, developer: 'proposed',
    qa: q.status, security: s.status, reviewer: r.status, humanMergeRequired: true,
    productionSourceShared: false, productionCodeChanged: false, deploymentAuthorized: false };
  writeFileSync('aieo-live-synthetic-proof.json', JSON.stringify(report, null, 2) + '\n', { flag:'wx', mode: 0o600 });
  console.log('DRAFT_PROOF_READY');
}
if (role === 'developer') await propose();
else if (role === 'qa') qa();
else if (role === 'security') security();
else if (role === 'reviewer') review();
else if (role === 'publish') publication();
else throw Error('Unknown role');
