// AIEO Git commands run inside role and publisher processes that may hold
// repository-scoped GitHub tokens. Never inherit Git environment overrides
// capable of rerouting worktrees, executing helpers, disabling TLS, or logging
// credential-bearing transport data. Use a shared denylist for every role.
const UNSAFE_GIT_ENV = /^(?:GIT_CONFIG(?:_[A-Z0-9_]+)?|GIT_DIR|GIT_COMMON_DIR|GIT_WORK_TREE|GIT_INDEX_FILE|GIT_OBJECT_DIRECTORY|GIT_ALTERNATE_OBJECT_DIRECTORIES|GIT_SSH(?:_COMMAND)?|GIT_ASKPASS|GIT_PROXY_COMMAND|GIT_TEMPLATE_DIR|GIT_NAMESPACE|GIT_REPLACE_REF_BASE|GIT_GRAFT_FILE|GIT_EXEC_PATH|GIT_EXTERNAL_DIFF|GIT_PAGER|GIT_EDITOR|GIT_SEQUENCE_EDITOR|GIT_TRACE(?:[0-9A-Z_]*)|GIT_CURL_VERBOSE|GIT_SSL_NO_VERIFY|GIT_CEILING_DIRECTORIES|GIT_DISCOVERY_ACROSS_FILESYSTEM|GIT_PROTOCOL(?:_FROM_USER)?|GIT_ALLOW_PROTOCOL)$/;

// A GitHub CLI invoked with GH_TOKEN must likewise never inherit host, repo,
// config, debug, pager or editor overrides from a previous build step. GH_HOST
// can redirect API calls; GH_REPO can retarget PR creation. Do NOT reject
// GH_TOKEN itself, which is the intended scoped Actions credential.
const UNSAFE_GH_ENV = /^(?:GH_HOST|GH_REPO|GH_CONFIG_DIR|GH_DEBUG|GH_PAGER|GH_EDITOR|GH_BROWSER|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN|GITHUB_API_URL|GITHUB_GRAPHQL_URL)$/;

export function hasUnsafeGitEnvironment(env) {
  return Object.keys(env ?? {}).some((name) =>
    UNSAFE_GIT_ENV.test(name) || UNSAFE_GH_ENV.test(name));
}
