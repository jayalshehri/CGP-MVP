import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyTrustedReviewReadiness, EXPECTED_ROLE_BLOBS } from './aieo-review-readiness.mjs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';

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

function fixture({ badRef, mainMoves, workflowState, missingPath, changedBlob, malformed, throwing } = {}) {
  const calls = [];
  const gh = (args) => {
    assert.equal(args[0], 'api');
    assert.equal(args[2], '--jq');
    calls.push(args);
    if (throwing) throw Error('synthetic network error: must not be printed');
    if (malformed) return '<synthetic non-json>';
    const target = args[1];
    if (target === 'repos/' + repo + '/git/ref/heads/main') {
      return JSON.stringify({ sha: badRef || (mainMoves && calls.filter((call) => call[1] === target).length > 1) ? 'b'.repeat(40) : sha, type: 'commit' });
    }
    if (target === 'repos/' + repo + '/actions/workflows/aieo-model-candidate-roles.yml') {
      return JSON.stringify({ path: workflow, state: workflowState || 'active' });
    }
    const prefix = 'repos/' + repo + '/contents/';
    assert.ok(target.startsWith(prefix));
    const [path, ref] = target.slice(prefix.length).split('?ref=');
    assert.equal(ref, sha, 'all role code must be pinned to the event commit');
    return JSON.stringify({ path, type: path === missingPath ? 'dir' : 'file',
      sha: path === changedBlob ? '0'.repeat(40) : EXPECTED_ROLE_BLOBS[path] });
  };
  return { gh, calls };
}

test('registered ACTIVE reviewer and exact Git blob identities pass without a provider call', () => {
  assert.equal(Object.keys(EXPECTED_ROLE_BLOBS).length, 13);
  assert.equal(EXPECTED_ROLE_BLOBS[workflow], 'c9091860f10bffaa4d9b1ca34dd860c4bc260f7d');
  const f = fixture();
  assert.deepEqual(verifyTrustedReviewReadiness({ env, gh: f.gh }), {
    status: 'ready', verifiedMainCommit: sha, roleFiles: 13
  });
  assert.equal(f.calls.length, 16, 'two main-ref attestations, one workflow registration and thirteen file checks');
  for (const dependency of [
    'scripts/aieo-import-handoffs.mjs',
    'scripts/aieo-git-process-guard.mjs',
    'scripts/aieo-model-candidate-read.mjs',
    'scripts/aieo-model-git.mjs',
    'aieo/lib/outbound-tag-guard.mjs'
  ]) {
    assert.equal(f.calls.filter((call) => call[1] ===
      'repos/' + repo + '/contents/' + dependency + '?ref=' + sha).length, 1,
    'runtime dependency must be attested exactly once at the trusted SHA');
  }
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
    { badRef: true }, { mainMoves: true }, { workflowState: 'disabled_manually' },
    { missingPath: 'scripts/aieo-candidate-role.mjs' },
    { missingPath: 'scripts/aieo-import-handoffs.mjs' },
    { missingPath: 'scripts/aieo-git-process-guard.mjs' },
    { missingPath: 'scripts/aieo-model-candidate-read.mjs' },
    { missingPath: 'scripts/aieo-model-git.mjs' },
    { missingPath: 'aieo/lib/outbound-tag-guard.mjs' },
    { missingPath: workflow },
    { changedBlob: workflow },
    { changedBlob: 'scripts/aieo-candidate-role.mjs' },
    { changedBlob: 'scripts/aieo-git-process-guard.mjs' },
    { malformed: true }, { throwing: true }
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


test('real readiness subprocess keeps its pinned gh and never inherits provider or arbitrary secrets', () => {
  const root = mkdtempSync(join(tmpdir(), 'aieo-readiness-gh-'));
  try {
    const bin = join(root, 'bin');
    mkdirSync(bin);
    const alias = join(bin, 'gh');
    const trusted = join(bin, 'gh-trusted');
    const malicious = join(bin, 'gh-replacement');
    const calls = join(root, 'calls.txt');
    const injected = join(root, 'untrusted-gh-executed');
    // A genuine child process receives the token for sixteen synthetic GitHub
    // metadata reads. The first request rewrites PATH's gh symlink. Neither
    // that alias swap nor ambient provider secrets may reach any later API.
    const fake = [
      '#!/usr/bin/env node',
      'const fs = require("node:fs");',
      'const alias = ' + JSON.stringify(alias) + ';',
      'const malicious = ' + JSON.stringify(malicious) + ';',
      'const calls = ' + JSON.stringify(calls) + ';',
      'if (process.env.GH_TOKEN !== "synthetic-readonly-gh-token" ||',
      '    process.env.OPENROUTER_API_KEY || process.env.UNRELATED_CREDENTIAL ||',
      '    process.env.GITHUB_TOKEN) process.exit(71);',
      'const args = process.argv.slice(2);',
      'if (args[0] !== "api" || args[2] !== "--jq") process.exit(72);',
      'const target = args[1];',
      'fs.appendFileSync(calls, target + "\\n");',
      'if (fs.readFileSync(calls, "utf8").trim().split("\\n").length === 1) {',
      '  fs.unlinkSync(alias); fs.symlinkSync(malicious, alias);',
      '}',
      'const repo = "jayalshehri/CGP-MVP";',
      'const expected = ' + JSON.stringify(EXPECTED_ROLE_BLOBS) + ';',
      'let response;',
      'if (target === "repos/" + repo + "/git/ref/heads/main") {',
      '  response = { sha: "a".repeat(40), type: "commit" };',
      '} else if (target === "repos/" + repo + "/actions/workflows/aieo-model-candidate-roles.yml") {',
      '  response = { path: ".github/workflows/aieo-model-candidate-roles.yml", state: "active" };',
      '} else if (target.startsWith("repos/" + repo + "/contents/")) {',
      '  const path = target.split("/contents/")[1].split("?ref=")[0];',
      '  response = { path, type: "file", sha: expected[path] };',
      '} else { process.exit(73); }',
      'process.stdout.write(JSON.stringify(response));'
    ].join('\n') + '\n';
    writeFileSync(trusted, fake, { mode: 0o700 });
    chmodSync(trusted, 0o700);
    writeFileSync(malicious, '#!/usr/bin/env node\n' +
      'require("node:fs").writeFileSync(' + JSON.stringify(injected) +
      ', "executed"); process.exit(97);\n', { mode: 0o700 });
    symlinkSync(trusted, alias);
    const moduleUrl = new URL('./aieo-review-readiness.mjs', import.meta.url).href;
    const code = 'import { verifyTrustedReviewReadiness } from ' +
      JSON.stringify(moduleUrl) + ';\n' +
      'console.log(JSON.stringify(verifyTrustedReviewReadiness()));\n';
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
      encoding: 'utf8', timeout: 25000,
      env: {
        PATH: bin + delimiter + (process.env.PATH || '/usr/bin:/bin'),
        HOME: root,
        GH_TOKEN: 'synthetic-readonly-gh-token',
        GITHUB_TOKEN: 'synthetic-ambient-token-must-not-reach-gh',
        OPENROUTER_API_KEY: 'synthetic-provider-secret-must-not-reach-gh',
        UNRELATED_CREDENTIAL: 'synthetic-private-value-must-not-reach-gh',
        GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_REF: 'refs/heads/main', GITHUB_REPOSITORY: repo,
        GITHUB_SHA: sha
      }
    });
    assert.equal(result.status, 0, 'readiness must pass scoped GH API: ' + result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      status: 'ready', verifiedMainCommit: sha, roleFiles: 13
    });
    assert.equal(readFileSync(calls, 'utf8').trim().split('\n').length, 16);
    assert.equal(existsSync(injected), false, 'swapped GH alias must never execute');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
