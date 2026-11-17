// Content-bound handoff between independent CI jobs.
// These artifacts are evidence, not trusted executable instructions.
const allowed = {
  developer: ['proposed', 'no-change'],
  qa: ['passed'],
  security: ['passed'],
  reviewer: ['draft-pr-eligible', 'verified-no-change']
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isHash = (s) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);

// A handoff is a deliberately small evidence record, never a transport for
// candidate source, patches, commands, prompts, or arbitrary future fields.
// Extra fields must fail closed (rather than being silently propagated).
const ROLE_EVIDENCE_KEYS = {
    developer: ['status', 'reason', 'path', 'bounded'],
  qa: ['status', 'checks', 'casesPassed', 'casesTotal'],
  security: ['status', 'findings'],
  reviewer: ['status', 'reason', 'requiresHumanMerge', 'handoffValidated']
};
const IDENTITY_KEYS = ['schemaVersion', 'role', 'task', 'sourceHash', 'candidateHash'];
function assertEvidenceFields(value, role, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some((key) => !keys.includes(key))) {
    throw new Error('Unexpected fields in ' + role + ' handoff evidence');
  }
}

export const HANDOFF_SCHEMA_VERSION = 2;

export function buildHandoffArtifact({ role, task, sourceHash, candidateHash, verdict }) {
  if (!allowed[role] || !allowed[role].includes(verdict?.status) ||
      !task || !isHash(sourceHash) || !isHash(candidateHash)) {
    throw new Error('Cannot construct invalid AIEO handoff');
  }
  // The source-bound Developer report can already contain both hashes.
  // They must match the independently computed identity passed to the builder.
  const permitted = [...ROLE_EVIDENCE_KEYS[role],
    ...(role === 'developer' ? ['sourceHash', 'candidateHash'] : [])];
  assertEvidenceFields(verdict, role, permitted);
  // The standalone Developer CLI attests this bound explicitly; false or
  // omitted claims must not pass as safe evidence to independent roles.
  if (role === 'developer' && verdict.bounded !== true) {
    throw new Error('Developer handoff requires bounded attestation');
  }
  if ((Object.hasOwn(verdict, 'sourceHash') && verdict.sourceHash !== sourceHash) ||
      (Object.hasOwn(verdict, 'candidateHash') && verdict.candidateHash !== candidateHash)) {
    throw new Error('Developer handoff identity conflict');
  }
  return {
    ...verdict,
    schemaVersion: HANDOFF_SCHEMA_VERSION, role, task, sourceHash, candidateHash
  };
}

export function verifyHandoffArtifact({ artifact, role, task, sourceHash, candidateHash, expected }) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact) ||
      artifact.schemaVersion !== HANDOFF_SCHEMA_VERSION ||
      artifact.role !== role || artifact.task !== task ||
      !isHash(artifact.sourceHash) || !isHash(artifact.candidateHash) ||
      artifact.sourceHash !== sourceHash || artifact.candidateHash !== candidateHash ||
      !allowed[role]?.includes(artifact.status) ||
      artifact.status !== expected?.status) {
    throw new Error('Invalid, stale, or mismatched ' + role + ' handoff artifact');
  }
  assertEvidenceFields(artifact, role, [...IDENTITY_KEYS, ...ROLE_EVIDENCE_KEYS[role]]);
  if (role === 'developer' && artifact.bounded !== true) {
    throw new Error('Developer handoff requires bounded attestation');
  }
  // Recompute claims locally from the checked-out source, not from artifact-supplied code.
  // A successful verdict with missing or fabricated evidence must not advance.
  if (role === 'developer' && (!same(artifact.path, expected.path) ||
      !same(artifact.reason, expected.reason))) {
    throw new Error('Developer candidate evidence mismatch');
  }
  if (role === 'qa' && (!same(artifact.checks, expected.checks) ||
      !same(artifact.casesPassed, expected.casesPassed) ||
      !same(artifact.casesTotal, expected.casesTotal))) {
    throw new Error('QA regression evidence mismatch');
  }
  if (role === 'security' && !same(artifact.findings, expected.findings)) {
    throw new Error('Security findings evidence mismatch');
  }
  if (role === 'reviewer' &&
      (artifact.requiresHumanMerge !== true ||
       !same(artifact.reason, expected.reason) ||
       artifact.handoffValidated !== true)) {
    throw new Error('Reviewer merge-policy evidence mismatch');
  }
  return artifact;
}
