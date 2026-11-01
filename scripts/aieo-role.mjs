// Each CI job independently rechecks the source and validates prior artifact evidence.
import { readFileSync, writeFileSync, mkdirSync, lstatSync, fstatSync, openSync, closeSync, constants } from 'node:fs';
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

const MAX_HANDOFF_BYTES = 16 * 1024;

function readPrior(prior) {
  // Downloaded CI handoffs are untrusted files, not trusted instructions.
  // Check the directory and open the file without following a symlink, so a
  // crafted artifact cannot make an agent read an arbitrary runner-local file.
  const folder = lstatSync('aieo-output');
  if (!folder.isDirectory() || folder.isSymbolicLink()) {
    throw new Error('Unsafe AIEO handoff directory');
  }
  const path = 'aieo-output/' + prior + '.json';
  const onDisk = lstatSync(path);
  if (!onDisk.isFile() || onDisk.isSymbolicLink() ||
      onDisk.nlink !== 1 || onDisk.size < 2 || onDisk.size > MAX_HANDOFF_BYTES) {
    throw new Error('Unsafe AIEO handoff file');
  }

  // O_NONBLOCK makes a swapped-in FIFO or device fail instead of hanging.
  // Recheck the opened descriptor to close the lstat-to-open replacement gap.
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let raw;
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 ||
        opened.size < 2 || opened.size > MAX_HANDOFF_BYTES) {
      throw new Error('Unsafe opened AIEO handoff');
    }
    raw = readFileSync(fd);
    if (raw.length < 2 || raw.length > MAX_HANDOFF_BYTES) {
      throw new Error('Oversized or empty AIEO handoff');
    }
  } finally {
    closeSync(fd);
  }

  let artifact;
  try {
    artifact = JSON.parse(raw.toString('utf8'));
  } catch {
    // Do not print JSON.parse diagnostics that might contain private source
    // content inserted into a malicious downloaded artifact.
    throw new Error('Malformed AIEO handoff JSON');
  }
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
