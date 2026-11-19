import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyTrustedReviewReadiness } from './aieo-review-readiness.mjs';

const repo = 'jayalshehri/CGP-MVP';
const sha = 'a'.repeat(40);
const workflow = '.github/workflows/aieo-model-candidate-roles.yml';
const env = {
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_REPOSITORY: repo,
  GITHUB_SHA: sha,
  GITHUB_ACTIONS: 'false',
  GH_TOKEN: 'fixture-never-live'
};

function fixture({ badRef, workflowState, missingPath, malformed, throwing } = {}) {
  const calls = [];
  const gh = (args) => {
    assert.equal(args[0], 'api');
    assert.equal(args[2], '--jq');
    calls.push(args);
    if (throwing) throw Error('synthetic network error: must not be printed');
    if (malformed) return '<synthetic non-json>';
    const target = args[1];
    if (target === 'repos/' + repo + '/git/ref/heads/main') {
      return JSON.stringify({ sha: badRef ? 'b'.repeat(40) : sha, type: 'commit' });
    }
    if (target === 'repos/' + repo + '/actions/workflows/aieo-model-candidate-roles.yml') {
      return JSON.stringify({ path: workflow, state: workflowState || 'active' });
    }
    const prefix = 'repos/' + repo + '/contents/';
    assert.ok(target.startsWith(prefix));
    const [path, ref] = target.slice(prefix.length).split('?ref=');
    assert.equal(ref, sha, 'all role code must be pinned to the event commit');
    return JSON.stringify({ path, type: path === missingPath ? 'dir' : 'file' });
  };
  return { gh, calls };
}

test('registered ACTIVE reviewer and all pinned role files pass without a provider call', () => {
  const f = fixture();
  assert.deepEqual(verifyTrustedReviewReadiness({ env, gh: f.gh }), {
    status: 'ready', verifiedMainCommit: sha, roleFiles: 8
  });
  assert.equal(f.calls.length, 10, 'one SHA ref, one workflow registration and eight file checks');
  assert.ok(f.calls.every((args) => !args.join(' ').includes('openrouter')));
});

test('untrusted dispatch and absent credentials never reach GitHub', () => {
  for (const change of [
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_REF: 'refs/heads/aieo/multi-agent-foundation' },
    { GITHUB_REPOSITORY: 'foreign/CGP-MVP' },
    { GITHUB_SHA: 'short' }, { GH_TOKEN: '' }
  ]) {
    const f = fixture();
    assert.throws(() => verifyTrustedReviewReadiness({
      env: { ...env, ...change }, gh: f.gh
    }), /trusted main reviewer workflow is not ready/);
    assert.equal(f.calls.length, 0);
  }
});

test('missing or disabled workflow, stale main and missing role implementation fail closed', () => {
  for (const options of [
    { badRef: true }, { workflowState: 'disabled_manually' },
    { missingPath: 'scripts/aieo-candidate-role.mjs' },
    { missingPath: workflow }, { malformed: true }, { throwing: true }
  ]) {
    const f = fixture(options);
    assert.throws(() => verifyTrustedReviewReadiness({ env, gh: f.gh }),
      /trusted main reviewer workflow is not ready/);
  }
});

test('unsafe Git, GitHub CLI and transport overrides fail before any gh request', () => {
  for (const change of [
    { GH_HOST: 'untrusted.example.invalid' },
    { GH_HOST: 'github.com' },
    { GH_REPO: 'another/repository' },
    { GH_CONFIG_DIR: '/tmp/alternate-gh' },
    { HTTPS_PROXY: 'https://proxy.example.invalid' },
    { NODE_EXTRA_CA_CERTS: '/tmp/untrusted-ca.pem' },
    { GIT_CONFIG_COUNT: '1' }
  ]) {
    const f = fixture();
    assert.throws(() => verifyTrustedReviewReadiness({
      env: { ...env, ...change }, gh: f.gh
    }), /trusted main reviewer workflow is not ready/);
    assert.equal(f.calls.length, 0,
      'preflight must reject hostile overrides before first authenticated gh API');
  }
});

test('clean injected fixture cannot conceal unsafe live process environment', () => {
  const prior = process.env.GH_HOST;
  const f = fixture();
  try {
    process.env.GH_HOST = 'untrusted.example.invalid';
    assert.throws(() => verifyTrustedReviewReadiness({ env, gh: f.gh }),
      /trusted main reviewer workflow is not ready/);
    assert.equal(f.calls.length, 0);
  } finally {
    if (prior === undefined) delete process.env.GH_HOST;
    else process.env.GH_HOST = prior;
  }
});

test('offline fixture cannot reach the actual gh CLI, and spoofed Actions fails', () => {
  assert.throws(() => verifyTrustedReviewReadiness({ env }),
    /trusted main reviewer workflow is not ready/);
  const previous = process.env.GITHUB_ACTIONS;
  const f = fixture();
  try {
    process.env.GITHUB_ACTIONS = 'false';
    assert.throws(() => verifyTrustedReviewReadiness({
      env: { ...env, GITHUB_ACTIONS: 'true' }, gh: f.gh
    }), /trusted main reviewer workflow is not ready/);
    assert.equal(f.calls.length, 0);
  } finally {
    if (previous === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = previous;
  }
});

test('a hidden live process credential cannot downgrade privileged readiness to fixture mode', () => {
  const previousToken = process.env.GH_TOKEN;
  const previousActions = process.env.GITHUB_ACTIONS;
  const f = fixture();
  try {
    process.env.GH_TOKEN = 'testing-only-nonfunctional-token';
    process.env.GITHUB_ACTIONS = 'false';
    assert.throws(() => verifyTrustedReviewReadiness({ env, gh: f.gh }),
      /trusted main reviewer workflow is not ready/);
    assert.equal(f.calls.length, 0);
  } finally {
    if (previousToken === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = previousToken;
    if (previousActions === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = previousActions;
  }
});
