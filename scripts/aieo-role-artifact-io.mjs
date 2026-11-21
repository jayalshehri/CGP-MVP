// Fail-closed input reader for independently produced AIEO role handoffs.
// Inspect and read ONE opened inode with a strict byte cap. Do not trust a
// path-only lstat followed by readFileSync(path), which can follow a swapped link.
// Group/other-accessible handoffs or directories are unsafe regardless of hashes.
import { mkdirSync, lstatSync, openSync, fstatSync, readSync, writeSync, closeSync, constants } from 'node:fs';

const MAX_BYTES = 65536;
const ROLES = new Set(['developer', 'qa', 'security', 'reviewer']);
const MODEL_REPORTS = new Set(['proposal', 'qa', 'security', 'reviewer']);
function block() {
  throw new Error('AIEO role artifact rejected: untrusted file or changed evidence');
}

// Reports must belong to the runner itself. A private mode on a foreign-owned
// inode (or setuid/setgid/sticky metadata) is not valid handoff provenance.
// GitHub's downloaded artifacts are owner-normalized before reaching this reader.
function trustedOwner() {
  const uid = process.getuid?.();
  if (!Number.isSafeInteger(uid)) block();
  return uid;
}
function safeDirectory(entry, uid) {
  return entry.isDirectory() && !entry.isSymbolicLink() &&
    // Neither read nor traversal by group/other is permitted: report names\n    // and future evidence must never be discoverable through a public folder.\n    entry.uid === uid && !(entry.mode & 0o7077);
}
function safeReportFile(entry, uid) {
  return entry.isFile() && !entry.isSymbolicLink() &&
    entry.nlink === 1 && entry.uid === uid &&
    Boolean(entry.mode & 0o400) && !(entry.mode & 0o7177);
}

export function readBoundedRoleReport(role) {
  if (!ROLES.has(role)) block();
  // Candidate reports use the same canonical JSON writer as the foundation.
  // Reject duplicate-key shadowing and noncanonical trailing bytes.
  return readTrustedJsonReport('aieo-output/candidate-' + role + '.json', true);
}

// Model handoffs also contain untrusted provider-derived data. Never read them
// through an unbounded or link-following path before the Draft PR publisher.
// All model-role reports use the canonical JSON writer, including the initial
// provider proposal. Reject duplicate-key shadowing and noncanonical bytes.
export function readBoundedModelReport(kind) {
  if (!MODEL_REPORTS.has(kind)) block();
  return readTrustedJsonReport('aieo-output/model-' + kind + '.json', true);
}

// The foundation's downloadable CI artifacts are read-only evidence. Apply the
// same inode/size/UTF-8 checks as the candidate pipeline, and additionally
// reject noncanonical JSON (including duplicate-key shadowing).
export function readBoundedFoundationRoleReport(role) {
  if (!ROLES.has(role)) block();
  return readTrustedJsonReport('aieo-output/' + role + '.json', true);
}

export function writeExclusiveFoundationRoleReport(role, report) {
  if (!ROLES.has(role)) block();
  return writeExclusiveReport('aieo-output/' + role + '.json', report);
}

// QA, Security and Reviewer reports are handoffs just as sensitive as their
// inputs. Never let an existing path (symlink, hardlink, or ordinary file) be
// truncated by a later role. Each role produces one exclusive report per run.
export function writeExclusiveModelRoleReport(role, report) {
  if (!new Set(['qa', 'security', 'reviewer']).has(role)) block();
  return writeExclusiveReport('aieo-output/model-' + role + '.json', report);
}

function writeExclusiveReport(path, report) {
  let fd;
  try {
    const data = Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8');
    if (data.length < 2 || data.length > MAX_BYTES) block();
    mkdirSync('aieo-output', { recursive: true, mode: 0o700 });
    const uid = trustedOwner();
    const directory = lstatSync('aieo-output');
    if (!safeDirectory(directory, uid)) block();
    // Exclusivity must be enforced by the open syscall, not an earlier
    // existence check. O_NOFOLLOW adds another barrier to alias swaps.
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT |
      constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    let used = 0;
    while (used < data.length) {
      const count = writeSync(fd, data, used, data.length - used);
      if (count <= 0) block();
      used += count;
    }
    const file = fstatSync(fd);
    const current = lstatSync(path);
    const directoryNow = lstatSync('aieo-output');
    if (!safeReportFile(file, uid) || file.size !== data.length ||
        !safeReportFile(current, uid) ||
        current.dev !== file.dev || current.ino !== file.ino ||
        current.size !== file.size ||
        // A same-inode write or touch after fstat cannot borrow the
        // descriptor's approval at the final pathname boundary.
        current.mtimeMs !== file.mtimeMs ||
        current.ctimeMs !== file.ctimeMs ||
        !safeDirectory(directoryNow, uid) ||
        directoryNow.dev !== directory.dev || directoryNow.ino !== directory.ino) block();
  } catch {
    block();
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function readTrustedJsonReport(path, canonical = false) {
  let fd;
  try {
    const uid = trustedOwner();
    const directory = lstatSync('aieo-output');
    if (!safeDirectory(directory, uid)) block();
    const before = lstatSync(path);
    if (!safeReportFile(before, uid) ||
        before.size < 2 || before.size > MAX_BYTES) block();

    // O_NOFOLLOW refuses a symlink swapped into the final path after lstat.
    // O_NONBLOCK prevents an adversarial FIFO swap from hanging before fstat.
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const file = fstatSync(fd);
    if (!safeReportFile(file, uid) ||
        file.dev !== before.dev || file.ino !== before.ino ||
        file.size !== before.size ||
        // A same-inode rewrite or chmod between lstat and open must not
        // silently become a different report than the path we attested.
        file.mtimeMs !== before.mtimeMs || file.ctimeMs !== before.ctimeMs ||
        file.size < 2 || file.size > MAX_BYTES) block();
    const bytes = Buffer.alloc(file.size + 1);
    let used = 0;
    while (used < bytes.length) {
      const count = readSync(fd, bytes, used, bytes.length - used, null);
      if (count === 0) break;
      used += count;
    }
    // An added byte or a shorter read invalidates the handoff, even when the
    // underlying file is mutated concurrently during the read.
    const after = fstatSync(fd);
    // Attest the directory entry as well as the opened fd. A same-byte file
    // swapped into this name during read is not the reviewed evidence inode.
    const currentPath = lstatSync(path);
    const currentDirectory = lstatSync('aieo-output');
    if (used !== file.size || after.size !== file.size ||
        !safeReportFile(after, uid) ||
        after.mtimeMs !== file.mtimeMs || after.ctimeMs !== file.ctimeMs ||
        !safeReportFile(currentPath, uid) ||
        currentPath.dev !== file.dev || currentPath.ino !== file.ino ||
        currentPath.size !== file.size ||
        // The filename may still point at the SAME inode while its contents
        // or permissions change after final fstat. Match its metadata too.
        currentPath.mtimeMs !== after.mtimeMs ||
        currentPath.ctimeMs !== after.ctimeMs ||
        !safeDirectory(currentDirectory, uid) ||
        currentDirectory.dev !== directory.dev || currentDirectory.ino !== directory.ino) block();
    // Buffer.toString('utf8') silently replaces malformed byte sequences with
    // U+FFFD. Handoff evidence must not be interpreted as text different from
    // its original bytes, even when the lossy result happens to be valid JSON.
    const raw = bytes.subarray(0, used);
    const json = raw.toString('utf8');
    if (!Buffer.from(json, 'utf8').equals(raw)) block();
    const parsed = JSON.parse(json);
    // Foundation handoffs are emitted by our own canonical JSON writer.
    // JSON.parse alone accepts shadowed keys, leaving unreviewed raw content
    // inside an artifact even when the last duplicate value is valid.
    if (canonical && json !== JSON.stringify(parsed, null, 2) + '\n') block();
    return parsed;
  } catch { block(); }
  finally { if (fd !== undefined) closeSync(fd); }
}
