// Import a bounded model candidate into a FRESH, credential-free publisher job.
// Build/provider code runs on a different runner; do not execute its artifact.
import { lstatSync, readdirSync, mkdirSync, writeFileSync, rmSync,
  openSync, fstatSync, closeSync, fsyncSync, fchmodSync, renameSync,
  readSync, constants } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';
import { inspectModelReviewer } from '../aieo/lib/model-gates.mjs';

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
// Prepare the replacement on the same filesystem before touching the trusted
// source. A short write, fsync failure or rename failure must leave the
// original inode and bytes intact. Rename is the *only* mutation of the source
// path; keep the original descriptor open and re-attest it immediately before
// committing the replacement.
function writeTrustedSource(path, expected, uid, candidate) {
  let sourceFd;
  let temporaryFd;
  let temporaryPath;
  let temporaryIdentity;
  try {
    sourceFd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW |
      constants.O_NONBLOCK);
    const opened = fstatSync(sourceFd);
    const pathNow = lstatSync(path);
    if (!trustedSource(opened, uid) || !trustedSource(pathNow, uid) ||
        !sameSource(opened, expected) || !sameSource(pathNow, expected)) block();

    temporaryPath = join(dirname(path),
      '.aieo-source-' + randomBytes(16).toString('hex') + '.tmp');
    temporaryFd = openSync(temporaryPath, constants.O_WRONLY |
      constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW |
      constants.O_NONBLOCK, 0o600);
    temporaryIdentity = fstatSync(temporaryFd);
    if (!temporaryIdentity.isFile() || temporaryIdentity.nlink !== 1 ||
        temporaryIdentity.uid !== uid || (temporaryIdentity.mode & 0o777) !== 0o600) block();
    writeFileSync(temporaryFd, candidate);
    // Preserve the original safe checkout permissions (e.g. 0644), rather
    // than silently turning every imported source into an owner-only file.
    fchmodSync(temporaryFd, expected.mode & 0o777);
    const completed = fstatSync(temporaryFd);
    if (completed.dev !== temporaryIdentity.dev ||
        completed.ino !== temporaryIdentity.ino || completed.nlink !== 1 ||
        completed.size !== candidate.length ||
        (completed.mode & 0o777) !== (expected.mode & 0o777)) block();
    fsyncSync(temporaryFd);
    closeSync(temporaryFd);
    temporaryFd = undefined;

    const temporaryNow = lstatSync(temporaryPath);
    const live = fstatSync(sourceFd);
    const livePath = lstatSync(path);
    if (!temporaryNow.isFile() || temporaryNow.isSymbolicLink() ||
        temporaryNow.dev !== temporaryIdentity.dev ||
        temporaryNow.ino !== temporaryIdentity.ino ||
        !trustedSource(live, uid) || !trustedSource(livePath, uid) ||
        !sameSource(live, expected) || !sameSource(livePath, expected)) block();
    renameSync(temporaryPath, path);
    temporaryPath = undefined;
  } finally {
    if (temporaryFd !== undefined) closeSync(temporaryFd);
    if (sourceFd !== undefined) closeSync(sourceFd);
    // A failed pre-commit write must never delete a substituted file. Delete
    // only the regular temporary inode created by this invocation.
    if (temporaryPath !== undefined && temporaryIdentity !== undefined) {
      const current = lstatSync(temporaryPath, { throwIfNoEntry: false });
      if (current?.isFile() && !current.isSymbolicLink() &&
          current.dev === temporaryIdentity.dev &&
          current.ino === temporaryIdentity.ino) {
        rmSync(temporaryPath, { force: true });
      }
    }
  }
}

// The model workflow permits a single inert JSX copy edit. Reconstruct the
// precise added line without running untrusted code or external diff tools.
// The credentialed publisher independently checks the real immutable Git diff.
function singleLineDiff(original, candidate) {
  const before = original.split('\n');
  const after = candidate.split('\n');
  if (before.length !== after.length) block();
  let changed = -1;
  for (let i = 0; i < before.length; i++) {
    if (before[i] === after[i]) continue;
    if (changed !== -1 || before[i].length > 4096 ||
        after[i].length > 4096) block();
    changed = i;
  }
  if (changed === -1) block();
  return '@@ -' + (changed + 1) + ' +' + (changed + 1) + ' @@\n-' +
    before[changed] + '\n+' + after[changed] + '\n';
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
  const original = lstatSync(source);
  if (!trustedSource(original, uid)) block();
  // Canonical JSON and a valid file inode are not proof of independent review.
  // Bind the evidence to the current source bytes before altering the checkout.
  const baseline = checkedBytes(source, uid, 48000).toString('utf8');
  const candidate = checkedBytes(join(sourceDir, SOURCE), uid, 48000);
  const reports = REPORTS.map((name) =>
    [name, checkedBytes(join(reportDir, name), uid, 65536, true)]);
  const [proposal, qa, security, reviewer] = reports.map(([, bytes]) =>
    JSON.parse(bytes.toString('utf8')));
  const actual = candidate.toString('utf8');
  const diff = singleLineDiff(baseline, actual);
  // Recompute QA, Security and Reviewer verdicts from the downloaded source
  // and clean checkout while NO GitHub or model credentials are present.
  const observed = inspectModelReviewer({
    original: baseline, actual, changedPaths: [MODEL_ALLOWED_PATH],
    diff, proposal, qa, security
  });
  if (proposal?.schemaVersion !== 1 || proposal?.sourceShared !== true ||
      observed.status !== 'draft-pr-eligible' ||
      observed.requiresHumanMerge !== true ||
      JSON.stringify(observed) !== JSON.stringify(reviewer)) block();
  const parentAfter = checkDirectory(trustedComponents, uid);
  // lstat detects dangling symlinks. Reattest both source inode and parent.
  if (!sameSource(lstatSync(source), original) ||
      parentAfter.dev !== trustedParent.dev ||
      parentAfter.ino !== trustedParent.ino ||
      lstatSync(targetDir, { throwIfNoEntry: false })) block();
  // Copy verified reports BEFORE changing trusted code. Otherwise an I/O
  // failure halfway through copying leaves a dirty checkout with no complete
  // evidence handoff. Never process any unexpected output file.
  mkdirSync(targetDir, { mode: 0o700 });
  const outputDir = checkDirectory(targetDir, uid);
  try {
    for (const [name, bytes] of reports) {
      writeFileSync(join(targetDir, name), bytes, { flag: 'wx', mode: 0o600 });
    }
    checkDirectory(targetDir, uid, REPORTS);
    // No untrusted candidate is executed, installed as a dependency or
    // loaded as an import. The publisher independently rechecks the Git diff.
    writeTrustedSource(source, original, uid, candidate);
  } catch (error) {
    // Only clean up the directory we created. A replaced output path must
    // never cause deletion of an unrelated directory.
    const current = lstatSync(targetDir, { throwIfNoEntry: false });
    if (current?.isDirectory() && !current.isSymbolicLink() &&
        current.dev === outputDir.dev && current.ino === outputDir.ino) {
      rmSync(targetDir, { recursive: true, force: true });
    }
    throw error;
  }
  // The publisher rejects every untracked input outside aieo-output.
  rmSync(staging, { recursive: true });
  return { status: 'reviewed-artifact-staged', fileCount: 1 + reports.length };
}

if (process.argv[1]?.endsWith('/aieo-stage-reviewed-model.mjs')) {
  console.log(JSON.stringify(stageReviewedModelArtifact()));
}
