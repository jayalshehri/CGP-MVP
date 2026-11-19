// Import a bounded model candidate into a FRESH, credential-free publisher job.
// Build/provider code runs on a different runner; do not execute its artifact.
import { lstatSync, readdirSync, mkdirSync, writeFileSync, rmSync,
  openSync, fstatSync, closeSync, ftruncateSync, readSync, constants } from 'node:fs';
import { join } from 'node:path';

const SOURCE = 'FeedbackWidget.tsx';
const REPORTS = ['model-proposal.json', 'model-qa.json',
  'model-security.json', 'model-reviewer.json'];
function block() { throw new Error('AIEO model artifact stage blocked: unexpected or unsafe input'); }
function checkDirectory(path, uid, names) {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== uid ||
      (stat.mode & 0o0022)) block();
  if (names) {
    const actual = readdirSync(path).sort();
    if (JSON.stringify(actual) !== JSON.stringify([...names].sort())) block();
  }
  return stat;
}
// Read artifact bytes from an inode-bound descriptor, not a filename that
// could be replaced with a symlink after lstat. O_NONBLOCK avoids hanging on
// a swapped FIFO; the descriptor and pathname must both match at each check.
function checkedArtifact(stat, original, uid, maxBytes) {
  return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 &&
    stat.uid === uid && !(stat.mode & 0o0022) &&
    stat.size >= 1 && stat.size <= maxBytes && sameSource(stat, original);
}
// An inode can grow after fstat. Never use readFileSync(fd), which reads to
// EOF and could allocate attacker-controlled amounts of memory. Consume only
// the attested number of bytes, plus one probe byte to detect appended data.
function readBoundedArtifact(fd, expectedSize) {
  const bytes = Buffer.alloc(expectedSize);
  let offset = 0;
  while (offset < expectedSize) {
    const count = readSync(fd, bytes, offset, expectedSize - offset, null);
    if (count <= 0) block();
    offset += count;
  }
  if (readSync(fd, Buffer.alloc(1), 0, 1, null) !== 0) block();
  return bytes;
}
function checkedBytes(path, uid, maxBytes, json = false) {
  const original = lstatSync(path);
  if (!checkedArtifact(original, original, uid, maxBytes)) block();
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW |
      constants.O_NONBLOCK);
    if (!checkedArtifact(fstatSync(fd), original, uid, maxBytes) ||
        !checkedArtifact(lstatSync(path), original, uid, maxBytes)) block();
    const bytes = readBoundedArtifact(fd, original.size);
    if (bytes.length !== original.size ||
        !checkedArtifact(fstatSync(fd), original, uid, maxBytes) ||
        !checkedArtifact(lstatSync(path), original, uid, maxBytes)) block();
    const decoded = bytes.toString('utf8');
    if (!Buffer.from(decoded, 'utf8').equals(bytes)) block();
    if (json) {
      const parsed = JSON.parse(decoded);
      if (decoded !== JSON.stringify(parsed, null, 2) + '\n') block();
    }
    return bytes;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

// Do not truncate a trusted checkout path after checking only its filename.
// Open with O_NOFOLLOW, then attest the opened descriptor AND the path to the
// same regular, privately writable inode immediately before any source write.
// If the path was swapped to a link or another file, fail without modifying it.
function trustedSource(stat, uid) {
  return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 &&
    stat.uid === uid && (stat.mode & 0o600) === 0o600 &&
    !(stat.mode & 0o7133) && stat.size >= 1 && stat.size <= 48000;
}
function sameSource(stat, expected) {
  return stat.dev === expected.dev && stat.ino === expected.ino &&
    stat.mode === expected.mode && stat.size === expected.size &&
    stat.mtimeMs === expected.mtimeMs && stat.ctimeMs === expected.ctimeMs;
}
function writeTrustedSource(path, expected, uid, candidate) {
  let fd;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_NOFOLLOW |
      constants.O_NONBLOCK);
    const opened = fstatSync(fd);
    const pathNow = lstatSync(path);
    if (!trustedSource(opened, uid) || !trustedSource(pathNow, uid) ||
        !sameSource(opened, expected) || !sameSource(pathNow, expected)) block();
    ftruncateSync(fd, 0);
    writeFileSync(fd, candidate);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function stageReviewedModelArtifact({ cwd = process.cwd(), env = process.env } = {}) {
  // A downloaded candidate is never read while either GitHub write credentials
  // or the external model credential is present in this process.
  if (['GH_TOKEN', 'GITHUB_TOKEN', 'OPENROUTER_API_KEY'].some((key) =>
    env[key] || process.env[key])) block();
  const uid = process.getuid?.();
  if (!Number.isSafeInteger(uid)) block();
  const staging = join(cwd, 'aieo-staging');
  const sourceDir = join(staging, 'components');
  const reportDir = join(staging, 'aieo-output');
  const trustedComponents = join(cwd, 'components');
  const source = join(trustedComponents, SOURCE);
  const targetDir = join(cwd, 'aieo-output');
  // Reject any unexpected payload or path BEFORE modifying the clean checkout.
  checkDirectory(staging, uid, ['components', 'aieo-output']);
  checkDirectory(sourceDir, uid, [SOURCE]);
  checkDirectory(reportDir, uid, REPORTS);
  // A regular source file under a symlinked or writable parent is not trusted.
  // Capture its directory inode before reading artifact bytes.
  const trustedParent = checkDirectory(trustedComponents, uid);
  const candidate = checkedBytes(join(sourceDir, SOURCE), uid, 48000);
  const reports = REPORTS.map((name) =>
    [name, checkedBytes(join(reportDir, name), uid, 65536, true)]);
  const original = lstatSync(source);
  const parentAfter = checkDirectory(trustedComponents, uid);
  // lstat sees even dangling symlinks; existsSync would miss them and allow
  // the candidate source to be overwritten before mkdirSync then failed.
  if (!trustedSource(original, uid) ||
      parentAfter.dev !== trustedParent.dev ||
      parentAfter.ino !== trustedParent.ino ||
      lstatSync(targetDir, { throwIfNoEntry: false })) block();
  // No untrusted candidate is executed, installed as a dependency or loaded as
  // an import. The privileged publisher independently rechecks Git and reports.
  writeTrustedSource(source, original, uid, candidate);
  mkdirSync(targetDir, { mode: 0o700 });
  for (const [name, bytes] of reports) {
    writeFileSync(join(targetDir, name), bytes, { flag: 'wx', mode: 0o600 });
  }
  // The publisher rejects every untracked input outside aieo-output.
  rmSync(staging, { recursive: true });
  return { status: 'reviewed-artifact-staged', fileCount: 1 + reports.length };
}

if (process.argv[1]?.endsWith('/aieo-stage-reviewed-model.mjs')) {
  console.log(JSON.stringify(stageReviewedModelArtifact()));
}
