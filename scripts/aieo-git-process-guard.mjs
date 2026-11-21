import { execFileSync } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';

// AIEO Git commands run inside role and publisher processes that may hold
// repository-scoped GitHub tokens. Never inherit Git environment overrides
// capable of rerouting worktrees, executing helpers, disabling TLS, or logging
// credential-bearing transport data. Use a shared denylist for every role.
const UNSAFE_GIT_ENV = /^(?:GIT_CONFIG(?:_[A-Z0-9_]+)?|GIT_DIR|GIT_COMMON_DIR|GIT_WORK_TREE|GIT_INDEX_FILE|GIT_OBJECT_DIRECTORY|GIT_ALTERNATE_OBJECT_DIRECTORIES|GIT_SSH(?:_COMMAND)?|GIT_ASKPASS|GIT_PROXY_COMMAND|GIT_TEMPLATE_DIR|GIT_NAMESPACE|GIT_REPLACE_REF_BASE|GIT_GRAFT_FILE|GIT_EXEC_PATH|GIT_EXTERNAL_DIFF|GIT_PAGER|GIT_EDITOR|GIT_SEQUENCE_EDITOR|GIT_TRACE(?:[0-9A-Z_]*)|GIT_CURL_VERBOSE|GIT_SSL_NO_VERIFY|GIT_CEILING_DIRECTORIES|GIT_DISCOVERY_ACROSS_FILESYSTEM|GIT_PROTOCOL(?:_FROM_USER)?|GIT_ALLOW_PROTOCOL)$/;

// A GitHub CLI invoked with GH_TOKEN must likewise never inherit host, repo,
// config, debug, pager or editor overrides from a previous build step. GH_HOST
// can redirect API calls; GH_REPO can retarget PR creation. Do NOT reject
// GH_TOKEN itself, which is the intended scoped Actions credential.
const UNSAFE_GH_ENV = /^(?:GH_HOST|GH_REPO|GH_CONFIG_DIR|GH_DEBUG|GH_PAGER|GH_EDITOR|GH_BROWSER|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN)$/;

// Transport environment variables can silently retarget HTTPS through a
// proxy or replace CA trust even when origin and Git config are canonical.
// These can be persisted by earlier build steps via GITHUB_ENV, so reject
// them before any privileged Git or GitHub CLI subprocess.
const UNSAFE_TRANSPORT_ENV = /^(?:(?:https?|all|no)_proxy|curl_ca_bundle|ssl_cert_file|ssl_cert_dir|requests_ca_bundle|node_extra_ca_certs|node_tls_reject_unauthorized|git_ssl_[a-z0-9_]+|git_proxy_ssl_[a-z0-9_]+|git_http_(?:extraheader|proxy_authmethod))$/i;

export function hasUnsafeGitEnvironment(env) {
  return Object.keys(env ?? {}).some((name) =>
    UNSAFE_GIT_ENV.test(name) || UNSAFE_GH_ENV.test(name) ||
    UNSAFE_TRANSPORT_ENV.test(name));
}

/**
 * Independent PR roles only require GitHub credentials for the explicit gh API
 * calls. Their Git commands inspect public, pinned commits and must not pass
 * any Actions/model credential to repository-local Git helpers or transports.
 * This is defense-in-depth: the inherited Git override guard remains required.
 */
// A negative-pattern scrub is not sufficient: a credential such as
// ORG_SESSION_DATA, CUSTOM_PAT or an arbitrary newly named secret would
// otherwise reach Git's subprocesses. Keep only the minimal OS/locale and
// runner variables required by read-only Git inspection. In particular,
// never forward NODE_OPTIONS, SSH_* sockets, proxy variables, model keys,
// npm configuration or custom CI variables to Git or its helpers.
//
// This is for the four independent read-only roles and the post-build
// finalizer only. The separate publisher authenticates a Git push, so its
// privileged process must retain its own independent protections.
const READ_ONLY_GIT_ENV_NAMES = new Set([
  'PATH', 'HOME', 'LANG', 'LANGUAGE', 'LC_ALL', 'LC_CTYPE', 'LC_MESSAGES',
  'TMPDIR', 'TMP', 'TEMP', 'CI', 'GITHUB_ACTIONS',
  'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'USERPROFILE'
]);

export function readOnlyGitEnvironment(env = process.env) {
  const scoped = {};
  for (const name of READ_ONLY_GIT_ENV_NAMES) {
    if (Object.hasOwn(env, name)) scoped[name] = env[name];
  }
  // Public, read-only Git operations must fail rather than trying an
  // interactive credential prompt or a helper supplied by a later step.
  scoped.GIT_TERMINAL_PROMPT = '0';
  // Local .git/refs/replace can substitute objects while preserving pinned
  // SHA strings. Never let untrusted replacement refs rewrite reviewed blobs.
  scoped.GIT_NO_REPLACE_OBJECTS = '1';
  return scoped;
}

// Unlike Git, the independent roles' GH CLI must receive the read-scoped
// GitHub API credential, but no provider, app, CI or arbitrary environment
// secrets inherited from an earlier job step. Keep the same allowlisted OS
// variables as Git and add only GH_TOKEN. Synthetic local fixtures may pass
// their exact fake API response file paths; those test variables are never
// forwarded to a credentialed Actions process.
export function readOnlyGitHubCliEnvironment(env = process.env) {
  const scoped = readOnlyGitEnvironment(env);
  if (Object.hasOwn(env, 'GH_TOKEN')) scoped.GH_TOKEN = env.GH_TOKEN;
  if (env.GITHUB_ACTIONS === 'false' &&
      ['fixture-never-live', 'synthetic-fixture-not-a-secret'].includes(env.GH_TOKEN)) {
    for (const name of ['AIEO_FAKE_PR_FILE', 'AIEO_FAKE_PR_SECOND',
      'AIEO_FAKE_PR_COUNTER']) {
      if (Object.hasOwn(env, name)) scoped[name] = env[name];
    }
  }
  return scoped;
}

// Resolve gh once before any independently reviewed candidate is inspected.
// GitHub API readback occurs twice per role; a later replacement of a PATH
// symlink must never switch the second, GH_TOKEN-bearing read to another
// executable. Use the resolved absolute program for *every* gh API call.
// This pins PATH aliases, not a hostile replacement of the real file itself;
// the runner and trusted checkout remain separate security prerequisites.
export function pinReadOnlyGitHubCli(env = process.env) {
  if (typeof env?.PATH !== 'string' || !env.PATH) {
    throw new Error('AIEO GitHub CLI PATH is missing');
  }
  const directories = env.PATH.split(delimiter);
  if (directories.some((directory) => !directory || !isAbsolute(directory))) {
    throw new Error('AIEO GitHub CLI PATH must contain only absolute directories');
  }
  for (const directory of directories) {
    try {
      const resolved = realpathSync(join(directory, 'gh'));
      const candidate = statSync(resolved);
      if (candidate.isFile() && (candidate.mode & 0o111)) return resolved;
    } catch { /* Continue through other trusted PATH entries. */ }
  }
  throw new Error('AIEO GitHub CLI executable is unavailable');
}

/**
 * Git reads must never honor repository/global settings that enable remote
 * shell transports or executable credential helpers. A read-only fetch can
 * still launch these helpers, even when its child environment has no token.
 * File transport is retained for isolated local Git fixtures; production's
 * public GitHub fetch uses HTTPS. Command-line -c overrides local Git config.
 */
export function readOnlyGitArguments(args) {
  if (!Array.isArray(args) || args.length === 0) throw new Error('Expected Git arguments');
  return [
    '--no-replace-objects',
    '-c', 'core.fsmonitor=false',
    '-c', 'core.hooksPath=/dev/null',
    '-c', 'credential.helper=',
    '-c', 'protocol.allow=never',
    '-c', 'protocol.https.allow=always',
    '-c', 'protocol.file.allow=always',
    '-c', 'protocol.ext.allow=never',
    ...(args[0] === 'diff'
      ? ['diff', '--no-ext-diff', '--no-textconv',
        ...args.slice(1).filter((flag) =>
          flag !== '--no-ext-diff' && flag !== '--no-textconv')]
      : args)
  ];
}


// A previously trusted checkout can gain executable clean filters from
// .git/info/attributes, global attributes or repository .gitattributes. Unlike
// object-to-object diffs, worktree 'git diff' invokes filter.<driver>.clean
// even with --no-ext-diff/--no-textconv. Attest every tracked path BEFORE any
// role/finalizer worktree diff; checking only the proposed file misses changes
// to another tracked path. Neither ls-files nor check-attr runs clean filters.
export function assertNoTrackedGitFilters(env = process.env) {
  const options = {
    env: readOnlyGitEnvironment(env), stdio: 'pipe', maxBuffer: 512000
  };
  const trackedBytes = execFileSync('git', readOnlyGitArguments(['ls-files', '-z']), options);
  const tracked = trackedBytes.toString('utf8');
  if (!Buffer.from(tracked, 'utf8').equals(trackedBytes) ||
      !tracked.endsWith('\0') || trackedBytes.length > 250000) {
    throw new Error('AIEO tracked paths cannot be attested');
  }
  const paths = tracked.slice(0, -1).split('\0');
  if (!paths.length || paths.some((path) => !path) ||
      new Set(paths).size !== paths.length) {
    throw new Error('AIEO tracked index is not a normal checkout');
  }
  const responseBytes = execFileSync('git',
    readOnlyGitArguments(['check-attr', '-z', '--stdin', 'filter']),
    { ...options, input: trackedBytes });
  const response = responseBytes.toString('utf8');
  if (!Buffer.from(response, 'utf8').equals(responseBytes) ||
      !response.endsWith('\0')) {
    throw new Error('AIEO Git attribute attestation is invalid');
  }
  const fields = response.slice(0, -1).split('\0');
  if (fields.length !== paths.length * 3) {
    throw new Error('AIEO Git attribute attestation is incomplete');
  }
  for (let index = 0; index < paths.length; index++) {
    if (fields[index * 3] !== paths[index] ||
        fields[index * 3 + 1] !== 'filter' ||
        fields[index * 3 + 2] !== 'unspecified') {
      throw new Error('AIEO tracked source has an active or unverified Git content filter');
    }
  }
}
