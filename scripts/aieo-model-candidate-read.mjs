// Shared, bounded working-tree reader for the independent model QA and Security
// CLI processes. The local candidate is untrusted until the later publisher
// independently reattests the exact same Git diff and immutable commit.
import { lstatSync, openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';

const MAX_SOURCE_BYTES = 48000;
function block() {
  throw new Error('AIEO independent model review blocked: untrusted candidate source');
}

export function readVerifiedModelCandidate() {
  let fd;
  try {
    // A private-looking inode from another uid or with special permission bits
    // is not an acceptable local candidate for an independent review role.
    // GitHub's Linux checkout files belong to the current runner uid.
    const uid = process.getuid?.();
    if (!Number.isSafeInteger(uid)) block();
    const directory = lstatSync('components');
    const before = lstatSync(MODEL_ALLOWED_PATH);
    if (!directory.isDirectory() || directory.isSymbolicLink() ||
        directory.uid !== uid || (directory.mode & 0o7022) ||
        !before.isFile() || before.isSymbolicLink() || before.nlink !== 1 ||
        before.uid !== uid || !(before.mode & 0o400) ||
        (before.mode & 0o7133) ||
        before.size < 1 || before.size > MAX_SOURCE_BYTES) block();

    // NOFOLLOW prevents a last-component symlink swap. NONBLOCK prevents
    // an attacker-supplied FIFO from hanging the role before fstat.
    fd = openSync(MODEL_ALLOWED_PATH,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.uid !== uid ||
        !(opened.mode & 0o400) ||
        (opened.mode & 0o7133) ||
        opened.dev !== before.dev || opened.ino !== before.ino ||
        opened.size !== before.size ||
        opened.mtimeMs !== before.mtimeMs ||
        opened.ctimeMs !== before.ctimeMs) block();

    const bytes = Buffer.alloc(opened.size + 1);
    let used = 0;
    while (used < bytes.length) {
      const count = readSync(fd, bytes, used, bytes.length - used, null);
      if (count === 0) break;
      used += count;
    }
    const after = fstatSync(fd);
    const pathname = lstatSync(MODEL_ALLOWED_PATH);
    const directoryNow = lstatSync('components');
    if (used !== opened.size || after.size !== opened.size ||
        after.nlink !== 1 || after.uid !== uid ||
        !(after.mode & 0o400) || (after.mode & 0o7133) ||
        after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs ||
        !pathname.isFile() || pathname.isSymbolicLink() ||
        pathname.nlink !== 1 || pathname.uid !== uid ||
        !(pathname.mode & 0o400) ||
        (pathname.mode & 0o7133) ||
        pathname.dev !== opened.dev || pathname.ino !== opened.ino ||
        pathname.size !== opened.size ||
        !directoryNow.isDirectory() || directoryNow.isSymbolicLink() ||
        directoryNow.uid !== uid || (directoryNow.mode & 0o7022) ||
        directoryNow.dev !== directory.dev || directoryNow.ino !== directory.ino) block();

    const text = bytes.toString('utf8', 0, used);
    // Reject malformed UTF-8 rather than letting the decoder silently
    // replace adversarial byte sequences with U+FFFD in review evidence.
    if (!Buffer.from(text, 'utf8').equals(bytes.subarray(0, used))) block();
    return text;
  } catch { block(); }
  finally { if (fd !== undefined) closeSync(fd); }
}
