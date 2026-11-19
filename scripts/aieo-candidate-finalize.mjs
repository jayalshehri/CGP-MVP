// Read-only final checkpoint AFTER the independent Reviewer and candidate build.
// An earlier approved PR head is not proof that the remote Draft stayed unchanged
// throughout npm install, lint, typecheck and build. No merge/publish/approval.
import { execFileSync } from 'node:child_process';
import { lstatSync, openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';
import { inspectModelQa, inspectModelReviewer } from '../aieo/lib/model-gates.mjs';
import { inspectModelDiff } from './aieo-model-security.mjs';
import { readBoundedRoleReport } from './aieo-role-artifact-io.mjs';
import { verifyOfficialGitHubCliContext, verifyCandidateActionsContext } from './aieo-candidate-role.mjs';
import { hasUnsafeGitEnvironment, readOnlyGitEnvironment, readOnlyGitArguments, assertNoTrackedGitFilters } from './aieo-git-process-guard.mjs';

const REPO = 'jayalshehri/CGP-MVP';
const SHA = /^[a-f0-9]{40}$/;
const MAX_SOURCE_BYTES = 48000;
const BRANCH = /^aieo\/model-proposal-[0-9]+-[1-9][0-9]*$/;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const fail = () => { throw new Error('AIEO post-build check blocked: candidate or remote Draft changed'); };
// Post-build re-attestation must not execute Git config/attribute helpers
// under the independent workflow's GH_TOKEN, including textconv on diffs.
const git = (...args) => {
  const safeArgs = readOnlyGitArguments(args);
  return execFileSync('git', safeArgs, {
    encoding: 'utf8', stdio: 'pipe', maxBuffer: 256000,
    env: readOnlyGitEnvironment(process.env)
  });
};
const gitTrim = (...args) => git(...args).trim();

// The immutable base/head Git blobs must be checked as raw bytes. Decoding
// git show as UTF-8 first can silently turn malformed data into U+FFFD; the
// compiled worktree could then appear equal despite different committed bytes.
export function readStrictReviewedGitSource(revision) {
  try {
    if (!SHA.test(revision || '')) fail();
    const raw = execFileSync('git', readOnlyGitArguments(['show', revision + ':' + MODEL_ALLOWED_PATH]),
      { stdio: 'pipe', maxBuffer: 256000, env: readOnlyGitEnvironment(process.env) });
    if (!Buffer.isBuffer(raw) || raw.length < 1 ||
        raw.length > MAX_SOURCE_BYTES) fail();
    const source = raw.toString('utf8');
    if (!Buffer.from(source, 'utf8').equals(raw)) fail();
    return source;
  } catch { fail(); }
}

// The build replay is the final approval boundary for source bytes. Read a
// bounded, opened inode, not a path that could become a symlink between lstat
// and readFileSync. Group/world-writable source or parent directories allow a
// local actor to alter build inputs after the immutable Git review.
export function readVerifiedBuildSource(path) {
  let fd;
  try {
    // The independent build may leave an untrusted candidate file even if
    // its bytes match the reviewed commit. Attest the runner's UID, parent,
    // special-mode bits and exact opened inode before any worktree diff.
    const uid = process.getuid?.();
    if (!Number.isSafeInteger(uid)) fail();
    const directory = lstatSync('components');
    const prior = lstatSync(path);
    if (!directory.isDirectory() || directory.isSymbolicLink() ||
        directory.uid !== uid || (directory.mode & 0o7022) ||
        !prior.isFile() || prior.isSymbolicLink() || prior.nlink !== 1 ||
        prior.uid !== uid || !(prior.mode & 0o400) ||
        (prior.mode & 0o7133) || prior.size < 1 ||
        prior.size > MAX_SOURCE_BYTES) fail();

    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 ||
        opened.uid !== uid || !(opened.mode & 0o400) ||
        (opened.mode & 0o7133) ||
        opened.dev !== prior.dev || opened.ino !== prior.ino ||
        opened.size !== prior.size ||
        opened.mtimeMs !== prior.mtimeMs ||
        opened.ctimeMs !== prior.ctimeMs) fail();

    const buffer = Buffer.alloc(opened.size + 1);
    let used = 0;
    while (used < buffer.length) {
      const count = readSync(fd, buffer, used, buffer.length - used, null);
      if (count === 0) break;
      used += count;
    }
    const after = fstatSync(fd);
    const pathNow = lstatSync(path);
    const directoryNow = lstatSync('components');
    if (used !== opened.size || after.size !== opened.size ||
        after.nlink !== 1 || after.uid !== uid ||
        !(after.mode & 0o400) || (after.mode & 0o7133) ||
        after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs ||
        !pathNow.isFile() || pathNow.isSymbolicLink() ||
        pathNow.nlink !== 1 || pathNow.uid !== uid ||
        !(pathNow.mode & 0o400) || (pathNow.mode & 0o7133) ||
        pathNow.dev !== opened.dev || pathNow.ino !== opened.ino ||
        pathNow.size !== opened.size ||
        pathNow.mtimeMs !== opened.mtimeMs ||
        pathNow.ctimeMs !== opened.ctimeMs ||
        !directoryNow.isDirectory() || directoryNow.isSymbolicLink() ||
        directoryNow.uid !== uid || (directoryNow.mode & 0o7022) ||
        directoryNow.dev !== directory.dev || directoryNow.ino !== directory.ino) fail();
    // Post-build verification must bind to the actual bytes compiled, not a
    // lossy UTF-8 string. Node replaces malformed sequences with U+FFFD,
    // which could compare equal to a valid Git blob containing that character.
    const raw = buffer.subarray(0, used);
    const source = raw.toString('utf8');
    if (!Buffer.from(source, 'utf8').equals(raw)) fail();
    return source;
  } catch { fail(); }
  finally { if (fd !== undefined) closeSync(fd); }
}

// A post-build handoff must be a bounded, ordinary file in the current workspace.
// A symlink or external hardlink with matching bytes is not trusted provenance.
function report(role) {
  return readBoundedRoleReport(role);
}


export function verifyPostBuild(env = process.env) {
  // The build step precedes this check. Reject Git environment injection
  // before reading evidence, running git or contacting GitHub with GH_TOKEN.
  if (hasUnsafeGitEnvironment(process.env) || hasUnsafeGitEnvironment(env)) fail();
  try {
    verifyOfficialGitHubCliContext(process.env);
    verifyOfficialGitHubCliContext(env);
  } catch { fail(); }
  const number = env.AIEO_PR_NUMBER;
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_REPOSITORY !== REPO ||
      !SHA.test(env.GITHUB_SHA || '') ||
      !/^[1-9][0-9]*$/.test(number || '') || !env.GH_TOKEN) fail();
  // The supplied fixture object is not trustworthy when the *actual* Node
  // process contains a real GitHub credential. Use the same fail-closed
  // Actions-context guard as the four independent role CLIs before any git.
  try { verifyCandidateActionsContext(env); } catch { fail(); }
  // Git worktree diffs can execute clean filters from info/attributes or
  // global attributes even with no-textconv and a scrubbed Git environment.
  try { assertNoTrackedGitFilters(process.env); } catch { fail(); }

  const path = MODEL_ALLOWED_PATH;
  const developer = report('developer');
  const qa = report('qa');
  const security = report('security');
  const reviewer = report('reviewer');
  const base = env.GITHUB_SHA;
  const head = developer.headSha;

  // Fail closed on a swapped, foreign-owned or special-mode build source
  // before any git diff with the role's read-scoped GitHub token.
  readVerifiedBuildSource(path);
  if (!SHA.test(head || '') || head === base ||
      !BRANCH.test(developer.headRef || '') ||
      gitTrim('rev-parse', 'HEAD') !== base ||
      gitTrim('diff', '--cached', '--name-only') !== '' ||
      gitTrim('diff', '--name-only') !== path ||
      developer.baseSha !== base || developer.prNumber !== Number(number)) fail();

  // Re-check the trusted index AFTER dependency installation and build. Git
  // diff/status can hide modified tracked files behind assume-unchanged or
  // skip-worktree flags, including files other than the approved candidate.
  // A normal non-sparse Actions checkout must keep every entry visible.
  const indexEntries = git('ls-files', '-v', '-z').split('\0').filter(Boolean);
  if (!indexEntries.length || indexEntries.some((entry) => !entry.startsWith('H '))) fail();
  // Only the four expected independent-role handoffs may be untracked after
  // dependency installation/build. A new source/config file (or an extra
  // handoff payload) would not appear in git diff and must not be attested.
  // Ignore only ordinary build outputs covered by the repository's .gitignore.
  const allowedHandoffs = new Set([
    'aieo-output/candidate-developer.json',
    'aieo-output/candidate-qa.json',
    'aieo-output/candidate-security.json',
    'aieo-output/candidate-reviewer.json'
  ]);
  const untracked = git('ls-files', '--others', '--exclude-standard', '-z')
    .split('\0').filter(Boolean);
  if (untracked.some((entry) => !allowedHandoffs.has(entry))) fail();
  // --exclude-standard above hides ALL ignored files, not just Next/npm outputs.
  // A build can create .env.local, PEM credentials or another ignored override
  // without changing the Git diff. Only the known build-generated paths below
  // are permitted; --directory bounds inspection of large dependency trees.
  const allowedIgnoredOutputs = new Set([
    'node_modules/', '.next/', 'next-env.d.ts', 'tsconfig.tsbuildinfo'
  ]);
  const ignored = git('ls-files', '--others', '--ignored',
    '--exclude-standard', '--directory', '-z').split('\0').filter(Boolean);
  if (ignored.length !== new Set(ignored).size ||
      ignored.some((entry) => !allowedIgnoredOutputs.has(entry))) fail();
  // The build must compile exactly the previously reviewed immutable blob.
  const original = readStrictReviewedGitSource(base);
  const actual = readStrictReviewedGitSource(head);
  const worktree = readVerifiedBuildSource(path);
  const changedPaths = gitTrim('diff', '--no-ext-diff', '--name-only', base, head)
    .split('\n').filter(Boolean);
  const diff = git('diff', '--no-ext-diff', '--unified=0', base, head, '--', path);
  if (changedPaths.length !== 1 || changedPaths[0] !== path ||
      worktree !== actual || original === actual || diff.length > 20000 ||
      gitTrim('rev-list', '--parents', '-n', '1', head) !== head + ' ' + base) fail();

  const expectedDeveloper = {
    schemaVersion: 1, role: 'developer', status: 'proposed', path,
    prNumber: Number(number), baseSha: base, headSha: head,
    headRef: developer.headRef,
    sourceHash: hash(original), proposedHash: hash(actual),
    diffHash: hash(diff), changedPaths
  };
  if (!equal(developer, expectedDeveloper)) fail();
  const expectedQa = inspectModelQa({
    original, actual, changedPaths, report: expectedDeveloper
  });
  const expectedSecurity = inspectModelDiff({
    original, actual, changedPaths, diff, report: expectedDeveloper
  });
  const expectedReviewer = inspectModelReviewer({
    original, actual, changedPaths, diff, proposal: expectedDeveloper,
    qa: expectedQa, security: expectedSecurity
  });
  if (expectedQa.status !== 'passed' || expectedSecurity.status !== 'passed' ||
      expectedReviewer.status !== 'draft-pr-eligible' ||
      expectedReviewer.requiresHumanMerge !== true ||
      !equal(qa, expectedQa) || !equal(security, expectedSecurity) ||
      !equal(reviewer, expectedReviewer)) fail();

  // Re-read GitHub LAST: a force-pushed, closed, merged or un-drafted PR must
  // invalidate earlier artifacts even when the local reviewed commit still exists.
  let pr;
  try {
    pr = JSON.parse(execFileSync('gh', ['api', 'repos/' + REPO + '/pulls/' + number],
      { encoding: 'utf8', stdio: 'pipe', maxBuffer: 256000 }));
  } catch { fail(); }
  if (pr.number !== Number(number) ||
      pr.html_url !== 'https://github.com/' + REPO + '/pull/' + number ||
      pr.state !== 'open' || pr.draft !== true || pr.merged_at != null ||
      pr.user?.login !== 'github-actions[bot]' || pr.user?.id !== 41898282 ||
      pr.user?.type !== 'Bot' ||
      pr.base?.ref !== 'main' || pr.base?.sha !== base ||
      pr.base?.repo?.full_name !== REPO ||
      pr.head?.repo?.full_name !== REPO ||
      !BRANCH.test(pr.head?.ref || '') ||
      // The original Developer handoff pins the head branch identity. A PR
      // retargeted to another valid model-proposal branch at the SAME commit
      // after independent review must not inherit its prior approvals.
      pr.head?.ref !== developer.headRef || pr.head?.sha !== head) fail();

  return { status: 'post-build-draft-reverified', prNumber: Number(number),
    baseSha: base, headSha: head, requiresHumanMerge: true };
}

if (process.argv[1]?.endsWith('/aieo-candidate-finalize.mjs')) {
  console.log(JSON.stringify(verifyPostBuild()));
}
