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

export function hasUnsafeGitEnvironment(env) {
  return Object.keys(env ?? {}).some((name) =>
    UNSAFE_GIT_ENV.test(name) || UNSAFE_GH_ENV.test(name));
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
  return scoped;
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
