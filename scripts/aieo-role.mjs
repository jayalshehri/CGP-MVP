// Run exactly one independent AIEO role per CI job using redacted artifact handoffs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { APPROVED_PATH, APPROVED_TASK, orchestrate, publicReport } from '../aieo/lib/engine.mjs';

const role = process.argv[2];
if (!['developer', 'qa', 'security', 'reviewer'].includes(role)) {
  throw new Error('Expected one of: developer, qa, security, reviewer');
}
const source = readFileSync(APPROVED_PATH, 'utf8');
const task = process.env.AIEO_TASK || APPROVED_TASK;
const local = orchestrate({ task, source });
const safe = publicReport(local);
const hash = local.developer.sourceHash;

function readPrior(prior) {
  const data = JSON.parse(readFileSync('aieo-output/' + prior + '.json', 'utf8'));
  if (data.schemaVersion !== 1 || data.role !== prior || data.sourceHash !== hash ||
      data.task !== task || typeof data.status !== 'string') {
    throw new Error('Invalid, stale, or mismatched ' + prior + ' handoff artifact');
  }
  return data;
}

let result;
if (role === 'developer') {
  result = { ...safe.developer, bounded: true };
} else if (role === 'qa') {
  const developer = readPrior('developer');
  if (developer.status !== safe.developer.status) throw new Error('Developer verdict mismatch');
  result = { ...safe.qa };
} else if (role === 'security') {
  const developer = readPrior('developer');
  if (developer.status !== safe.developer.status) throw new Error('Developer verdict mismatch');
  result = { ...safe.security };
} else {
  const developer = readPrior('developer');
  const qa = readPrior('qa');
  const security = readPrior('security');
  if (developer.status !== safe.developer.status ||
      qa.status !== safe.qa.status || security.status !== safe.security.status) {
    throw new Error('Reviewer received conflicting agent verdicts');
  }
  result = { ...safe.reviewer, handoffValidated: true };
}

const artifact = { schemaVersion: 1, role, task, sourceHash: hash, ...result };
mkdirSync('aieo-output', { recursive: true });
writeFileSync('aieo-output/' + role + '.json', JSON.stringify(artifact, null, 2) + '\n');
console.log(JSON.stringify({ role, status: result.status, handoff: 'validated', writesToProduction: false }));

const allowed = {
  developer: ['proposed', 'no-change'],
  qa: ['passed'],
  security: ['passed'],
  reviewer: ['draft-pr-eligible', 'verified-no-change']
};
if (!allowed[role].includes(result.status)) process.exitCode = 1;
