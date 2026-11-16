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
// Unlike the explicit gh API call, public read-only Git operations have no
// reason to inherit credentials from unrelated CI steps (npm, databases,
// cloud SDKs, provider APIs or an SSH agent). Deny common credential-shaped
// variable names as well as the known GitHub/OpenRouter keys. This is a
// defense-in-depth scrub, not a substitute for the inherited Git/GH override
// rejection or a claim that arbitrary environment variable names are safe.
const GIT_CHILD_CREDENTIAL_ENV = /(?:^|_)(?:TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?|API_KEY|PRIVATE_KEY|ACCESS_KEY|AUTH)(?:_|$)|^(?:PGPASSWORD|PGPASSFILE|DATABASE_URL|REDIS_URL|MONGODB_URI|SSH_AUTH_SOCK)$/i;

export function readOnlyGitEnvironment(env = process.env) {
  const scoped = { ...env };
  for (const name of Object.keys(scoped)) {
    if (GIT_CHILD_CREDENTIAL_ENV.test(name)) delete scoped[name];
  }
  return scoped;
}
