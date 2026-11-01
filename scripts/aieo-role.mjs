// Each CI job independently rechecks the source and validates prior artifact evidence.
import { readFileSync, writeFileSync, mkdirSync, lstatSync, fstatSync, openSync, closeSync, constants, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
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

// Even a correctly verified verdict must not overwrite a redirected artifact.
// In particular, a downloaded handoff must never turn an output into a write
// through a symlink/hardlink, and old files must not be silently replaced.
function writeVerdictOutput(name, result) {
  const folder = 'aieo-output';
  mkdirSync(folder, { recursive: true });
  const directory = lstatSync(folder);
  if (!directory.isDirectory() || directory.isSymbolicLink() ||
      realpathSync(folder) !== resolve(folder)) {
    throw new Error('Unsafe AIEO verdict output directory');
  }
  const target = folder + '/' + name + '.json';
  let fd;
  try {
    fd = openSync(target,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600);
  } catch {
    // Never report an untrusted filename's contents or overwrite an existing
    // file, even if it happens to contain a previously valid verdict.
    throw new Error('AIEO verdict destination already exists or is unsafe');
  }
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1) {
      throw new Error('Unsafe opened AIEO verdict destination');
    }
    writeFileSync(fd, JSON.stringify(result, null, 2) + '\n');
  } finally {
    closeSync(fd);
  }
}
writeVerdictOutput(role, artifact);
console.log(JSON.stringify({ role, status: verdict.status, handoff: 'verified-against-source', writesToProduction: false }));

const allowed = {
  developer: ['proposed', 'no-change'],
  qa: ['passed'],
  security: ['passed'],
  reviewer: ['draft-pr-eligible', 'verified-no-change']
};
if (!allowed[role].includes(verdict.status)) process.exitCode = 1;
