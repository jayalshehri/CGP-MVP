// All deterministic roles read only one approved, bounded checkout file.
// Check the path and the opened descriptor before consuming any source bytes.
import {
  lstatSync, realpathSync, openSync, fstatSync, readSync, closeSync, constants
} from 'node:fs';
import { resolve } from 'node:path';
import { APPROVED_PATH } from './engine.mjs';

const MAX_SOURCE_BYTES = 512 * 1024;
const BAD_SOURCE = 'Unsafe or oversized AIEO approved source';

export function readApprovedSource() {
  const absolute = resolve(process.cwd(), APPROVED_PATH);
  let fd;
  try {
    const before = lstatSync(absolute);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 ||
        before.size < 1 || before.size > MAX_SOURCE_BYTES ||
        realpathSync(absolute) !== absolute) {
      throw new Error(BAD_SOURCE);
    }
    // NONBLOCK prevents a swapped-in FIFO/device from holding the runner.
    // NOFOLLOW blocks a final-component symlink substitution.
    fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 ||
        opened.dev !== before.dev || opened.ino !== before.ino ||
        opened.size !== before.size) {
      throw new Error(BAD_SOURCE);
    }
    const chunks = [];
    const chunk = Buffer.alloc(64 * 1024);
    let total = 0;
    while (total <= MAX_SOURCE_BYTES) {
      const count = readSync(fd, chunk, 0,
        Math.min(chunk.length, MAX_SOURCE_BYTES + 1 - total), null);
      if (count === 0) break;
      total += count;
      if (total > MAX_SOURCE_BYTES) throw new Error(BAD_SOURCE);
      chunks.push(Buffer.from(chunk.subarray(0, count)));
    }
    const after = fstatSync(fd);
    if (!after.isFile() || after.nlink !== 1 ||
        after.dev !== opened.dev || after.ino !== opened.ino ||
        after.size !== total || total < 1 ||
        realpathSync(absolute) !== absolute) {
      throw new Error(BAD_SOURCE);
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, total));
    } catch {
      throw new Error(BAD_SOURCE);
    }
  } catch {
    // Avoid exposing a redirected path or untrusted file bytes in errors/logs.
    throw new Error(BAD_SOURCE);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
