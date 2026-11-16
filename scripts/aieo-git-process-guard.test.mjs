import test from 'node:test';
import assert from 'node:assert/strict';
import { hasUnsafeGitEnvironment, readOnlyGitEnvironment } from './aieo-git-process-guard.mjs';

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
    AIEO_PR_NUMBER: '123'
  });
  assert.equal(input.GH_TOKEN, 'synthetic-gh-only', 'the parent process must remain unchanged for scoped gh API calls');
});

test('Git and GitHub CLI environment overrides are still rejected before credential scrubbing', () => {
  for (const key of [
    'GIT_CONFIG_COUNT', 'GIT_CONFIG_GLOBAL', 'GIT_SSH_COMMAND',
    'GIT_TRACE2_EVENT', 'GH_HOST', 'GH_REPO', 'GH_DEBUG'
  ]) {
    assert.equal(hasUnsafeGitEnvironment({ [key]: 'synthetic-injection' }), true, key);
  }
  assert.equal(hasUnsafeGitEnvironment({
    GH_TOKEN: 'synthetic-read-only-api-token', NPM_TOKEN: 'synthetic-npm'
  }), false, 'credential presence is not an override; credentials are scrubbed only in Git children');
});
