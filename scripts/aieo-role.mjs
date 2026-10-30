// Each CI job independently rechecks the source and validates prior artifact evidence.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { APPROVED_PATH, APPROVED_TASK, orchestrate, publicReport } from '../aieo/lib/engine.mjs';
import { buildHandoffArtifact, verifyHandoffArtifact } from '../aieo/lib/handoff.mjs';

const role = process.argv[2];
if (!['developer', 'qa', 'security', 'reviewer'].includes(role)) {
  throw new Error('Expected one of: developer, qa, security, reviewer');
}

const source = readFileSync(APPROVED_PATH, 'utf8');
const task = process.env.AIEO_TASK || APPROVED_TASK;
const local = orchestrate({ task, source });
const safe = publicReport(local);
const sourceHash = local.developer.sourceHash;
const candidateHash = local.developer.candidateHash;
if (!sourceHash || !candidateHash) throw new Error('No valid source and candidate attestation');

function readPrior(prior) {
  // Artifacts can be altered independently of the checked-out repository.
  // Never consume patches, commands or success claims supplied by an artifact.
  const artifact = JSON.parse(readFileSync('aieo-output/' + prior + '.json', 'utf8'));
  return verifyHandoffArtifact({
    artifact, role: prior, task, sourceHash, candidateHash,
    expected: safe[prior]
  });
}

let verdict;
if (role === 'developer') {
  verdict = { ...safe.developer, bounded: true };
} else if (role === 'qa') {
  readPrior('developer');
  verdict = { ...safe.qa };
} else if (role === 'security') {
  readPrior('developer');
  verdict = { ...safe.security };
} else {
  readPrior('developer');
  readPrior('qa');
  readPrior('security');
  verdict = { ...safe.reviewer, handoffValidated: true };
}
const artifact = buildHandoffArtifact({ role, task, sourceHash, candidateHash, verdict });
mkdirSync('aieo-output', { recursive: true });
writeFileSync('aieo-output/' + role + '.json', JSON.stringify(artifact, null, 2) + '\n');
console.log(JSON.stringify({ role, status: verdict.status, handoff: 'verified-against-source', writesToProduction: false }));

const allowed = {
  developer: ['proposed', 'no-change'],
  qa: ['passed'],
  security: ['passed'],
  reviewer: ['draft-pr-eligible', 'verified-no-change']
};
if (!allowed[role].includes(verdict.status)) process.exitCode = 1;
