import test from 'node:test';
import assert from 'node:assert/strict';
import { hasUnsafeGitEnvironment, readOnlyGitEnvironment, readOnlyGitArguments } from './aieo-git-process-guard.mjs';

test('independent read-only Git children do not inherit common CI or cloud credentials', () => {
  const input = {
    PATH: '/usr/bin:/bin',
    HOME: '/home/runner',
    LANG: 'C.UTF-8',
    CI: 'true',
    AIEO_PR_NUMBER: '123',
    GH_TOKEN: 'synthetic-gh-only',
    GITHUB_TOKEN: 'synthetic-github-only',
    GH_ENTERPRISE_TOKEN: 'synthetic-enterprise-only',
    GITHUB_ENTERPRISE_TOKEN: 'synthetic-enterprise-alt',
    OPENROUTER_API_KEY: 'synthetic-provider-only',
    NPM_TOKEN: 'synthetic-npm-only',
    NODE_AUTH_TOKEN: 'synthetic-node-only',
    AWS_ACCESS_KEY_ID: 'synthetic-access-key-only',
    AWS_SECRET_ACCESS_KEY: 'synthetic-secret-only',
    AWS_SESSION_TOKEN: 'synthetic-session-only',
    GOOGLE_APPLICATION_CREDENTIALS: '/tmp/synthetic-credentials',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role-only',
    DATABASE_URL: 'postgres://synthetic:password@example.invalid/db',
    REDIS_URL: 'redis://synthetic:password@example.invalid',
    MONGODB_URI: 'mongodb://synthetic:password@example.invalid',
    PGPASSWORD: 'synthetic-pg-only',
    PGPASSFILE: '/tmp/synthetic-pgpass',
    SSH_AUTH_SOCK: '/tmp/synthetic-agent.sock',
    CUSTOM_PASSWORD: 'synthetic-password',
    INTERNAL_AUTH: 'synthetic-auth'
  };
  const result = readOnlyGitEnvironment(input);
  assert.deepEqual(result, {
    PATH: '/usr/bin:/bin',
    HOME: '/home/runner',
    LANG: 'C.UTF-8',
    CI: 'true',
    GIT_TERMINAL_PROMPT: '0',
    GIT_NO_REPLACE_OBJECTS: '1'
  });
  assert.equal(input.GH_TOKEN, 'synthetic-gh-only', 'the parent process must remain unchanged for scoped gh API calls');
});

test('unknown future secret names and execution/proxy overrides never reach read-only Git', () => {
  const input = {
    PATH: '/usr/bin',
    CI: 'true',
    GITHUB_ACTIONS: 'true',
    LC_ALL: 'C.UTF-8',
    ORG_SESSION_DATA: 'synthetic-undocumented-secret',
    CUSTOM_PAT: 'synthetic-private-token',
    VENDOR_CLIENT_MATERIAL: 'synthetic-credential',
    NPM_CONFIG_USERCONFIG: '/tmp/synthetic-npmrc',
    NODE_OPTIONS: '--require=/tmp/synthetic-hook.js',
    BASH_ENV: '/tmp/synthetic-shell-hook',
    HTTPS_PROXY: 'https://synthetic-proxy.invalid',
    XDG_CONFIG_HOME: '/tmp/synthetic-config',
    SSH_ASKPASS: '/tmp/synthetic-askpass',
    GIT_TERMINAL_PROMPT: '1'
  };
  const child = readOnlyGitEnvironment(input);
  assert.deepEqual(child, {
    PATH: '/usr/bin',
    CI: 'true',
    GITHUB_ACTIONS: 'true',
    LC_ALL: 'C.UTF-8',
    GIT_TERMINAL_PROMPT: '0',
    GIT_NO_REPLACE_OBJECTS: '1'
  });
  assert.equal(input.ORG_SESSION_DATA, 'synthetic-undocumented-secret',
    'the parent environment is untouched for explicitly scoped API calls');
});

test('Git and GitHub CLI environment overrides are still rejected before credential scrubbing', () => {
  for (const key of [
    'GIT_CONFIG_COUNT', 'GIT_CONFIG_GLOBAL', 'GIT_SSH_COMMAND',
    'GIT_TRACE2_EVENT', 'GH_HOST', 'GH_REPO', 'GH_DEBUG',
    'HTTPS_PROXY', 'http_proxy', 'ALL_PROXY', 'NO_PROXY',
    'GIT_SSL_CAINFO', 'GIT_SSL_CAPATH', 'GIT_PROXY_SSL_CAINFO',
    'SSL_CERT_FILE', 'SSL_CERT_DIR', 'CURL_CA_BUNDLE',
    'NODE_EXTRA_CA_CERTS', 'NODE_TLS_REJECT_UNAUTHORIZED'
  ]) {
    assert.equal(hasUnsafeGitEnvironment({ [key]: 'synthetic-injection' }), true, key);
  }
  assert.equal(hasUnsafeGitEnvironment({
    GH_TOKEN: 'synthetic-read-only-api-token', NPM_TOKEN: 'synthetic-npm'
  }), false, 'credential presence is not an override; credentials are scrubbed only in Git children');
});

test('independent read-only Git arguments disable executable hooks and transports', () => {
  const args = readOnlyGitArguments(['fetch', '--no-tags', 'origin', 'refs/heads/main']);
  assert.deepEqual(args.slice(-4), ['fetch', '--no-tags', 'origin', 'refs/heads/main']);
  assert.equal(args[0], '--no-replace-objects', 'no local Git replacement refs may rewrite pinned objects');
  for (const setting of [
    'core.fsmonitor=false', 'core.hooksPath=/dev/null', 'credential.helper=',
    'protocol.allow=never', 'protocol.https.allow=always',
    'protocol.file.allow=always', 'protocol.ext.allow=never'
  ]) {
    assert.equal(args.includes(setting), true, setting);
    assert.equal(args[args.indexOf(setting) - 1], '-c', setting);
  }
  const diff = readOnlyGitArguments(['diff', '--no-ext-diff', '--no-textconv', '--name-only', 'main']);
  assert.equal(diff.filter((v) => v === '--no-ext-diff').length, 1);
  assert.equal(diff.filter((v) => v === '--no-textconv').length, 1);
  assert.throws(() => readOnlyGitArguments([]));
});
