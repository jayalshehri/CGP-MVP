// Consume only bounded bytes from an already-attested handoff descriptor.
// readFileSync(fd) reads until EOF, so a downloaded artifact growing after
// fstat could otherwise exhaust memory before a post-read size check.
// Read at most expectedSize + 1 bytes to detect growth, and fail closed.
import { readSync } from 'node:fs';

export const MAX_HANDOFF_BYTES = 16 * 1024;

export function readBoundedHandoff(fd, expectedSize) {
  if (!Number.isSafeInteger(expectedSize) ||
      expectedSize < 2 || expectedSize > MAX_HANDOFF_BYTES) {
    throw new Error('Unsafe AIEO handoff size');
  }
  const buffer = Buffer.allocUnsafe(expectedSize + 1);
  let total = 0;
  while (total < buffer.length) {
    const bytes = readSync(fd, buffer, total, buffer.length - total, null);
    if (bytes === 0) break;
    total += bytes;
  }
  if (total !== expectedSize) {
    throw new Error('AIEO handoff changed during bounded read');
  }
  return buffer.subarray(0, total);
}
