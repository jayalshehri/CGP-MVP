// GitHub's artifact unzip restores files with 0644 permissions, even if the
// producing role wrote 0600. Re-private an exact, isolated set of downloaded
// handoffs before the strict evidence reader examines their bytes.
// This is an import boundary, NOT an approval of any claims inside a report.
import { readdirSync, lstatSync, openSync, fstatSync, fchmodSync, closeSync, constants } from 'node:fs';

const MAX_BYTES = 65536;
const SAFE_SETS = [
  ['developer'],
  ['developer', 'qa', 'security']
];
const fail = () => { throw new Error('AIEO imported handoff rejected: unsafe artifact'); };

export function privatizeDownloadedHandoffs(kind, roles) {
  if (!['foundation', 'candidate'].includes(kind) ||
      !Array.isArray(roles) ||
      !SAFE_SETS.some(set => JSON.stringify(set) === JSON.stringify(roles))) fail();
  const prefix = kind === 'candidate' ? 'candidate-' : '';
  const expected = roles.map(role => prefix + role + '.json');
  const root = 'aieo-output';
  // Artifact extraction must not launder another user's or owner-unreadable
  // inode into trusted 0600 evidence. Hosted Linux runners expose a uid.
  const owner = process.getuid?.();
  if (!Number.isSafeInteger(owner)) fail();
  try {
    const directory = lstatSync(root);
    if (!directory.isDirectory() || directory.isSymbolicLink() ||
        directory.uid !== owner || (directory.mode & 0o022)) fail();
    const names = readdirSync(root).sort();
    if (JSON.stringify(names) !== JSON.stringify([...expected].sort())) fail();
    // Phase 1: validate the COMPLETE downloaded bundle before chmod on any
    // member. A late invalid QA/Security handoff must not privatize an earlier
    // Developer report and leave a partially accepted import behind.
    // Phase 2 below repeats all inode checks before each mutation to resist
    // races; it is not a filesystem transaction against concurrent writers.
    for (const name of expected) {
      const path = root + '/' + name;
      let fd;
      try {
        const before = lstatSync(path);
        if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 ||
            before.uid !== owner || !(before.mode & 0o400) ||
            (before.mode & 0o7133) ||
            before.size < 2 || before.size > MAX_BYTES) fail();
        fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        const opened = fstatSync(fd);
        if (!opened.isFile() || opened.nlink !== 1 || opened.uid !== owner ||
            !(opened.mode & 0o400) || (opened.mode & 0o7133) ||
            opened.dev !== before.dev || opened.ino !== before.ino ||
            opened.size !== before.size || opened.mtimeMs !== before.mtimeMs ||
            opened.ctimeMs !== before.ctimeMs) fail();
      } finally {
        if (fd !== undefined) closeSync(fd);
      }
    }
    for (const name of expected) {
      const path = root + '/' + name;
      let fd;
      try {
        const before = lstatSync(path);
        // 0644 is the documented upload/download artifact extraction mode.
        // Do not tolerate a writable, executable, linked, or oversized file.
        if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 ||
            before.uid !== owner || !(before.mode & 0o400) ||
            (before.mode & 0o7133) ||
            before.size < 2 || before.size > MAX_BYTES) fail();
        fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        const opened = fstatSync(fd);
        if (!opened.isFile() || opened.nlink !== 1 || opened.uid !== owner ||
            !(opened.mode & 0o400) || (opened.mode & 0o7133) ||
            opened.dev !== before.dev || opened.ino !== before.ino ||
            opened.size !== before.size || opened.mtimeMs !== before.mtimeMs ||
            opened.ctimeMs !== before.ctimeMs) fail();
        // Restrict the opened inode itself, never chmod(path) after lstat:
        // a swapped symlink/path must not chmod an external target.
        fchmodSync(fd, 0o600);
        const after = fstatSync(fd);
        const current = lstatSync(path);
        const directoryNow = lstatSync(root);
        if (!after.isFile() || after.nlink !== 1 || after.uid !== owner ||
            (after.mode & 0o7177) ||
            after.size !== opened.size || after.mtimeMs !== opened.mtimeMs ||
            !current.isFile() || current.isSymbolicLink() || current.nlink !== 1 ||
            current.uid !== owner || (current.mode & 0o7177) ||
            current.dev !== after.dev || current.ino !== after.ino ||
            current.size !== after.size ||
            !directoryNow.isDirectory() || directoryNow.isSymbolicLink() ||
            directoryNow.uid !== owner || (directoryNow.mode & 0o022) ||
            directoryNow.dev !== directory.dev || directoryNow.ino !== directory.ino) fail();
      } finally {
        if (fd !== undefined) closeSync(fd);
      }
    }
  } catch { fail(); }
  return true;
}

if (process.argv[1]?.endsWith('/aieo-import-handoffs.mjs')) {
  privatizeDownloadedHandoffs(process.argv[2], process.argv.slice(3));
  console.log('AIEO downloaded handoff mode normalized without trusting its contents');
}
