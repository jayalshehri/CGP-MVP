// Read-only roles for an already-created, official GitHub Actions model Draft PR.
// All role processes run trusted main-branch code and inspect immutable Git commits.
// This is post-creation QA, not authorization to merge, publish or disclose source.
import { execFileSync } from 'node:child_process';
import { mkdirSync, lstatSync, openSync, fstatSync, ftruncateSync, writeSync, closeSync, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';
import { inspectModelQa, inspectModelReviewer } from '../aieo/lib/model-gates.mjs';
import { inspectModelDiff } from './aieo-model-security.mjs';
import { readBoundedRoleReport } from './aieo-role-artifact-io.mjs';

const SHA = /^[a-f0-9]{40}$/;
const BRANCH = /^aieo\/model-proposal-[0-9]+-[1-9][0-9]*$/;
const REPO = 'jayalshehri/CGP-MVP';
const ROLES = ['developer', 'qa', 'security', 'reviewer'];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function block() {
  throw new Error('AIEO candidate role blocked: unverified remote Draft PR or candidate evidence');
}
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: 'pipe', maxBuffer: 256000 });
}
// An artifact handoff is untrusted input. Do not follow a link to an external
// file, accept aliased inodes, or read unbounded data even if its JSON matches.
function trustedReportDirectory() {
  try {
    const directory = lstatSync('aieo-output');
    if (!directory.isDirectory() || directory.isSymbolicLink() ||
        (directory.mode & 0o022)) block();
    return directory;
  } catch { block(); }
}
function readReport(role) {
  return readBoundedRoleReport(role);
}

// Candidate role handoffs may be rerun in a local test fixture. Never truncate
// a pre-existing file with group/other read access, nor publish a partial,
// oversized, aliased or directory-swapped report as trusted evidence.
function writeReport(role, report) {
  mkdirSync('aieo-output', { recursive: true, mode: 0o700 });
  const directory = trustedReportDirectory();
  const name = 'aieo-output/candidate-' + role + '.json';
  const data = Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8');
  if (data.length < 2 || data.length > 65536) block();
  let fd;
  try {
    fd = openSync(name, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
    const before = fstatSync(fd);
    // 0o177 excludes owner execute plus every group/other permission.
    if (!before.isFile() || before.nlink !== 1 || (before.mode & 0o177) ||
        before.size > 65536) block();
    ftruncateSync(fd, 0);
    let written = 0;
    while (written < data.length) {
      const count = writeSync(fd, data, written, data.length - written);
      if (count <= 0) block();
      written += count;
    }
    const file = fstatSync(fd);
    const current = lstatSync(name);
    const directoryNow = trustedReportDirectory();
    if (!file.isFile() || file.nlink !== 1 || (file.mode & 0o177) ||
        file.size !== data.length ||
        !current.isFile() || current.isSymbolicLink() ||
        current.dev !== file.dev || current.ino !== file.ino ||
        directoryNow.dev !== directory.dev || directoryNow.ino !== directory.ino) block();
  } catch { block(); }
  finally { if (fd !== undefined) closeSync(fd); }
}
function verifiedRemoteContext(env) {
  const number = env.AIEO_PR_NUMBER;
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_REPOSITORY !== REPO ||
      !/^[1-9][0-9]*$/.test(number || '') ||
      !env.GH_TOKEN) block();
  let pr;
  try {
    pr = JSON.parse(execFileSync('gh', ['api', 'repos/' + REPO + '/pulls/' + number],
      { encoding: 'utf8', stdio: 'pipe', maxBuffer: 256000 }));
  } catch { block(); }
  const base = pr?.base?.sha;
  const head = pr?.head?.sha;
  const headRef = pr?.head?.ref;
  // Pin the PR base to the trusted default-branch workflow commit. A stale
  // candidate must not be reviewed against a different baseline.
  if (!SHA.test(env.GITHUB_SHA || '') || base !== env.GITHUB_SHA) block();
  if (pr.number !== Number(number) ||
      pr.html_url !== 'https://github.com/' + REPO + '/pull/' + number ||
      pr.state !== 'open' || pr.draft !== true ||
      pr.user?.login !== 'github-actions[bot]' ||
      pr.user?.id !== 41898282 || pr.user?.type !== 'Bot' ||
      pr.base?.repo?.full_name !== REPO || pr.head?.repo?.full_name !== REPO ||
      pr.base?.ref !== 'main' || !BRANCH.test(headRef || '') ||
      !SHA.test(base || '') || !SHA.test(head || '') || base === head) block();
  // Fetch only this verified same-repository candidate ref; check that it has not
  // moved since the API attestation. This avoids trusting a stale PR observation.
  try {
    // The independent role must execute from the trusted workflow checkout,
    // never from a candidate branch or another local revision.
    if (git(['rev-parse', 'HEAD']).trim() !== env.GITHUB_SHA) block();
    // The role must examine a pristine trusted worktree. A matching HEAD alone
    // does not detect a staged or unstaged edit to checked-out trusted files.
    // Untracked aieo-output/ reports are expected handoff artifacts.
    if (git(['status', '--porcelain=v1', '--untracked-files=no']).trim()) block();
    // Git's assume-unchanged and skip-worktree index flags can conceal local
    // modifications from porcelain status at the same trusted HEAD. The
    // ordinary non-sparse Actions checkout must have neither flag set.
    const indexEntries = git(['ls-files', '-v', '-z']).split('\0').filter(Boolean);
    if (!indexEntries.length ||
        indexEntries.some((entry) => entry.slice(0, 2) !== 'H ')) block();
    git(['fetch', '--no-tags', 'origin', 'refs/heads/' + headRef]);
    if (git(['rev-parse', 'FETCH_HEAD']).trim() !== head) block();
    // The guarded publisher creates exactly ONE commit on the approved main
    // base. A simple ancestor check would silently accept multi-commit or merge
    // histories, even when their final tree changes just the allowlisted file.
    if (git(['rev-list', '--parents', '-n', '1', head]).trim() !== head + ' ' + base) block();
    // A text-only proposal must preserve the regular, non-executable file mode.
    // The path-only diff check misses chmod/symlink/type changes to that file.
    for (const revision of [base, head]) {
      const entry = git(['ls-tree', revision, '--', MODEL_ALLOWED_PATH]).trimEnd();
      if (!/^100644 blob [a-f0-9]{40}\t/.test(entry) ||
          !entry.endsWith('\t' + MODEL_ALLOWED_PATH)) block();
    }
  } catch { block(); }
  return { base, head, number: Number(number) };
}

export function runCandidateRole(role, env = process.env) {
  if (!ROLES.includes(role)) block();
  const { base, head, number } = verifiedRemoteContext(env);
  let original, actual, changedPaths, diff;
  try {
    original = git(['show', base + ':' + MODEL_ALLOWED_PATH]);
    actual = git(['show', head + ':' + MODEL_ALLOWED_PATH]);
    changedPaths = git(['diff', '--no-ext-diff', '--name-only', base, head])
      .trim().split('\n').filter(Boolean);
    diff = git(['diff', '--no-ext-diff', '--unified=0', base, head, '--', MODEL_ALLOWED_PATH]);
  } catch { block(); }
  if (changedPaths.length !== 1 || changedPaths[0] !== MODEL_ALLOWED_PATH ||
      original === actual || !diff || diff.length > 20000) block();

  const developer = {
    schemaVersion: 1, role: 'developer', status: 'proposed', path: MODEL_ALLOWED_PATH,
    prNumber: number, baseSha: base, headSha: head,
    sourceHash: hash(original), proposedHash: hash(actual),
    diffHash: hash(diff), changedPaths
  };
  let report;
  if (role === 'developer') {
    report = developer;
  } else {
    if (!equal(readReport('developer'), developer)) block();
    if (role === 'qa') {
      report = inspectModelQa({ original, actual, changedPaths, report: developer });
      if (report.status !== 'passed') block();
    } else if (role === 'security') {
      report = inspectModelDiff({ original, actual, changedPaths, diff, report: developer });
      if (report.status !== 'passed') block();
    } else {
      const qa = readReport('qa');
      const security = readReport('security');
      report = inspectModelReviewer({
        original, actual, changedPaths, diff, proposal: developer, qa, security
      });
      if (report.status !== 'draft-pr-eligible') block();
    }
  }
  writeReport(role, report);
  return { role, status: report.status, prNumber: number, baseSha: base, headSha: head };
}

if (process.argv[1]?.endsWith('/aieo-candidate-role.mjs')) {
  const outcome = runCandidateRole(process.argv[2]);
  // No source, provider response, prompts or credentials in logs.
  console.log(JSON.stringify(outcome));
}
