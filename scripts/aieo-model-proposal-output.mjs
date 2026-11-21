// A model proposal must never overwrite an existing path or follow an artifact alias.
// Reserve an exclusive private report before contacting any optional provider.
import {
  mkdirSync, lstatSync, openSync, readSync, writeSync, closeSync, fstatSync, constants
} from 'node:fs';

const DIR = 'aieo-output';
const PATH = DIR + '/model-proposal.json';
const MAX_BYTES = 65536;
function block() {
  throw new Error('AIEO model proposal report blocked: unsafe output destination');
}

// Proposal preflight precedes the optional provider call. An apparently safe
// mode is not sufficient when the evidence directory belongs to another uid,
// has group/other read/traversal or setuid/setgid/sticky bits. Never share source
// with the provider from a publicly accessible evidence directory.
function runnerUid() {
  const uid = process.getuid?.();
  if (!Number.isSafeInteger(uid)) block();
  return uid;
}
function safeEvidenceDirectory(entry, uid) {
  return entry.isDirectory() && !entry.isSymbolicLink() &&
    entry.uid === uid && !(entry.mode & 0o7077);
}
function safeProposalFile(entry, uid) {
  return entry.isFile() && !entry.isSymbolicLink() &&
    entry.nlink === 1 && entry.uid === uid &&
    Boolean(entry.mode & 0o400) && !(entry.mode & 0o7177);
}

export function assertModelProposalDestination() {
  try {
    mkdirSync(DIR, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') block();
  }
  let directory;
  try {
    directory = lstatSync(DIR);
    if (!safeEvidenceDirectory(directory, runnerUid())) block();
    let present = true;
    try { lstatSync(PATH); } catch (error) {
      if (error.code === 'ENOENT') present = false;
      else block();
    }
    if (present) block();
  } catch {
    block();
  }
  return directory;
}

// The report directory must be the SAME inode attested before the provider call.
// A replacement (even a new safe-looking directory) must never receive the report.
export function writeExclusiveModelProposalReport(report, approvedDirectory) {
  const directory = assertModelProposalDestination();
  if (!approvedDirectory || directory.dev !== approvedDirectory.dev ||
      directory.ino !== approvedDirectory.ino) block();
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8');
  if (bytes.length < 2 || bytes.length > MAX_BYTES) block();
  let fd;
  try {
    // O_EXCL and O_NOFOLLOW refuse existing files and symlinks rather than
    // truncating an attacker-controlled target (including a hardlink).
    fd = openSync(PATH, constants.O_RDWR | constants.O_CREAT |
      constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    let written = 0;
    while (written < bytes.length) {
      const count = writeSync(fd, bytes, written, bytes.length - written);
      if (count <= 0) block();
      written += count;
    }
    // A completed write is not proof that the provider proposal was stored
    // unmodified. Re-read the same exclusively created inode before accepting
    // its report (never follow a pathname after the original safe open).
    const echoed = Buffer.alloc(bytes.length + 1);
    let got = 0;
    while (got < echoed.length) {
      const count = readSync(fd, echoed, got, echoed.length - got, got);
      if (count === 0) break;
      got += count;
    }
    if (got !== bytes.length || !echoed.subarray(0, got).equals(bytes)) block();
    const file = fstatSync(fd);
    const path = lstatSync(PATH);
    const currentDirectory = lstatSync(DIR);
    const uid = runnerUid();
    if (!safeProposalFile(file, uid) || file.size !== bytes.length ||
        !safeProposalFile(path, uid) ||
        path.dev !== file.dev || path.ino !== file.ino ||
        path.size !== file.size ||
        // Refuse a same-inode metadata rewrite between final fstat and lstat.
        // The proposal must be exactly the bytes the output writer attested.
        path.mtimeMs !== file.mtimeMs ||
        path.ctimeMs !== file.ctimeMs ||
        !safeEvidenceDirectory(currentDirectory, uid) ||
        currentDirectory.dev !== directory.dev || currentDirectory.ino !== directory.ino) block();
  } catch {
    block();
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
