// Read-only roles for an already-created, official GitHub Actions model Draft PR.
// All role processes run trusted main-branch code and inspect immutable Git commits.
// This is post-creation QA, not authorization to merge, publish or disclose source.
import { execFileSync } from 'node:child_process';
import { mkdirSync, lstatSync, openSync, fstatSync, readSync, writeSync, closeSync, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';
import { inspectModelQa, inspectModelReviewer } from '../aieo/lib/model-gates.mjs';
import { inspectModelDiff } from './aieo-model-security.mjs';
import { readBoundedRoleReport } from './aieo-role-artifact-io.mjs';
import { hasUnsafeGitEnvironment, readOnlyGitEnvironment, readOnlyGitHubCliEnvironment, pinReadOnlyGitHubCli, pinReadOnlyGitExecutable, readOnlyGitArguments, assertNoTrackedGitFilters } from './aieo-git-process-guard.mjs';

const SHA = /^[a-f0-9]{40}$/;
const BRANCH = /^aieo\/model-proposal-[0-9]+-[1-9][0-9]*$/;
const REPO = 'jayalshehri/CGP-MVP';
const ROLES = ['developer', 'qa', 'security', 'reviewer'];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function block() {
  throw new Error('AIEO candidate role blocked: unverified remote Draft PR or candidate evidence');
}
let pinnedRoleGitExecutable = null;
// Git attributes and local config can execute textconv and fsmonitor programs
// even during otherwise read-only role inspection. Do not execute checkout
// helpers with the role's read-scoped GH_TOKEN.
function git(args) {
  if (!pinnedRoleGitExecutable) block();
  // A tracked clean filter can be enabled after the initial role preflight.
  // Both status and worktree diff may invoke its executable helper, even when
  // the Git child environment has no credentials. Re-attest immediately before
  // each such command, rather than trusting an earlier checkout inspection.
  if (args[0] === 'status' || args[0] === 'diff') {
    try { assertNoTrackedGitFilters(process.env, pinnedRoleGitExecutable); }
    catch { block(); }
  }
  const safeArgs = readOnlyGitArguments(args);
  return execFileSync(pinnedRoleGitExecutable, safeArgs, {
    encoding: 'utf8', stdio: 'pipe', maxBuffer: 256000,
    env: readOnlyGitEnvironment(process.env)
  });
}
// A Unicode string from execFileSync(encoding: 'utf8') is not proof of the
// immutable Git blob's actual bytes: Node silently inserts U+FFFD for malformed
// UTF-8. Independent role attestations must bind to exactly the bytes published,
// including when the previous trusted base or the candidate is malformed.
function readStrictGitSource(revision) {
  const bytes = execFileSync(pinnedRoleGitExecutable, readOnlyGitArguments(['show', revision + ':' + MODEL_ALLOWED_PATH]),
    { stdio: 'pipe', maxBuffer: 256000, env: readOnlyGitEnvironment(process.env) });
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > 48000) block();
  const source = bytes.toString('utf8');
  if (!Buffer.from(source, 'utf8').equals(bytes)) block();
  return source;
}
// The Developer's first evidence is not yet protected by a downstream
// reader. Require a private 0700-style output directory before writing any
// provenance; later roles also use this boundary for their own reports.
// A 0755 directory exposes report names and metadata despite private files.
function trustedReportDirectory() {
  try {
    const uid = process.getuid?.();
    if (!Number.isSafeInteger(uid)) block();
    const directory = lstatSync('aieo-output');
    if (!directory.isDirectory() || directory.isSymbolicLink() ||
        directory.uid !== uid || (directory.mode & 0o7077) ||
        (directory.mode & 0o700) !== 0o700) block();
    return directory;
  } catch { block(); }
}
function readReport(role) {
  return readBoundedRoleReport(role);
}

// A verified PR SHA is insufficient reason to contact an arbitrary transport:
// a changed .git/config or url.*.insteadOf can silently redirect "origin".
// Git remote get-url --all expands URL rewrites before this strict comparison.
// Only real Actions runs require the official network origin; standalone local
// Git fixtures exercise role logic without making external network calls.
// A canonical origin URL is not enough: local/global Git configuration can
// route HTTPS through an attacker-selected proxy, disable TLS validation,
// inject HTTP headers or select custom remote helpers. Fail closed before
// network contact. --name-only --list includes URL-specific http.* settings.
export function verifyOfficialCandidateFetchConfig(keys) {
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > 4096 ||
      keys.some((key) => typeof key !== 'string' || !key ||
        key.length > 512 || /[\r\n\0]/.test(key) ||
        /^(?:http|credential|url)\./i.test(key) ||
        // Git transport/client-side authentication can execute configured
        // commands even with a canonical HTTPS origin and no env override.
        // core.askPass in particular runs a shell helper on a credential
        // challenge while the publisher holds a write-scoped GH_TOKEN.
        /^(?:core\.(?:askpass|sshcommand|gitproxy|alternaterefscommand)|uploadpack\.packobjectshook)$/i.test(key) ||
        (/^remote\.origin\./i.test(key) &&
          !/^remote\.origin\.(?:url|fetch|tagopt)$/.test(key)))) block();
  if (!keys.includes('remote.origin.url') ||
      !keys.includes('remote.origin.fetch')) block();
  return true;
}

export function verifyOfficialCandidateFetchOrigin(urls) {
  if (!Array.isArray(urls) || urls.length !== 1 ||
      !/^https:\/\/github\.com\/jayalshehri\/CGP-MVP(?:\.git)?$/.test(urls[0])) block();
  return true;
}

// The gh CLI honors GH_HOST for API transport and GH_REPO for implicit PR
// targeting. Untrusted prior build steps can inject either through GITHUB_ENV,
// causing read/write-scoped GH_TOKEN to contact the wrong host or repository.
// Custom gh configuration is also forbidden at this privileged boundary.
// Accept only explicit, canonical values (or the standard unset defaults).
export function verifyOfficialGitHubCliContext(env = process.env) {
  if (!env ||
      (env.GH_HOST !== undefined && env.GH_HOST !== 'github.com') ||
      (env.GH_REPO !== undefined && env.GH_REPO !== REPO) ||
      (env.GH_CONFIG_DIR !== undefined && env.GH_CONFIG_DIR !== '')) block();
  return true;
}

// Candidate role handoffs must be write-once. Replaying an identical report
// is idempotent for local fixtures, but cannot replace any existing bytes.
// A fresh write is exclusive and both paths reject aliases and unsafe modes.
function writeReport(role, report) {
  mkdirSync('aieo-output', { recursive: true, mode: 0o700 });
  const directory = trustedReportDirectory();
  const name = 'aieo-output/candidate-' + role + '.json';
  const data = Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8');
  if (data.length < 2 || data.length > 65536) block();
  let fd;
  try {
    // O_EXCL atomically refuses an existing output, even if it is an ordinary
    // private file. Do not reopen old reports writable and truncate them.
    fd = openSync(name, constants.O_RDWR | constants.O_CREAT |
      constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  } catch (error) {
    if (error?.code !== 'EEXIST') block();
    // Preserve local rehearsal retries that produce exactly the same report.
    // The bounded reader rejects aliases and noncanonical JSON before compare.
    let previous;
    try { previous = readBoundedRoleReport(role); } catch { block(); }
    if (JSON.stringify(previous, null, 2) + '\n' !== data.toString('utf8')) block();
    return;
  }
  try {
    const before = fstatSync(fd);
    // Newly created output must be empty, private, regular and unaliased.
    if (!before.isFile() || before.nlink !== 1 ||
        before.uid !== directory.uid ||
        !(before.mode & 0o400) || (before.mode & 0o7177) ||
        before.size !== 0) block();
    let written = 0;
    while (written < data.length) {
      const count = writeSync(fd, data, written, data.length - written);
      if (count <= 0) block();
      written += count;
    }
    // A successful write return value only attests the count, not the bytes.
    // Independently read back the same opened inode, with a one-byte overread
    // guard, before allowing Developer/QA/Security/Reviewer evidence to pass.
    // This is especially important for the first Developer handoff, which has
    // no preceding report against which its content can be compared.
    const echoed = Buffer.alloc(data.length + 1);
    let echoedBytes = 0;
    while (echoedBytes < echoed.length) {
      const count = readSync(fd, echoed, echoedBytes,
        echoed.length - echoedBytes, echoedBytes);
      if (count === 0) break;
      echoedBytes += count;
    }
    if (echoedBytes !== data.length ||
        !echoed.subarray(0, echoedBytes).equals(data)) block();
    const file = fstatSync(fd);
    const current = lstatSync(name);
    const directoryNow = trustedReportDirectory();
    if (!file.isFile() || file.nlink !== 1 ||
        file.uid !== directory.uid ||
        !(file.mode & 0o400) || (file.mode & 0o7177) ||
        file.size !== data.length ||
        !current.isFile() || current.isSymbolicLink() ||
        current.nlink !== 1 || current.uid !== directory.uid ||
        !(current.mode & 0o400) || (current.mode & 0o7177) ||
        current.size !== data.length ||
        current.dev !== file.dev || current.ino !== file.ino ||
        // The final pathname may still resolve to the same inode after a
        // same-inode metadata rewrite between fstat and lstat. Bind the
        // first Developer handoff (and all later role writes) to the opened
        // descriptor's final timestamps, not just its size and inode.
        current.mtimeMs !== file.mtimeMs ||
        current.ctimeMs !== file.ctimeMs ||
        directoryNow.uid !== directory.uid || (directoryNow.mode & 0o7077) ||
        (directoryNow.mode & 0o700) !== 0o700 ||
        directoryNow.dev !== directory.dev || directoryNow.ino !== directory.ino) block();
  } catch { block(); }
  finally { if (fd !== undefined) closeSync(fd); }
}
// An injected fixture object cannot make an actual credential-bearing process
// skip the official GitHub origin check. Inspect both the supplied context and
// the live process before ANY git/gh subprocess or artifact IO. Only two
// intentionally nonfunctional sentinels are eligible for offline rehearsal.
const OFFLINE_FIXTURE_TOKENS = new Set([
  'fixture-never-live', 'synthetic-fixture-not-a-secret'
]);
export function verifyCandidateActionsContext(env = process.env) {
  const offlineFixture = env?.GITHUB_ACTIONS === 'false' &&
    OFFLINE_FIXTURE_TOKENS.has(env?.GH_TOKEN);
  const liveProcessCredential = [process.env.GH_TOKEN, process.env.GITHUB_TOKEN]
    .some((value) => typeof value === 'string' && value.length > 0 &&
      !OFFLINE_FIXTURE_TOKENS.has(value));
  if ((!offlineFixture && env?.GITHUB_ACTIONS !== 'true') ||
      (liveProcessCredential &&
        (process.env.GITHUB_ACTIONS !== 'true' || env?.GITHUB_ACTIONS !== 'true'))) block();
  return offlineFixture;
}
function verifiedRemoteContext(env, ghExecutable) {
  const number = env.AIEO_PR_NUMBER;
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_REPOSITORY !== REPO ||
      !/^[1-9][0-9]*$/.test(number || '') ||
      !env.GH_TOKEN) block();
  const offlineFixture = verifyCandidateActionsContext(env);
  let pr;
  try {
    pr = JSON.parse(execFileSync(ghExecutable, ['api', 'repos/' + REPO + '/pulls/' + number],
      { encoding: 'utf8', stdio: 'pipe', maxBuffer: 256000,
        env: readOnlyGitHubCliEnvironment(process.env) }));
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
    // A credential-bearing Actions fetch always needs the official remote,
    // even if a prior step tried to downgrade the Actions context.
    if (!offlineFixture) {
      // Origin URL checks do not inspect transport proxy/TLS/extraheader
      // settings, including URL-scoped overrides and remote-helper config.
      const configNames = git(['config', '--name-only', '--list'])
        .trim().split('\n');
      verifyOfficialCandidateFetchConfig(configNames);
      const originUrls = git(['remote', 'get-url', '--all', 'origin'])
        .trim().split('\n');
      verifyOfficialCandidateFetchOrigin(originUrls);
    }
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
  return { base, head, headRef, number: Number(number) };
}

// A PR may be undrafted, retargeted, closed or force-pushed while a role is
// fetching, inspecting and recomputing the proposed candidate. Check the
// live REST state AGAIN immediately before writing any role attestation;
// the first response and immutable Git object alone do not authorize a
// later evidence handoff. Never print an untrusted API response.
function reattestRemoteDraft({ base, head, headRef, number, ghExecutable }) {
  let pr;
  try {
    pr = JSON.parse(execFileSync(ghExecutable, ['api', 'repos/' + REPO + '/pulls/' + number],
      { encoding: 'utf8', stdio: 'pipe', maxBuffer: 256000,
        env: readOnlyGitHubCliEnvironment(process.env) }));
  } catch { block(); }
  if (pr?.number !== number ||
      pr?.html_url !== 'https://github.com/' + REPO + '/pull/' + number ||
      pr?.state !== 'open' || pr?.draft !== true || pr?.merged_at !== null ||
      pr?.user?.login !== 'github-actions[bot]' ||
      pr?.user?.id !== 41898282 || pr?.user?.type !== 'Bot' ||
      pr?.base?.repo?.full_name !== REPO ||
      pr?.head?.repo?.full_name !== REPO ||
      pr?.base?.ref !== 'main' || pr?.base?.sha !== base ||
      !BRANCH.test(pr?.head?.ref || '') ||
      // The exact branch identity must remain pinned, even if a retargeted
      // model-proposal branch points to the very same immutable head commit.
      pr?.head?.ref !== headRef ||
      pr?.head?.sha !== head) block();
}

export function runCandidateRole(role, env = process.env) {
  // Reject before Git, gh, or artifact IO: a compromised prior step must not
  // change the trusted repository view or execute helpers under GH_TOKEN.
  if (hasUnsafeGitEnvironment(process.env) || hasUnsafeGitEnvironment(env)) block();
  // Validate both the real child environment and any injected test context
  // before invoking git, gh, or reading/writing review evidence.
  verifyOfficialGitHubCliContext(process.env);
  verifyOfficialGitHubCliContext(env);
  verifyCandidateActionsContext(env);
  if (!ROLES.includes(role)) block();
  let ghExecutable;
  try { ghExecutable = pinReadOnlyGitHubCli(process.env); } catch { block(); }
  // A worktree diff may invoke an attribute-selected clean filter despite
  // --no-textconv. Reject effective filters before any Git diff or handoff.
  try { pinnedRoleGitExecutable = pinReadOnlyGitExecutable(process.env); } catch { block(); }
  try { assertNoTrackedGitFilters(process.env, pinnedRoleGitExecutable); } catch { block(); }
  const { base, head, headRef, number } = verifiedRemoteContext(env, ghExecutable);
  let original, actual, changedPaths, diff;
  try {
    original = readStrictGitSource(base);
    actual = readStrictGitSource(head);
    changedPaths = git(['diff', '--no-ext-diff', '--name-only', base, head])
      .trim().split('\n').filter(Boolean);
    diff = git(['diff', '--no-ext-diff', '--unified=0', base, head, '--', MODEL_ALLOWED_PATH]);
  } catch { block(); }
  if (changedPaths.length !== 1 || changedPaths[0] !== MODEL_ALLOWED_PATH ||
      original === actual || !diff || diff.length > 20000) block();

  const developer = {
    schemaVersion: 1, role: 'developer', status: 'proposed', path: MODEL_ALLOWED_PATH,
    prNumber: number, baseSha: base, headSha: head, headRef,
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
  reattestRemoteDraft({ base, head, headRef, number, ghExecutable });
  writeReport(role, report);
  return { role, status: report.status, prNumber: number, baseSha: base, headSha: head };
}

if (process.argv[1]?.endsWith('/aieo-candidate-role.mjs')) {
  const outcome = runCandidateRole(process.argv[2]);
  // No source, provider response, prompts or credentials in logs.
  console.log(JSON.stringify(outcome));
}
