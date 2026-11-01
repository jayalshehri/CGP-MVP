import test from 'node:test';
import assert from 'node:assert/strict';
import { APPROVED_TASK, orchestrate, publicReport } from '../aieo/lib/engine.mjs';
import { HANDOFF_SCHEMA_VERSION, buildHandoffArtifact, verifyHandoffArtifact, getExecutionBinding } from '../aieo/lib/handoff.mjs';

const vulnerableLine = '  const controlId = useMemo(() => /^\\/controls\\/(\\d+)/.exec(pagePath)?.[1] ?? null, [pagePath]);';
const source = 'function syntheticFixture() {\n' + vulnerableLine + '\n}\n';
const report = publicReport(orchestrate({ task: APPROVED_TASK, source }));
const { sourceHash, candidateHash } = report.developer;

const make = (role, extra = {}) => buildHandoffArtifact({
  role, task: APPROVED_TASK, sourceHash, candidateHash,
  verdict: { ...report[role], ...(role === 'developer' ? { bounded: true } : {}), ...(role === 'reviewer' ? { handoffValidated: true } : {}), ...extra }
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

test('CI handoffs strip surprise model/source fields and reject injected artifact properties', () => {
  const leak = 'synthetic-secret-marker-never-artifacted';
  for (const role of ['developer', 'qa', 'security', 'reviewer']) {
    const sanitized = make(role, { privateSource: leak, providerResponse: leak, unexpectedPrompt: leak });
    assert.equal(JSON.stringify(sanitized).includes(leak), false, role + ': unexpected data leaked');
    assert.equal(accept(role, sanitized), sanitized);
    assert.throws(
      () => accept(role, { ...sanitized, privateSource: leak }),
      role + ': unknown field should be refused at the receiving job'
    );
  }
  assert.throws(
    () => accept('developer', { ...make('developer'), bounded: false }),
    'Developer bounded evidence must not be downgraded'
  );
  const missingBound = make('developer');
  delete missingBound.bounded;
  assert.throws(
    () => accept('developer', missingBound),
    'Developer must explicitly attest bounded scope; absence is not approval'
  );
});

test('execution binding varies across GitHub runs, retries and checkout commits', () => {
  const context = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'jayalshehri/CGP-MVP',
    GITHUB_RUN_ID: '900101',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_SHA: 'a'.repeat(40)
  };
  const bound = getExecutionBinding(context);
  assert.match(bound, /^github:[a-f0-9]{64}$/);
  assert.equal(bound, getExecutionBinding({ ...context }));
  for (const change of [
    { GITHUB_RUN_ID: '900102' },
    { GITHUB_RUN_ATTEMPT: '2' },
    { GITHUB_SHA: 'b'.repeat(40) }
  ]) {
    assert.notEqual(getExecutionBinding({ ...context, ...change }), bound);
  }
  const artifact = make('developer');
  assert.equal(artifact.runBinding, getExecutionBinding());
  assert.equal(accept('developer', artifact), artifact);
  assert.throws(() => accept('developer', { ...artifact, runBinding: 'local-unbound' }));
  assert.throws(() => accept('developer', { ...artifact, runBinding: bound === artifact.runBinding ? 'other' : bound }));
});

test('GitHub context must be complete and canonical, or artifact construction fails closed', () => {
  const valid = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'jayalshehri/CGP-MVP',
    GITHUB_RUN_ID: '900101',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_SHA: 'a'.repeat(40)
  };
  assert.equal(getExecutionBinding({}), 'local-unbound');
  for (const change of [
    { GITHUB_ACTIONS: 'false' },
    { GITHUB_REPOSITORY: 'someone-else/CGP-MVP' },
    { GITHUB_RUN_ID: '' },
    { GITHUB_RUN_ID: '0' },
    { GITHUB_RUN_ATTEMPT: '0' },
    { GITHUB_RUN_ATTEMPT: '' },
    { GITHUB_SHA: 'a'.repeat(39) },
    { GITHUB_SHA: 'not-a-commit' }
  ]) {
    assert.throws(() => getExecutionBinding({ ...valid, ...change }), 'reject ' + JSON.stringify(change));
  }
  assert.throws(() => getExecutionBinding({ GITHUB_ACTIONS: 'true' }));
  assert.throws(() => getExecutionBinding({ GITHUB_RUN_ID: '900101' }));
});

test('unexpected source or provider content cannot override execution binding', () => {
  const fake = make('developer', { runBinding: 'forged', source: 'confidential-source' });
  assert.equal(fake.runBinding, getExecutionBinding());
  assert.equal(JSON.stringify(fake).includes('confidential-source'), false);
  assert.throws(() => accept('developer', { ...fake, runBinding: 'forged' }));
});
