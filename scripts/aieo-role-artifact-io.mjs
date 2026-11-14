// Fail-closed input reader for independently produced AIEO role handoffs.
// Inspect and read ONE opened inode with a strict byte cap. Do not trust a
// path-only lstat followed by readFileSync(path), which can follow a swapped link.
// Group/world-writable handoffs or directories are unsafe regardless of hashes.
import { lstatSync, openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';

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
    const currentDirectory = lstatSync('aieo-output');
    if (used !== file.size || after.size !== file.size ||
        after.nlink !== 1 || (after.mode & 0o133) ||
        after.mtimeMs !== file.mtimeMs || after.ctimeMs !== file.ctimeMs ||
        !currentDirectory.isDirectory() || currentDirectory.isSymbolicLink() ||
        (currentDirectory.mode & 0o022) ||
        currentDirectory.dev !== directory.dev || currentDirectory.ino !== directory.ino) block();
    return JSON.parse(bytes.toString('utf8', 0, used));
  } catch { block(); }
  finally { if (fd !== undefined) closeSync(fd); }
}
