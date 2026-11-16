// Trusted, fail-closed publisher. It cannot merge, approve, or deploy.
// Call only after a manual main-branch dispatch and successful application gates.
import { lstatSync, openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';
import { inspectModelReviewer } from '../aieo/lib/model-gates.mjs';
import { APPROVED_TASK, orchestrate } from '../aieo/lib/engine.mjs';
import { verifyRemoteDraft } from '../aieo/lib/remote-draft.mjs';
import { readBoundedModelReport } from './aieo-role-artifact-io.mjs';

function command(binary, args) {
  return execFileSync(binary, args, { encoding: 'utf8', stdio: 'pipe' });
}
function identical(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Read the candidate from one bounded, private, ordinary inode. This happens
// before any branch, push, or PR write; a Git diff alone cannot prove that a
// group-writable file, swapped symlink, or replaced parent path is trusted.
function readTrustedCandidate(path) {
  let fd;
  try {
    const directory = lstatSync('components');
    const prior = lstatSync(path);
    if (!directory.isDirectory() || directory.isSymbolicLink() ||
        (directory.mode & 0o022) || !prior.isFile() ||
        prior.isSymbolicLink() || prior.nlink !== 1 ||
        (prior.mode & 0o133) || prior.size < 1 ||
        prior.size > 48000) fail('candidate source permissions or size are unsafe');
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || (opened.mode & 0o133) ||
        opened.dev !== prior.dev || opened.ino !== prior.ino ||
        opened.size !== prior.size) fail('candidate source inode changed before read');
    const bytes = Buffer.alloc(opened.size + 1);
    let used = 0;
    while (used < bytes.length) {
      const count = readSync(fd, bytes, used, bytes.length - used, null);
      if (count === 0) break;
      used += count;
    }
    const after = fstatSync(fd);
    const pathname = lstatSync(path);
    const directoryNow = lstatSync('components');
    if (used !== opened.size || after.size !== opened.size ||
        after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs ||
        after.nlink !== 1 || (after.mode & 0o133) ||
        !pathname.isFile() || pathname.isSymbolicLink() ||
        pathname.nlink !== 1 || (pathname.mode & 0o133) ||
        pathname.dev !== opened.dev || pathname.ino !== opened.ino ||
        pathname.size !== opened.size ||
        !directoryNow.isDirectory() || directoryNow.isSymbolicLink() ||
        (directoryNow.mode & 0o022) ||
        directoryNow.dev !== directory.dev || directoryNow.ino !== directory.ino) {
      fail('candidate source or parent path changed during read');
    }
    const text = bytes.toString('utf8', 0, used);
    // Model review hashes the decoded string. Reject malformed bytes that
    // would silently decode to U+FFFD and let Git commit different raw bytes
    // from the candidate independently reviewed by the role gates.
    if (!Buffer.from(text, 'utf8').equals(bytes.subarray(0, used))) {
      fail('candidate source contains invalid UTF-8');
    }
    return text;
  } catch {
    fail('untrusted candidate source or directory');
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
function fail(message) {
  throw new Error('AIEO draft publisher blocked: ' + message);
}

export function validateDispatch(env) {
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_REPOSITORY !== 'jayalshehri/CGP-MVP' ||
      !env.GH_TOKEN ||
      !/^[0-9]+$/.test(env.GITHUB_RUN_ID || '') ||
      !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT || '')) {
    fail('requires a trusted manual dispatch on main and a repository-scoped token');
  }
  if (!['model', 'deterministic'].includes(env.AIEO_PUBLISH_MODE)) fail('invalid publishing mode');
  if (env.AIEO_PUBLISH_MODE === 'model' &&
      (env.AIEO_MODEL_ENABLED !== 'true' || env.AIEO_SOURCE_SHARING_APPROVED !== 'true')) {
    fail('model source sharing was not approved');
  }
  return env.AIEO_PUBLISH_MODE;
}

export function verifyCandidate({ mode, original, actual, changedPaths, diff, reports, env = process.env }) {
  if (!Array.isArray(changedPaths) || changedPaths.length !== 1 ||
      changedPaths[0] !== MODEL_ALLOWED_PATH || original === actual) {
    fail('candidate changes must affect exactly one allowlisted tracked file');
  }
  if (mode === 'model') {
    const { proposal, qa, security, reviewer } = reports;
    // An otherwise correct candidate cannot reuse a report from another
    // approved task, Actions run or rerun attempt. Source-sharing consent in
    // the dispatch environment alone does not attest the proposal handoff.
    const approvedTask = env.AIEO_MODEL_TASK;
    if (typeof approvedTask !== 'string' || approvedTask.length < 12 ||
        proposal?.schemaVersion !== 1 || proposal?.sourceShared !== true ||
        proposal?.taskHash !== createHash('sha256').update(approvedTask).digest('hex') ||
        proposal?.dispatchRunId !== env.GITHUB_RUN_ID ||
        proposal?.dispatchRunAttempt !== env.GITHUB_RUN_ATTEMPT ||
        !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') ||
        proposal?.sourceCommitSha !== env.GITHUB_SHA) {
      fail('model proposal is not bound to approved task and workflow dispatch');
    }
    const recomputed = inspectModelReviewer({
      original, actual, changedPaths, diff, proposal, qa, security
    });
    if (recomputed.status !== 'draft-pr-eligible' ||
        recomputed.requiresHumanMerge !== true || !identical(reviewer, recomputed)) {
      fail('independent model reviewer verdict does not match candidate evidence');
    }
  } else if (mode === 'deterministic') {
    const observed = orchestrate({ task: APPROVED_TASK, source: original });
    if (observed.developer.status !== 'proposed' ||
        observed.developer.patchedSource !== actual ||
        observed.qa.status !== 'passed' || observed.security.status !== 'passed' ||
        observed.reviewer.status !== 'draft-pr-eligible' ||
        observed.reviewer.requiresHumanMerge !== true) {
      fail('deterministic source patch does not match the independently reproduced fix');
    }
  } else fail('unknown candidate mode');
  return true;
}

// GitHub's event ref alone does not establish the checked-out source commit.
// Reject a stale/mismatched checkout, concealed index flags, or a file mode/type
// change before creating a branch, pushing code, or contacting the GitHub CLI.
function assertTrustedCheckout(env, path) {
  const expectedSha = env.GITHUB_SHA || '';
  const checkedOutSha = command('git', ['rev-parse', '--verify', 'HEAD']).trim();
  if (!/^[a-f0-9]{40}$/.test(expectedSha) || checkedOutSha !== expectedSha) {
    fail('candidate checkout differs from the trusted workflow commit');
  }
  const entries = command('git', ['ls-files', '-v', '-z']).split('\0').filter(Boolean);
  if (!entries.length || entries.some((entry) => !entry.startsWith('H '))) {
    fail('hidden or special Git index flags in the trusted checkout');
  }
  const indexEntry = command('git', ['ls-files', '-s', '--', path]).trim();
  if (!/^100644 [a-f0-9]{40} 0\tcomponents\/FeedbackWidget\.tsx$/.test(indexEntry)) {
    fail('candidate must start from a regular, non-executable tracked file');
  }
  const file = lstatSync(path);
  // Reject hardlinked source aliases before any branch, push, or remote PR.
  if (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1 ||
      (file.mode & 0o111)) {
    fail('candidate must remain a regular, non-executable file');
  }
}

export function publishDraft({ env = process.env } = {}) {
  const mode = validateDispatch(env);
  const path = MODEL_ALLOWED_PATH;
  assertTrustedCheckout(env, path);
  // Refuse pre-staged changes, untracked files and whitespace errors before any write.
  if (command('git', ['diff', '--cached', '--name-only']).trim()) fail('unexpected staged files');
  if (command('git', ['ls-files', '--others', '--exclude-standard'])
      .split('\n').filter(Boolean).some((p) => p !== 'aieo-output' && !p.startsWith('aieo-output/'))) {
    fail('unexpected untracked repository files');
  }
  command('git', ['diff', '--check']);
  const original = command('git', ['show', 'HEAD:' + path]);
  const actual = readTrustedCandidate(path);
  const changedPaths = command('git', ['diff', '--name-only']).trim().split('\n').filter(Boolean);
  const diff = command('git', ['diff', '--unified=0', '--', path]);
  const reports = mode === 'model' ? {
    proposal: readBoundedModelReport('proposal'),
    qa: readBoundedModelReport('qa'),
    security: readBoundedModelReport('security'),
    reviewer: readBoundedModelReport('reviewer')
  } : {};
  verifyCandidate({ mode, original, actual, changedPaths, diff, reports, env });
  const baseSha = command('git', ['rev-parse', 'HEAD']).trim();
  // The provider, independent roles and build may take minutes. Refuse to
  // publish a branch against a main tip that moved after the scoped proposal
  // was approved. Do this before branch creation, push or GitHub API writes.
  // The later remote Draft readback remains authoritative if main races again.
  const remoteMain = command('git', [
    'ls-remote', '--exit-code', 'origin', 'refs/heads/main'
  ]).trim();
  if (remoteMain !== baseSha + '\trefs/heads/main') {
    fail('remote main changed since the trusted workflow checkout');
  }
  const branch = 'aieo/' + (mode === 'model' ? 'model-proposal-' : 'repair-feedback-') +
    env.GITHUB_RUN_ID + '-' + env.GITHUB_RUN_ATTEMPT;
  // A retried or replayed run must not reuse a remote branch that already
  // belongs to another attempt. Keep the push non-forcing; this is a fast-fail
  // preflight, not a claim of atomic protection against concurrent ref races.
  if (command('git', ['ls-remote', '--heads', 'origin', 'refs/heads/' + branch]).trim()) {
    fail('candidate branch already exists on origin');
  }
  command('git', ['config', 'user.name', 'github-actions[bot]']);
  command('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
  command('git', ['switch', '-c', branch]);
  command('git', ['add', '--', path]);
  if (command('git', ['diff', '--cached', '--name-only']).trim() !== path) fail('unexpected staged scope');
  // Do not let runner-local or injected Git hooks execute with publisher
  // credentials. The reviewed candidate and immutable commit are checked below.
  command('git', ['-c', 'core.hooksPath=/dev/null', 'commit', '-m',
    'feat(aieo): bounded candidate for human review']);
  const candidateSha = command('git', ['rev-parse', 'HEAD']).trim();
  // A file can change between independent review and git add. Compare the
  // immutable commit with the verified bytes before contacting GitHub.
  const committedPaths = command('git', ['diff', '--name-only', baseSha, candidateSha]).trim();
  const committedMode = command('git', ['ls-tree', candidateSha, '--', path]).trim();
  if (command('git', ['show', candidateSha + ':' + path]) !== actual ||
      committedPaths !== path ||
      !/^100644 blob [a-f0-9]{40}\tcomponents\/FeedbackWidget\.tsx$/.test(committedMode) ||
      command('git', ['rev-list', '--parents', '-n', '1', candidateSha]).trim() !==
        candidateSha + ' ' + baseSha) {
    fail('committed proposal differs from independently reviewed candidate');
  }
  command('gh', ['auth', 'setup-git']);
  command('git', ['push', 'origin', 'HEAD:refs/heads/' + branch]);
  // Pushing a verified commit is not enough if origin/main (or the candidate
  // ref) moves during the push. Re-read both advertised refs BEFORE creating
  // a GitHub PR. This closes the push-to-PR gap but is not an atomic lock;
  // the later REST/GraphQL Draft attestation remains mandatory.
  const advertisedRefs = command('git', ['ls-remote', '--exit-code', 'origin',
    'refs/heads/main', 'refs/heads/' + branch]).trim().split('\n').sort();
  const requiredRefs = [
    baseSha + '\trefs/heads/main',
    candidateSha + '\trefs/heads/' + branch
  ].sort();
  if (!identical(advertisedRefs, requiredRefs)) {
    fail('remote refs changed after candidate push');
  }
  const body = 'Candidate scope, independent checks and build were verified before publishing. ' +
    'DRAFT only. No automatic approval, merge or production deployment.';
  const pr = command('gh', ['pr', 'create', '--draft', '--base', 'main', '--head', branch,
    '--title', 'AIEO: bounded ' + mode + ' proposal for review', '--body', body]).trim();
  // A printed URL is not proof: independently read back GitHub's exact Draft,
  // source/candidate commit OIDs, one-file scope, repository and official bot actor.
  // Failure stops downstream CI dispatch and success reporting; no auto-delete/merge.
  const attested = verifyRemoteDraft({ url: pr, branch, baseSha, candidateSha,
    path, gh: command });
  if (mode === 'model') {
    command('gh', ['workflow', 'run', 'cgp-required-ci.yml', '--ref', branch]);
    // GITHUB_TOKEN-created PRs do not fire pull_request workflows. Explicitly
    // dispatch four read-only independent jobs using trusted main-branch code.
    // Dispatch is NOT evidence of successful review, merge or production readiness.
    command('gh', ['workflow', 'run', 'aieo-model-candidate-roles.yml',
      '--ref', 'main', '-f', 'pr_number=' + attested.number]);
  }
  return { status: 'draft-pr-created', branch, pr: attested.url,
    independentRoles: mode === 'model' ? 'dispatched-not-proven' : 'not-applicable',
    requiresHumanMerge: true };
}

if (process.argv[1]?.endsWith('/aieo-publish-draft.mjs')) {
  // Never print source, model proposals, prompts or credentials.
  const result = publishDraft();
  console.log(JSON.stringify(result));
}
