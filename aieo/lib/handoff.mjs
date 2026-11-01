import { createHash } from 'node:crypto';

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

export const HANDOFF_SCHEMA_VERSION = 3;

// Prevent replaying a passing artifact from a different workflow run, re-run,
// repository, or checked-out revision when the source bytes happen to match.
// GitHub supplies these values to *all* jobs in the same workflow run.
// The hash is run metadata, not a credential or a signature: it does not
// authenticate an untrusted workflow, and local-only runs are not CI proof.
export function getExecutionBinding(env = process.env) {
  const keys = ['GITHUB_REPOSITORY', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_SHA'];
  const isGitHub = env.GITHUB_ACTIONS !== undefined || keys.some((key) => env[key] !== undefined);
  if (!isGitHub) return 'local-unbound';
  if (env.GITHUB_ACTIONS !== 'true' ||
      env.GITHUB_REPOSITORY !== 'jayalshehri/CGP-MVP' ||
      !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID || '') ||
      !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT || '') ||
      !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '')) {
    throw new Error('Incomplete or unexpected GitHub execution context');
  }
  const context = keys.map((key) => env[key]);
  return 'github:' + createHash('sha256')
    .update(JSON.stringify(['aieo-handoff-v3', ...context]))
    .digest('hex');
}

// Handoff artifacts are *untrusted evidence*. Export only the fields needed by
// the receiving role: never serialize an arbitrary verdict's extra properties.
// In particular, source, model responses, prompts or future secret fields may
// be added to internal agent results but must not enter retained CI artifacts.
const roleFields = {
  developer: ['status', 'reason', 'path', 'bounded'],
  qa: ['status', 'checks', 'casesPassed', 'casesTotal'],
  security: ['status', 'findings'],
  reviewer: ['status', 'reason', 'requiresHumanMerge', 'handoffValidated']
};
const identityFields = ['schemaVersion', 'role', 'task', 'sourceHash', 'candidateHash', 'runBinding'];
const pickVerdict = (role, verdict) => Object.fromEntries(
  roleFields[role].filter((field) => Object.hasOwn(verdict, field))
    .map((field) => [field, verdict[field]])
);
const onlyExpectedKeys = (role, artifact) =>
  Object.keys(artifact).every((key) =>
    identityFields.includes(key) || roleFields[role]?.includes(key)
  );



export function buildHandoffArtifact({ role, task, sourceHash, candidateHash, verdict }) {
  if (!allowed[role] || !allowed[role].includes(verdict?.status) ||
      !task || !isHash(sourceHash) || !isHash(candidateHash)) {
    throw new Error('Cannot construct invalid AIEO handoff');
  }
  return {
    ...pickVerdict(role, verdict),
    schemaVersion: HANDOFF_SCHEMA_VERSION, role, task, sourceHash, candidateHash,
    runBinding: getExecutionBinding()
  };
}

export function verifyHandoffArtifact({ artifact, role, task, sourceHash, candidateHash, expected }) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact) ||
      artifact.schemaVersion !== HANDOFF_SCHEMA_VERSION ||
      artifact.role !== role || artifact.task !== task ||
      artifact.runBinding !== getExecutionBinding() ||
      !onlyExpectedKeys(role, artifact) ||
      (role === 'developer' && artifact.bounded !== true) ||
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
