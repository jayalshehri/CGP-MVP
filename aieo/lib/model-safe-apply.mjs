// Apply an already-validated, bounded proposal to the local checkout only.
// Never truncate the approved inode by pathname: stage a new inode in the same
// directory and rename it over the approved filename after a final strict read.
// A rename replaces a final-component symlink instead of following it.
// This does not authorize a Git commit, remote write, merge or deployment.
import {
  constants, lstatSync, openSync, writeFileSync, fchmodSync, fsyncSync,
  fstatSync, closeSync, renameSync, unlinkSync
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { MODEL_ALLOWED_PATH } from './model-provider.mjs';
import { readApprovedSource } from './safe-source.mjs';

export function applyModelCandidate({ original, candidate }) {
  if (typeof original !== 'string' || typeof candidate !== 'string' ||
      !original || original === candidate) {
    throw new Error('Invalid local model candidate');
  }
  if (readApprovedSource() !== original) {
    throw new Error('Approved model source changed before local apply');
  }
  const absolute = resolve(process.cwd(), MODEL_ALLOWED_PATH);
  const before = lstatSync(absolute);
  if (!before.isFile() || before.nlink !== 1) {
    throw new Error('Approved model source changed before local apply');
  }
  const staged = join(dirname(absolute), '.aieo-model-stage-' + randomBytes(16).toString('hex'));
  let fd;
  try {
    // Exclusively create the staged output. It is not a hardlink to the
    // approved source, so writing cannot mutate that source or its hardlinks.
    fd = openSync(staged,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600);
    writeFileSync(fd, candidate, { encoding: 'utf8' });
    fchmodSync(fd, before.mode & 0o777);
    fsyncSync(fd);
    const written = fstatSync(fd);
    if (!written.isFile() || written.nlink !== 1 ||
        written.size !== Buffer.byteLength(candidate, 'utf8')) {
      throw new Error('Staged model candidate is not an ordinary complete file');
    }
    closeSync(fd);
    fd = undefined;

    // Catch byte changes while staging. The final rename is atomic at the
    // pathname level and never writes through the old source file descriptor.
    if (readApprovedSource() !== original) {
      throw new Error('Approved model source changed before local apply');
    }
    renameSync(staged, absolute);
    if (readApprovedSource() !== candidate) {
      throw new Error('Applied model candidate failed final source attestation');
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
    try {
      unlinkSync(staged);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}
