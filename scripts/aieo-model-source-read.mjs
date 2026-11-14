// Read a trusted, unchanged source inode BEFORE any optional external-model request.
// The publisher's later checkout check is too late to prevent source disclosure.
import { execFileSync } from 'node:child_process';
import { lstatSync, openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';

const MAX_BYTES = 48000;
const EXPECTED_REPOSITORY = 'jayalshehri/CGP-MVP';
const SHA = /^[a-f0-9]{40}$/;
function block() {
  throw new Error('AIEO model source blocked: untrusted checkout or source provenance');
}
function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: 'pipe', maxBuffer: 256000 });
}

export function readApprovedModelSource(env = process.env) {
  let fd;
  try {
    // Source approval is evaluated before even inspecting the file for sharing.
    if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
        env.GITHUB_REF !== 'refs/heads/main' ||
        env.GITHUB_REPOSITORY !== EXPECTED_REPOSITORY ||
        env.AIEO_MODEL_ENABLED !== 'true' ||
        env.AIEO_SOURCE_SHARING_APPROVED !== 'true' ||
        !SHA.test(env.GITHUB_SHA || '') ||
        git('rev-parse', '--verify', 'HEAD').trim() !== env.GITHUB_SHA) block();

    const index = git('ls-files', '-v', '-z').split('\0').filter(Boolean);
    if (!index.length || index.some((entry) => !entry.startsWith('H '))) block();
    const entry = git('ls-files', '-s', '--', MODEL_ALLOWED_PATH).trim();
    if (!/^100644 [a-f0-9]{40} 0\tcomponents\/FeedbackWidget\.tsx$/.test(entry)) block();
    if (git('diff', '--cached', '--name-only').trim() ||
        git('diff', '--name-only').trim()) block();
    const extra = git('ls-files', '--others', '--exclude-standard', '-z')
      .split('\0').filter(Boolean);
    if (extra.some((path) => !path.startsWith('aieo-output/'))) block();

    // Disallow both linked source aliases and a replaced parent directory.
    const directory = lstatSync('components');
    if (!directory.isDirectory() || directory.isSymbolicLink() ||
        (directory.mode & 0o022)) block();
    const prior = lstatSync(MODEL_ALLOWED_PATH);
    if (!prior.isFile() || prior.isSymbolicLink() || prior.nlink !== 1 ||
        (prior.mode & 0o133) || prior.size < 1 || prior.size > MAX_BYTES) block();

    // Open exactly one regular inode and cap reads; O_NOFOLLOW protects against
    // a final-component symlink swap, O_NONBLOCK against a substituted FIFO.
    fd = openSync(MODEL_ALLOWED_PATH,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || (opened.mode & 0o133) ||
        opened.dev !== prior.dev || opened.ino !== prior.ino ||
        opened.size !== prior.size) block();
    const buffer = Buffer.alloc(opened.size + 1);
    let used = 0;
    while (used < buffer.length) {
      const n = readSync(fd, buffer, used, buffer.length - used, null);
      if (n === 0) break;
      used += n;
    }
    const after = fstatSync(fd);
    const pathNow = lstatSync(MODEL_ALLOWED_PATH);
    const dirNow = lstatSync('components');
    if (used !== opened.size || after.size !== opened.size ||
        after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs ||
        after.nlink !== 1 || (after.mode & 0o133) ||
        pathNow.dev !== opened.dev || pathNow.ino !== opened.ino ||
        !pathNow.isFile() || pathNow.nlink !== 1 ||
        dirNow.dev !== directory.dev || dirNow.ino !== directory.ino ||
        !dirNow.isDirectory() || (dirNow.mode & 0o022)) block();

    const source = buffer.toString('utf8', 0, used);
    // The bytes eligible for external sharing must exactly match the pinned
    // workflow commit, not merely the pathname or an untrusted workspace diff.
    if (source !== git('show', 'HEAD:' + MODEL_ALLOWED_PATH)) block();
    return source;
  } catch {
    block();
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
