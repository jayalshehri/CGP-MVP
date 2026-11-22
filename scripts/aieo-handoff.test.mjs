import test from 'node:test';
import assert from 'node:assert/strict';
import { APPROVED_TASK, orchestrate, publicReport } from '../aieo/lib/engine.mjs';
import { HANDOFF_SCHEMA_VERSION, buildHandoffArtifact, verifyHandoffArtifact } from '../aieo/lib/handoff.mjs';

const vulnerableLine = '  const controlId = useMemo(() => /^\\/controls\\/(\\d+)/.exec(pagePath)?.[1] ?? null, [pagePath]);';
const source = 'function syntheticFixture() {\n' + vulnerableLine + '\n}\n';
const report = publicReport(orchestrate({ task: APPROVED_TASK, source }));
const { sourceHash, candidateHash } = report.developer;

const make = (role, extra = {}) => buildHandoffArtifact({
  role, task: APPROVED_TASK, sourceHash, candidateHash,
  verdict: { ...report[role], ...(role === 'reviewer' ? { handoffValidated: true } : {}), ...extra }
});
const accept = (role, artifact = make(role)) => verifyHandoffArtifact({
  artifact, role, task: APPROVED_TASK, sourceHash, candidateHash, expected: report[role]
});

test('real proposed fixture binds candidate different from source; all four role artifacts verify', () => {
  assert.equal(report.developer.status, 'proposed');
  assert.notEqual(sourceHash, candidateHash);
  for (const role of ['developer', 'qa', 'security', 'reviewer']) {
    const artifact = make(role);
    assert.equal(artifact.schemaVersion, HANDOFF_SCHEMA_VERSION);
    assert.equal(accept(role, artifact), artifact);
    assert.equal(JSON.stringify(artifact).includes(vulnerableLine), false);
    assert.equal(JSON.stringify(artifact).includes('patchedSource'), false);
  }
  assert.equal(make('reviewer').requiresHumanMerge, true);
});

test('fake approved verdict with wrong source, candidate, role, task or schema is rejected', () => {
  for (const change of [
    { sourceHash: '0'.repeat(64) }, { candidateHash: 'f'.repeat(64) },
    { role: 'security' }, { task: 'unapproved task' }, { schemaVersion: 1 },
    { status: 'no-change' }
  ]) {
    assert.throws(() => accept('developer', { ...make('developer'), ...change }));
  }
});

test('QA success without matching independently recomputed regression evidence is rejected', () => {
  assert.throws(() => accept('qa', { ...make('qa'), casesPassed: 0 }));
  assert.throws(() => accept('qa', { ...make('qa'), checks: ['fake-test'] }));
  assert.throws(() => accept('qa', { ...make('qa'), casesTotal: undefined }));
});

test('security and reviewer claims cannot bypass evidence or human merge gate', () => {
  assert.throws(() => accept('security', { ...make('security'), findings: ['ignored risk'] }));
  assert.throws(() => accept('reviewer', { ...make('reviewer'), requiresHumanMerge: false }));
  assert.throws(() => accept('reviewer', { ...make('reviewer'), handoffValidated: false }));
});

test('verdict metadata cannot overwrite protected artifact identity', () => {
  const artifact = make('developer', { role: 'reviewer', task: 'spoofed', sourceHash: '0'.repeat(64) });
  assert.equal(artifact.role, 'developer');
  assert.equal(artifact.task, APPROVED_TASK);
  assert.equal(artifact.sourceHash, sourceHash);
  assert.equal(accept('developer', artifact), artifact);
});

test('invalid verdict or candidate hashes cannot construct handoffs', () => {
  assert.throws(() => buildHandoffArtifact({
    role: 'developer', task: APPROVED_TASK, sourceHash, candidateHash: 'bad', verdict: report.developer
  }));
  assert.throws(() => buildHandoffArtifact({
    role: 'security', task: APPROVED_TASK, sourceHash, candidateHash, verdict: { status: 'failed' }
  }));
});
