// A model proposal must never overwrite an existing path or follow an artifact alias.
// Reserve an exclusive private report before contacting any optional provider.
import {
  mkdirSync, lstatSync, openSync, writeSync, closeSync, fstatSync, constants
} from 'node:fs';

const DIR = 'aieo-output';
const PATH = DIR + '/model-proposal.json';
const MAX_BYTES = 65536;
function block() {
  throw new Error('AIEO model proposal report blocked: unsafe output destination');
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
    if (!directory.isDirectory() || directory.isSymbolicLink() ||
        (directory.mode & 0o022)) block();
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

export function writeExclusiveModelProposalReport(report) {
  const directory = assertModelProposalDestination();
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8');
  if (bytes.length < 2 || bytes.length > MAX_BYTES) block();
  let fd;
  try {
    // O_EXCL and O_NOFOLLOW refuse existing files and symlinks rather than
    // truncating an attacker-controlled target (including a hardlink).
    fd = openSync(PATH, constants.O_WRONLY | constants.O_CREAT |
      constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    let written = 0;
    while (written < bytes.length) {
      const count = writeSync(fd, bytes, written, bytes.length - written);
      if (count <= 0) block();
      written += count;
    }
    const file = fstatSync(fd);
    const path = lstatSync(PATH);
    const currentDirectory = lstatSync(DIR);
    if (!file.isFile() || file.nlink !== 1 || (file.mode & 0o133) ||
        file.size !== bytes.length ||
        !path.isFile() || path.isSymbolicLink() ||
        path.dev !== file.dev || path.ino !== file.ino ||
        !currentDirectory.isDirectory() || currentDirectory.isSymbolicLink() ||
        (currentDirectory.mode & 0o022) ||
        currentDirectory.dev !== directory.dev || currentDirectory.ino !== directory.ino) block();
  } catch {
    block();
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
