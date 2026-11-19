// Bound a deterministic developer patch to a FRESH, credential-free publishing runner.
// Neither untrusted dependencies nor candidate code runs in this privileged job.
import {
  lstatSync, readdirSync, writeFileSync, rmSync,
  openSync, closeSync, fstatSync, ftruncateSync, readSync, constants
} from 'node:fs';
import { join } from 'node:path';
import { APPROVED_TASK, orchestrate } from '../aieo/lib/engine.mjs';

const FILE = 'FeedbackWidget.tsx';
const MAX_BYTES = 48000;
function block() {
  throw new Error('AIEO developer artifact stage blocked: untrusted input');
}
function sameFile(actual, expected) {
  return actual.dev === expected.dev && actual.ino === expected.ino &&
    actual.mode === expected.mode && actual.size === expected.size &&
    actual.mtimeMs === expected.mtimeMs && actual.ctimeMs === expected.ctimeMs;
}
function sameDirectory(actual, expected) {
  return actual.dev === expected.dev && actual.ino === expected.ino &&
    actual.mode === expected.mode && actual.uid === expected.uid;
}
function safeDirectory(path, uid, expectedEntries) {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() ||
      stat.uid !== uid || (stat.mode & 0o0022)) block();
  if (expectedEntries &&
      JSON.stringify(readdirSync(path).sort()) !==
      JSON.stringify([...expectedEntries].sort())) block();
  return stat;
}
function safeFileStat(stat, uid) {
  return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 &&
    stat.uid === uid && !(stat.mode & 0o0022) &&
    stat.size >= 1 && stat.size <= MAX_BYTES;
}
function safeWritableSource(stat, uid) {
  return safeFileStat(stat, uid) &&
    (stat.mode & 0o600) === 0o600 && !(stat.mode & 0o7133);
}
// Never read by pathname after lstat: a downloaded artifact can be swapped
// for a symlink or enlarged before readFileSync reaches EOF. Bind reads to a
// verified descriptor, cap total bytes, and re-attest descriptor and pathname.
function safeFile(path, uid, writable = false) {
  const before = lstatSync(path);
  if (!safeFileStat(before, uid) ||
      (writable && !safeWritableSource(before, uid))) block();
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW |
      constants.O_NONBLOCK);
    if (!safeFileStat(fstatSync(fd), uid) ||
        !sameFile(fstatSync(fd), before) ||
        !sameFile(lstatSync(path), before)) block();
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < before.size) {
      const n = readSync(fd, bytes, offset, before.size - offset, null);
      if (n <= 0) block();
      offset += n;
    }
    if (readSync(fd, Buffer.alloc(1), 0, 1, null) !== 0 ||
        !sameFile(fstatSync(fd), before) ||
        !sameFile(lstatSync(path), before) ||
        !safeFileStat(fstatSync(fd), uid)) block();
    const text = bytes.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(bytes)) block();
    return { bytes, stat: before };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
// The trusted source must still be the same privately writable inode when
// opened for writing. Never truncate via a filename, which follows symlinks.
function writeVerifiedSource(path, original, uid, candidate, parent, parentStat) {
  if (!sameDirectory(safeDirectory(parent, uid), parentStat)) block();
  let fd;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_NOFOLLOW |
      constants.O_NONBLOCK);
    const opened = fstatSync(fd);
    const current = lstatSync(path);
    if (!safeWritableSource(opened, uid) ||
        !safeWritableSource(current, uid) ||
        !sameFile(opened, original) || !sameFile(current, original) ||
        !sameDirectory(safeDirectory(parent, uid), parentStat)) block();
    ftruncateSync(fd, 0);
    writeFileSync(fd, candidate);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function stageReviewedDeveloperArtifact({
  cwd = process.cwd(), env = process.env
} = {}) {
  // A supplied test environment cannot conceal credentials in the live process.
  // The publisher receives GH_TOKEN ONLY in the subsequent, separate step.
  if (['GH_TOKEN', 'GITHUB_TOKEN', 'OPENROUTER_API_KEY'].some(
    (name) => env[name] || process.env[name])) block();
  const uid = process.getuid?.();
  if (!Number.isSafeInteger(uid)) block();
  const staging = join(cwd, 'aieo-staging');
  const stagedComponents = join(staging, 'components');
  const trustedComponents = join(cwd, 'components');
  const target = join(trustedComponents, FILE);
  // Reject unexpected artifacts and unsafe parents before source writes.
  safeDirectory(staging, uid, ['components']);
  safeDirectory(stagedComponents, uid, [FILE]);
  const trustedParent = safeDirectory(trustedComponents, uid);
  const baseline = safeFile(target, uid, true);
  const candidate = safeFile(join(stagedComponents, FILE), uid);
  // The downloaded artifact is untrusted even after inode and UTF-8 checks.
  // Reproduce the exact one-file deterministic fix from trusted source BEFORE
  // writing any candidate bytes into the clean publisher checkout. The later
  // credentialed publisher repeats this attestation independently.
  const reviewed = orchestrate({ task: APPROVED_TASK, source: baseline.bytes.toString('utf8') });
  if (reviewed.developer.status !== 'proposed' ||
      reviewed.developer.patchedSource !== candidate.bytes.toString('utf8') ||
      reviewed.qa.status !== 'passed' ||
      reviewed.security.status !== 'passed' ||
      reviewed.reviewer.status !== 'draft-pr-eligible' ||
      reviewed.reviewer.requiresHumanMerge !== true) block();
  writeVerifiedSource(target, baseline.stat, uid, candidate.bytes,
    trustedComponents, trustedParent);
  rmSync(staging, { recursive: true });
  // The credentialed publisher independently reproduces the patch from HEAD
  // and re-attests the single-file Git diff before any remote write.
  return { status: 'developer-artifact-staged', files: 1 };
}

if (process.argv[1]?.endsWith('/aieo-stage-reviewed-developer.mjs')) {
  console.log(JSON.stringify(stageReviewedDeveloperArtifact()));
}
