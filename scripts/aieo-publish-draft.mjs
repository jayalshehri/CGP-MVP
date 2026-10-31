// Trusted, fail-closed publisher. It cannot merge, approve, or deploy.
// Call only after a manual main-branch dispatch and successful application gates.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';
import { inspectModelReviewer } from '../aieo/lib/model-gates.mjs';
import { attestModelSourceFile, attestModelReviewWorkspace } from '../aieo/lib/model-workspace-attestation.mjs';
import { APPROVED_TASK, orchestrate } from '../aieo/lib/engine.mjs';

function command(binary, args) {
  return execFileSync(binary, args, { encoding: 'utf8', stdio: 'pipe' });
}
// All Git operations that can trigger hooks must ignore runner-local hooks.
// Build/install steps may have created hooks; they must not run with GH_TOKEN.
function gitNoHooks(args) {
  return command('git', ['-c', 'core.hooksPath=/dev/null', ...args]);
}
// Credential helpers may be executable programs from local/global Git config.
// Reset the helper chain for EACH authenticated network operation, then add only
// the GitHub CLI helper backed by the narrowly-scoped GH_TOKEN environment.
// Avoid gh auth setup-git: it mutates persistent config and can leave an
// untrusted pre-existing helper in the chain.
export function authenticatedGitArgs(args) {
  return ['-c', 'core.hooksPath=/dev/null',
    '-c', 'credential.helper=',
    '-c', 'credential.helper=!gh auth git-credential', ...args];
}
function gitAuthenticated(args) {
  return command('git', authenticatedGitArgs(args));
}
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
function identical(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
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

export function verifyCandidate({ mode, original, actual, changedPaths, diff, reports }) {
  if (!Array.isArray(changedPaths) || changedPaths.length !== 1 ||
      changedPaths[0] !== MODEL_ALLOWED_PATH || original === actual) {
    fail('candidate changes must affect exactly one allowlisted tracked file');
  }
  if (mode === 'model') {
    const { proposal, qa, security, reviewer } = reports;
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

// The PR URL alone cannot attest to the actual branch owner or exact code.
export function verifyRemoteDraft({ remote, url, branch, commitSha }) {
  const canonical = /^https:\/\/github\.com\/jayalshehri\/CGP-MVP\/pull\/([1-9]\d*)$/.exec(url);
  if (!canonical) fail('Draft PR creation did not return a canonical repository URL');
  if (!remote || !Number.isSafeInteger(remote.number) ||
      remote.number !== Number(canonical[1]) || remote.url !== url ||
      remote.isDraft !== true || remote.state !== 'OPEN' ||
      remote.baseRefName !== 'main' || remote.headRefName !== branch ||
      remote.headRefOid !== commitSha ||
      remote.headRepositoryOwner?.login !== 'jayalshehri' ||
      remote.isCrossRepository !== false) {
    fail('Remote PR is not a matching open Draft at the pushed commit');
  }
  return true;
}

// The event name and ref alone do not prove which code was checked out.
// Attest the runner's exact trusted event commit and the actual Git-resolved push target.
// A canonical remote.origin.url alone is insufficient: pushurl and url.* rewrites can redirect pushes.
// Git can push to multiple configured pushurls: require exactly one resolved destination.
// Do not echo origin URLs: a misconfigured origin can contain credentials.
export function verifyTrustedCheckout({ env, checkedOutSha, originUrl, effectivePushUrls }) {
  // The trusted Actions checkout uses HTTPS. SSH remotes can execute local
  // ~/.ssh/config ProxyCommand or Match exec helpers with GH_TOKEN in scope,
  // even when Git hooks, core.sshCommand and askpass are blocked. The publisher
  // has no reason to invoke SSH: fail closed on both raw and resolved URLs.
  const trustedOrigins = new Set([
    'https://github.com/jayalshehri/CGP-MVP',
    'https://github.com/jayalshehri/CGP-MVP.git'
  ]);
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') ||
      checkedOutSha !== env.GITHUB_SHA || !trustedOrigins.has(originUrl) ||
      !Array.isArray(effectivePushUrls) || effectivePushUrls.length !== 1 ||
      !trustedOrigins.has(effectivePushUrls[0])) {
    fail('untrusted source checkout or Git push destination');
  }
  return true;
}

// Git attributes may execute arbitrary clean filters during git add even when
// hooks are disabled. Reject effective filter drivers on the allowlisted source.
export function verifyNoGitFilter(path, effectiveFilter) {
  if (path !== MODEL_ALLOWED_PATH || effectiveFilter !== path + ': filter: unspecified') {
    fail('Git attributes enable an untrusted clean filter on the reviewed file');
  }
  return true;
}

// core.fsmonitor is a separate executable hook used during index refreshes.
// core.hooksPath=/dev/null, --no-ext-diff and filter checks do not disable it.
// Check effective config before ANY publisher operation that reads the index.
export function verifyNoGitFsmonitor(effectiveSetting) {
  if (effectiveSetting !== 'false') {
    fail('untrusted Git fsmonitor configuration');
  }
  return true;
}

// Git can invoke a runner-configured SSH or askpass program with GH_TOKEN in the
// environment. The publisher has no need to execute transport overrides supplied
// by repository or runner configuration. Reject them before any authenticated push.
// GIT_EXEC_PATH may replace Git's HTTPS remote helper with an executable from
// an attacker-controlled directory, despite a canonical GitHub remote URL.
export function verifyNoGitTransportOverride({ env, effectiveSshCommand }) {
  const executableEnv = [
    'GIT_SSH_COMMAND', 'GIT_SSH', 'GIT_ASKPASS', 'SSH_ASKPASS',
    'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS', 'GIT_EXEC_PATH'
  ];
  if (effectiveSshCommand !== '' ||
      executableEnv.some((key) => typeof env[key] === 'string' && env[key].length > 0)) {
    fail('untrusted Git transport executable override');
  }
  return true;
}

// Git normally verifies HTTPS certificates. Local/runner config or environment
// overrides can silently disable verification for the credential-bearing push,
// letting a TLS-intercepting endpoint receive the GitHub token.
// Check the effective URL-matched setting for both accepted origin spellings.
export function verifyGitHttpsTls({ env, effectiveSslVerify }) {
  if (effectiveSslVerify !== 'true' ||
      (typeof env.GIT_SSL_NO_VERIFY === 'string' && env.GIT_SSL_NO_VERIFY.length > 0)) {
    fail('untrusted Git HTTPS TLS verification');
  }
  return true;
}
function effectiveGitSslVerify(url) {
  try {
    return command('git', ['config', '--bool', '--get-urlmatch', 'http.sslVerify', url]).trim();
  } catch (error) {
    // No matching config is Git's documented secure-by-default behavior.
    // Reject parse errors or other failures instead of treating them as safe.
    if (error?.status === 1) return 'true';
    throw error;
  }
}

// The GitHub CLI can silently select a different repository via GH_REPO or
// an alternate host via GH_HOST. Reject inherited routing overrides before
// the first Git subprocess; all later gh operations also name the repository.
export function verifyNoGitHubCliRoutingOverride(env) {
  if (['GH_REPO', 'GH_HOST'].some((key) =>
    typeof env[key] === 'string' && env[key].length > 0)) {
    fail('untrusted GitHub CLI repository or host routing');
  }
  return true;
}

// Git trace exports may write HTTP headers (including credentials if trace
// redaction is disabled) or patch/source data into attacker-chosen files.
// Never inherit diagnostic logging in a token-bearing publish process.
// Fail before the first Git subprocess, not merely before authenticated push.
export function verifyNoGitDiagnosticExport(env) {
  const unsafe = Object.entries(env).some(([key, value]) =>
    (/^GIT_TRACE[A-Z0-9_]*$/.test(key) || key === 'GIT_CURL_VERBOSE') &&
    typeof value === 'string' && value.length > 0);
  if (unsafe) fail('untrusted Git diagnostics configuration');
  return true;
}

// A custom remote.origin.vcs value selects an arbitrary git-remote-<vcs> executable,
// even when the origin and resolved push URL are the canonical GitHub HTTPS URL.
// Reject it before git index reads, branch creation or any authenticated push.
export function verifyNoGitRemoteHelper(effectiveVcs) {
  if (effectiveVcs !== '') {
    fail('untrusted Git remote helper override');
  }
  return true;
}

// git commit can invoke an executable signing driver (gpg.program, gpg.ssh.program,
// etc.) while GH_TOKEN is available. A runner requesting signed commits must
// fail closed rather than silently bypass its signing policy or execute a
// configurable external signer. --bool canonicalizes Git's true/on/1 values.
export function verifyNoGitCommitSigning(effectiveSetting) {
  if (effectiveSetting !== 'false') {
    fail('untrusted Git commit signing configuration');
  }
  return true;
}

// A Git hook or local Git config can mutate the index/tree after source gates run.
// Recheck the exact committed tree and single parent *before* any remote write.
export function verifyCommittedCandidate({ baseSha, parentSha, reviewedSource, committedSource, changedPaths }) {
  if (parentSha !== baseSha || committedSource !== reviewedSource ||
      !Array.isArray(changedPaths) || changedPaths.length !== 1 ||
      changedPaths[0] !== MODEL_ALLOWED_PATH) {
    fail('Committed patch does not match the reviewed candidate');
  }
  return true;
}

export function publishDraft({ env = process.env } = {}) {
  const mode = validateDispatch(env);
  verifyNoGitHubCliRoutingOverride(env);
  // Reject executable environment overrides before even invoking Git. A custom
  // GIT_EXEC_PATH can substitute remote-https when credentials are available.
  verifyNoGitTransportOverride({ env, effectiveSshCommand: '' });
  verifyNoGitDiagnosticExport(env);
  // Re-attest filesystem boundaries in the token-bearing publisher, not just
  // the earlier QA/Security/Reviewer processes. A replaced verdict symlink or
  // multiply-linked report must fail before any authenticated Git/gh writes.
  // Deterministic repairs need only the source check (no model reports exist).
  if (mode === 'model') attestModelReviewWorkspace(MODEL_ALLOWED_PATH);
  else attestModelSourceFile(MODEL_ALLOWED_PATH);
  // Reject a disabled SSL check even before running git. Git config can hold
  // a host- or path-specific override that takes precedence over global SSL.
  verifyGitHttpsTls({ env, effectiveSslVerify: 'true' });
  for (const url of [
    'https://github.com/jayalshehri/CGP-MVP',
    'https://github.com/jayalshehri/CGP-MVP.git'
  ]) verifyGitHttpsTls({ env, effectiveSslVerify: effectiveGitSslVerify(url) });
  // Git config reads do not refresh the index or launch the requested transport.
  // Both configuration and environment command overrides must fail closed.
  verifyNoGitTransportOverride({
    env,
    effectiveSshCommand: command('git', ['config', '--get', '--default', '', 'core.sshCommand']).trim()
  });
  // A Git remote.vcs override can execute git-remote-<vcs> during a trusted-URL push.
  verifyNoGitRemoteHelper(command('git', ['config', '--get', '--default', '', 'remote.origin.vcs']).trim());
  // A signed git commit may execute arbitrary configured signing software with
  // GH_TOKEN. Refuse signing requirements instead of weakening the configuration.
  verifyNoGitCommitSigning(command('git', ['config', '--bool', '--get', '--default', 'false', 'commit.gpgSign']).trim());
  // Reading config is index-free; reject an executable fsmonitor before diff/add.
  verifyNoGitFsmonitor(command('git', ['config', '--get', '--default', 'false', 'core.fsmonitor']).trim());
  verifyTrustedCheckout({
    env,
    checkedOutSha: command('git', ['rev-parse', 'HEAD']).trim(),
    originUrl: command('git', ['config', '--get', 'remote.origin.url']).trim(),
    effectivePushUrls: command('git', ['remote', 'get-url', '--push', '--all', 'origin'])
      .trim().split('\n').filter(Boolean)
  });
  // Git diff can execute external diff drivers or textconv converters;
  // disallow both for every comparison with the publisher's GH_TOKEN.
  const path = MODEL_ALLOWED_PATH;
  verifyNoGitFilter(path, command('git', ['check-attr', 'filter', '--', path]).trim());
  // Refuse pre-staged changes, untracked files and whitespace errors before any write.
  if (command('git', ['diff', '--no-ext-diff', '--no-textconv', '--cached', '--name-only']).trim()) fail('unexpected staged files');
  if (command('git', ['ls-files', '--others', '--exclude-standard'])
      .split('\n').filter(Boolean).some((p) => p !== 'aieo-output' && !p.startsWith('aieo-output/'))) {
    fail('unexpected untracked repository files');
  }
  command('git', ['diff', '--no-ext-diff', '--no-textconv', '--check']);
  const original = command('git', ['show', 'HEAD:' + path]);
  const actual = readFileSync(path, 'utf8');
  const changedPaths = command('git', ['diff', '--no-ext-diff', '--no-textconv', '--name-only']).trim().split('\n').filter(Boolean);
  const diff = command('git', ['diff', '--no-ext-diff', '--no-textconv', '--unified=0', '--', path]);
  const reports = mode === 'model' ? {
    proposal: readJson('aieo-output/model-proposal.json'),
    qa: readJson('aieo-output/model-qa.json'),
    security: readJson('aieo-output/model-security.json'),
    reviewer: readJson('aieo-output/model-reviewer.json')
  } : {};
  verifyCandidate({ mode, original, actual, changedPaths, diff, reports });
  const branch = 'aieo/' + (mode === 'model' ? 'model-proposal-' : 'repair-feedback-') +
    env.GITHUB_RUN_ID + '-' + env.GITHUB_RUN_ATTEMPT;
  command('git', ['config', 'user.name', 'github-actions[bot]']);
  command('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
  gitNoHooks(['switch', '-c', branch]);
  gitNoHooks(['add', '--', path]);
  if (command('git', ['diff', '--no-ext-diff', '--no-textconv', '--cached', '--name-only']).trim() !== path) fail('unexpected staged scope');
  gitNoHooks(['commit', '-m', 'feat(aieo): bounded candidate for human review']);
  const committedSha = command('git', ['rev-parse', 'HEAD']).trim();
  verifyCommittedCandidate({
    baseSha: env.GITHUB_SHA,
    parentSha: command('git', ['rev-parse', 'HEAD^']).trim(),
    reviewedSource: actual,
    committedSource: command('git', ['show', 'HEAD:' + path]),
    changedPaths: command('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'])
      .trim().split('\n').filter(Boolean)
  });
  // Do not inherit arbitrary credential helpers or modify runner Git config.
  gitAuthenticated(['push', 'origin', 'HEAD:refs/heads/' + branch]);
  const pushedRef = gitAuthenticated(['ls-remote', 'origin', 'refs/heads/' + branch]).trim();
  if (pushedRef !== committedSha + '\trefs/heads/' + branch) {
    fail('Remote branch does not point to the reviewed commit');
  }
  const body = 'Candidate scope, independent checks and build were verified before publishing. ' +
    'DRAFT only. No automatic approval, merge or production deployment.';
  const pr = command('gh', ['pr', 'create', '--draft', '--repo', env.GITHUB_REPOSITORY,
    '--base', 'main', '--head', branch, '--title', 'AIEO: bounded ' + mode + ' proposal for review', '--body', body]).trim();
  // A zero exit from gh is not proof that a new PR is actually Draft. Verify
  // the remote PR's identity and protection-relevant fields before reporting
  // success or dispatching any follow-up CI. Never fall back to a ready PR.
  let remote;
  try {
    remote = JSON.parse(command('gh', [
      'pr', 'view', pr, '--repo', env.GITHUB_REPOSITORY,
      '--json', 'number,url,isDraft,state,baseRefName,headRefName,headRefOid,headRepositoryOwner,isCrossRepository'
    ]));
  } catch {
    fail('Created PR could not be independently verified');
  }
  verifyRemoteDraft({ remote, url: pr, branch, commitSha: committedSha });
  if (mode === 'model') command('gh', ['workflow', 'run', 'cgp-required-ci.yml',
    '--repo', env.GITHUB_REPOSITORY, '--ref', branch]);
  return { status: 'draft-pr-created', branch, pr, requiresHumanMerge: true };
}

if (process.argv[1]?.endsWith('/aieo-publish-draft.mjs')) {
  // Never print source, model proposals, prompts or credentials.
  const result = publishDraft();
  console.log(JSON.stringify(result));
}
