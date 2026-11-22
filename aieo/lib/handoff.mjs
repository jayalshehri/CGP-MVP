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

export const HANDOFF_SCHEMA_VERSION = 2;

export function buildHandoffArtifact({ role, task, sourceHash, candidateHash, verdict }) {
  if (!allowed[role] || !allowed[role].includes(verdict?.status) ||
      !task || !isHash(sourceHash) || !isHash(candidateHash)) {
    throw new Error('Cannot construct invalid AIEO handoff');
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
