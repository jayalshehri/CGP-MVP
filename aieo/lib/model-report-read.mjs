// Independently consume only bounded JSON model evidence after the prior role.
// A pathname readFileSync() may follow a swapped symlink or buffer arbitrarily
// large output before JSON.parse rejects it. Attest the opened descriptor too.
// Reports are evidence, never commands or trusted instructions.
import {
  lstatSync, realpathSync, openSync, fstatSync, closeSync, constants
} from 'node:fs';
import { resolve } from 'node:path';
import { MAX_HANDOFF_BYTES, readBoundedHandoff } from './bounded-handoff-read.mjs';

const REPORT_ROLES = new Set(['proposal', 'qa', 'security', 'reviewer']);
const BAD_REPORT = 'Unsafe AIEO model report';

export function readModelReport(role) {
  if (!REPORT_ROLES.has(role)) throw new Error(BAD_REPORT);
  const absolute = resolve(process.cwd(), 'aieo-output', 'model-' + role + '.json');
  let fd;
  try {
    const before = lstatSync(absolute);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 ||
        before.size < 2 || before.size > MAX_HANDOFF_BYTES ||
        realpathSync(absolute) !== absolute) {
      throw new Error(BAD_REPORT);
    }
    // Reject a final-component symlink/FIFO swap without blocking on it.
    fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 ||
        opened.dev !== before.dev || opened.ino !== before.ino ||
        opened.size !== before.size) {
      throw new Error(BAD_REPORT);
    }
    const bytes = readBoundedHandoff(fd, before.size);
    const after = fstatSync(fd);
    if (!after.isFile() || after.nlink !== 1 ||
        after.dev !== opened.dev || after.ino !== opened.ino ||
        after.size !== before.size || realpathSync(absolute) !== absolute) {
      throw new Error(BAD_REPORT);
    }
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(BAD_REPORT);
    }
    return parsed;
  } catch {
    // Do not leak artifact contents, redirected paths or JSON parsing errors.
    throw new Error(BAD_REPORT);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
