// Verified, credential-free candidate replay BEFORE npm install or a Next.js build.
// Never use a shell "git show $HEAD_SHA:path > file" for untrusted handoff data:
// it can honor Git replacement objects and inherited Git config before the
// post-build finalizer has a chance to detect an unsafe build input.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, openSync, fstatSync, readSync, writeSync, ftruncateSync, closeSync, constants } from 'node:fs';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';
import { inspectModelQa, inspectModelReviewer } from '../aieo/lib/model-gates.mjs';
import { inspectModelDiff } from './aieo-model-security.mjs';
import { readBoundedRoleReport } from './aieo-role-artifact-io.mjs';
import { readStrictReviewedGitSource } from './aieo-candidate-finalize.mjs';
import {
  hasUnsafeGitEnvironment, readOnlyGitArguments,
  readOnlyGitEnvironment, assertNoTrackedGitFilters
} from './aieo-git-process-guard.mjs';

const REPO = 'jayalshehri/CGP-MVP';
const SHA = /^[a-f0-9]{40}$/;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const block = () => { throw new Error('AIEO pre-build replay blocked: untrusted candidate or role evidence'); };
const git = (...args) => execFileSync('git', readOnlyGitArguments(args), {
  encoding: 'utf8', stdio: 'pipe', maxBuffer: 256000,
  env: readOnlyGitEnvironment(process.env)
}).trimEnd();

function replaceTrustedSource(original, candidate) {
  let fd;
  try {
    const directory = lstatSync('components');
    const before = lstatSync(MODEL_ALLOWED_PATH);
    if (!directory.isDirectory() || directory.isSymbolicLink() ||
        (directory.mode & 0o022) ||
        !before.isFile() || before.isSymbolicLink() ||
        before.nlink !== 1 || (before.mode & 0o133) ||
        before.size !== Buffer.byteLength(original, 'utf8')) block();
    fd = openSync(MODEL_ALLOWED_PATH,
      constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || (opened.mode & 0o133) ||
        opened.dev !== before.dev || opened.ino !== before.ino ||
        opened.size !== before.size) block();
    const initial = Buffer.alloc(opened.size);
    let used = 0;
    while (used < initial.length) {
      const count = readSync(fd, initial, used, initial.length - used, used);
      if (count === 0) break;
      used += count;
    }
    const now = fstatSync(fd);
    const nameNow = lstatSync(MODEL_ALLOWED_PATH);
    const directoryNow = lstatSync('components');
    if (used !== opened.size || !initial.equals(Buffer.from(original, 'utf8')) ||
        now.size !== opened.size || now.mtimeMs !== opened.mtimeMs ||
        now.ctimeMs !== opened.ctimeMs ||
        !nameNow.isFile() || nameNow.isSymbolicLink() ||
        nameNow.dev !== opened.dev || nameNow.ino !== opened.ino ||
        nameNow.nlink !== 1 || (nameNow.mode & 0o133) ||
        !directoryNow.isDirectory() || directoryNow.isSymbolicLink() ||
        directoryNow.dev !== directory.dev || directoryNow.ino !== directory.ino ||
        (directoryNow.mode & 0o022)) block();
    const bytes = Buffer.from(candidate, 'utf8');
    let written = 0;
    while (written < bytes.length) {
      const n = writeSync(fd, bytes, written, bytes.length - written, written);
      if (n <= 0) block();
      written += n;
    }
    ftruncateSync(fd, bytes.length);
    // Never proceed to npm after a partial write, inode swap, or permission
    // change. The post-build attestation is intentionally a second boundary.
    const after = fstatSync(fd);
    const live = lstatSync(MODEL_ALLOWED_PATH);
    const parent = lstatSync('components');
    const reread = Buffer.alloc(bytes.length);
    let count = 0;
    while (count < reread.length) {
      const n = readSync(fd, reread, count, reread.length - count, count);
      if (n === 0) break;
      count += n;
    }
    if (count !== bytes.length || !reread.equals(bytes) ||
        after.size !== bytes.length || after.nlink !== 1 ||
        (after.mode & 0o133) || !live.isFile() || live.isSymbolicLink() ||
        live.dev !== after.dev || live.ino !== after.ino ||
        live.nlink !== 1 || (live.mode & 0o133) ||
        !parent.isDirectory() || parent.isSymbolicLink() ||
        parent.dev !== directory.dev || parent.ino !== directory.ino ||
        (parent.mode & 0o022)) block();
  } catch { block(); }
  finally { if (fd !== undefined) closeSync(fd); }
}

export function replayReviewedCandidate(env = process.env) {
  // This pre-build step does not need an API or provider token. A model
  // candidate must not reach npm/Next.js with credentials in its environment.
  if (hasUnsafeGitEnvironment(process.env) || hasUnsafeGitEnvironment(env) ||
      env.GH_TOKEN || env.GITHUB_TOKEN || env.OPENROUTER_API_KEY ||
      env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_REPOSITORY !== REPO ||
      !SHA.test(env.GITHUB_SHA || '') ||
      !/^[1-9][0-9]*$/.test(env.AIEO_PR_NUMBER || '')) block();
  try {
    assertNoTrackedGitFilters(process.env);
    const base = env.GITHUB_SHA;
    const developer = readBoundedRoleReport('developer');
    const qa = readBoundedRoleReport('qa');
    const security = readBoundedRoleReport('security');
    const reviewer = readBoundedRoleReport('reviewer');
    const head = developer.headSha;
    const number = Number(env.AIEO_PR_NUMBER);
    if (!SHA.test(head || '') || head === base ||
        developer.baseSha !== base || developer.prNumber !== number ||
        git('rev-parse', 'HEAD') !== base ||
        git('diff', '--cached', '--name-only') ||
        git('diff', '--name-only') ||
        git('rev-list', '--parents', '-n', '1', head) !== head + ' ' + base) block();
    const entries = git('ls-files', '-v', '-z').split('\0').filter(Boolean);
    if (!entries.length || entries.some((entry) => !entry.startsWith('H '))) block();
    // Tracked diffs cannot detect untracked build inputs. Check BEFORE npm ci,
    // including ignored .env*, npm configuration and any new source files:
    // the post-build gate is too late to protect the compiler from these.
    // Git reports paths NUL-delimited so unusual filenames cannot masquerade
    // as multiple entries. Only independently approved handoffs may exist.
    const expectedHandoffs = new Set([
      'aieo-output/candidate-developer.json',
      'aieo-output/candidate-qa.json',
      'aieo-output/candidate-security.json',
      'aieo-output/candidate-reviewer.json'
    ]);
    const untracked = git('ls-files', '--others', '-z').split('\0').filter(Boolean);
    if (untracked.length !== expectedHandoffs.size ||
        new Set(untracked).size !== untracked.length ||
        untracked.some((entry) => !expectedHandoffs.has(entry))) block();
    for (const revision of [base, head]) {
      if (!/^100644 blob [a-f0-9]{40}\tcomponents\/FeedbackWidget\.tsx$/.test(
        git('ls-tree', revision, '--', MODEL_ALLOWED_PATH))) block();
    }
    const original = readStrictReviewedGitSource(base);
    const candidate = readStrictReviewedGitSource(head);
    const paths = git('diff', '--name-only', base, head).split('\n').filter(Boolean);
    const diff = execFileSync('git',
      readOnlyGitArguments(['diff', '--unified=0', base, head, '--', MODEL_ALLOWED_PATH]),
      { encoding: 'utf8', stdio: 'pipe', maxBuffer: 256000,
        env: readOnlyGitEnvironment(process.env) });
    if (paths.length !== 1 || paths[0] !== MODEL_ALLOWED_PATH ||
        original === candidate || diff.length > 20000 ||
        candidate.length > 48000) block();
    const expectedDeveloper = {
      schemaVersion: 1, role: 'developer', status: 'proposed', path: MODEL_ALLOWED_PATH,
      prNumber: number, baseSha: base, headSha: head,
      sourceHash: hash(original), proposedHash: hash(candidate),
      diffHash: hash(diff), changedPaths: paths
    };
    const expectedQa = inspectModelQa({ original, actual: candidate,
      changedPaths: paths, report: expectedDeveloper });
    const expectedSecurity = inspectModelDiff({ original, actual: candidate,
      changedPaths: paths, diff, report: expectedDeveloper });
    const expectedReviewer = inspectModelReviewer({ original, actual: candidate,
      changedPaths: paths, diff, proposal: expectedDeveloper,
      qa: expectedQa, security: expectedSecurity });
    if (expectedQa.status !== 'passed' || expectedSecurity.status !== 'passed' ||
        expectedReviewer.status !== 'draft-pr-eligible' ||
        expectedReviewer.requiresHumanMerge !== true ||
        !equal(developer, expectedDeveloper) || !equal(qa, expectedQa) ||
        !equal(security, expectedSecurity) || !equal(reviewer, expectedReviewer)) block();
    replaceTrustedSource(original, candidate);
    return { status: 'verified-candidate-replayed-for-build',
      baseSha: base, headSha: head, requiresHumanMerge: true };
  } catch { block(); }
}

if (process.argv[1]?.endsWith('/aieo-candidate-replay.mjs')) {
  console.log(JSON.stringify(replayReviewedCandidate()));
}
