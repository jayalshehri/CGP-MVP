// Fail-closed input reader for independently produced AIEO role handoffs.
// Inspect and read ONE opened inode with a strict byte cap. Do not trust a
// path-only lstat followed by readFileSync(path), which can follow a swapped link.
// Group/world-writable handoffs or directories are unsafe regardless of hashes.
import { mkdirSync, lstatSync, openSync, fstatSync, readSync, writeSync, closeSync, constants } from 'node:fs';

const MAX_BYTES = 65536;
const ROLES = new Set(['developer', 'qa', 'security', 'reviewer']);
const MODEL_REPORTS = new Set(['proposal', 'qa', 'security', 'reviewer']);
function block() {
  throw new Error('AIEO role artifact rejected: untrusted file or changed evidence');
}

export function readBoundedRoleReport(role) {
  if (!ROLES.has(role)) block();
  return readTrustedJsonReport('aieo-output/candidate-' + role + '.json');
}

// Model handoffs also contain untrusted provider-derived data. Never read them
// through an unbounded or link-following path before the Draft PR publisher.
export function readBoundedModelReport(kind) {
  if (!MODEL_REPORTS.has(kind)) block();
  return readTrustedJsonReport('aieo-output/model-' + kind + '.json');
}

// QA, Security and Reviewer reports are handoffs just as sensitive as their
// inputs. Never let an existing path (symlink, hardlink, or ordinary file) be
// truncated by a later role. Each role produces one exclusive report per run.
export function writeExclusiveModelRoleReport(role, report) {
  if (!new Set(['qa', 'security', 'reviewer']).has(role)) block();
  let fd;
  try {
    const data = Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8');
    if (data.length < 2 || data.length > MAX_BYTES) block();
    mkdirSync('aieo-output', { recursive: true, mode: 0o700 });
    const directory = lstatSync('aieo-output');
    if (!directory.isDirectory() || directory.isSymbolicLink() ||
        (directory.mode & 0o022)) block();
    const path = 'aieo-output/model-' + role + '.json';
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
    if (!file.isFile() || file.nlink !== 1 || (file.mode & 0o133) ||
        file.size !== data.length ||
        !current.isFile() || current.isSymbolicLink() ||
        current.dev !== file.dev || current.ino !== file.ino ||
        !directoryNow.isDirectory() || directoryNow.isSymbolicLink() ||
        (directoryNow.mode & 0o022) ||
        directoryNow.dev !== directory.dev || directoryNow.ino !== directory.ino) block();
  } catch {
    block();
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function readTrustedJsonReport(path) {
  let fd;
  try {
    const directory = lstatSync('aieo-output');
    if (!directory.isDirectory() || directory.isSymbolicLink() ||
        (directory.mode & 0o022)) block();
    const before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 ||
        (before.mode & 0o133) || before.size < 2 || before.size > MAX_BYTES) block();

    // O_NOFOLLOW refuses a symlink swapped into the final path after lstat.
    // O_NONBLOCK prevents an adversarial FIFO swap from hanging before fstat.
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const file = fstatSync(fd);
    if (!file.isFile() || file.nlink !== 1 || (file.mode & 0o133) ||
        file.dev !== before.dev || file.ino !== before.ino ||
        file.size !== before.size || file.size < 2 || file.size > MAX_BYTES) block();
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
        after.nlink !== 1 || (after.mode & 0o133) ||
        after.mtimeMs !== file.mtimeMs || after.ctimeMs !== file.ctimeMs ||
        !currentPath.isFile() || currentPath.isSymbolicLink() ||
        currentPath.nlink !== 1 || (currentPath.mode & 0o133) ||
        currentPath.dev !== file.dev || currentPath.ino !== file.ino ||
        currentPath.size !== file.size ||
        !currentDirectory.isDirectory() || currentDirectory.isSymbolicLink() ||
        (currentDirectory.mode & 0o022) ||
        currentDirectory.dev !== directory.dev || currentDirectory.ino !== directory.ino) block();
    return JSON.parse(bytes.toString('utf8', 0, used));
  } catch { block(); }
  finally { if (fd !== undefined) closeSync(fd); }
}
