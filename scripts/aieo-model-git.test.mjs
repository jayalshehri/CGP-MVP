// Real-Git regression tests for the model-provider credential boundary.
// Synthetic values only; no provider calls or GitHub publication.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { modelGit, preflightModelGit } from './aieo-model-git.mjs';

const rawGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
const git = (cwd, ...args) => execFileSync(rawGit, args, { cwd, encoding: 'utf8' }).trim();

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'aieo-model-git-'));
  const work = join(root, 'work');
  mkdirSync(join(work, 'components'), { recursive: true });
  git(work, 'init', '-q');
  git(work, 'config', 'user.name', 'Synthetic');
  git(work, 'config', 'user.email', 'synthetic@example.invalid');
  writeFileSync(join(work, 'components', 'FeedbackWidget.tsx'), 'const label = "ok";\n');
  git(work, 'add', '--', 'components/FeedbackWidget.tsx');
  git(work, 'commit', '-qm', 'synthetic fixture');
  return { root, work };
}

test('model provenance, QA, Security and Reviewer Git reads never inherit provider tokens', () => {
  const f = fixture();
  try {
    const bin = join(f.root, 'bin');
    const observed = join(f.root, 'git-children.jsonl');
    mkdirSync(bin);
    const executable = join(bin, 'git');
    writeFileSync(executable, [
      '#!/usr/bin/env node',
      "const { appendFileSync } = require('node:fs');",
      "const { spawnSync } = require('node:child_process');",
      'appendFileSync(' + JSON.stringify(observed) + ', JSON.stringify({',
      ' args: process.argv.slice(2),',
      ' provider: process.env.OPENROUTER_API_KEY || null,',
      ' gh: process.env.GH_TOKEN || null,',
      ' unknown: process.env.ORG_SESSION_DATA || null,',
      ' node: process.env.NODE_OPTIONS || null,',
      ' proxy: process.env.HTTPS_PROXY || null',
      '}) + "\\n");',
      'const r = spawnSync(' + JSON.stringify(rawGit) + ', process.argv.slice(2),',
      " { stdio: 'inherit', env: process.env });",
      'process.exit(r.status === null ? 8 : r.status);',
      ''
    ].join('\n'));
    chmodSync(executable, 0o755);
    const env = {
      ...process.env, PATH: bin + delimiter + process.env.PATH,
      OPENROUTER_API_KEY: 'synthetic-model-key', GH_TOKEN: 'synthetic-gh-token',
      ORG_SESSION_DATA: 'synthetic-future-secret',
      NODE_OPTIONS: '--no-warnings'
    };
    const head = git(f.work, 'rev-parse', 'HEAD');
    // Git commands run from the temporary worktree. The test never touches main.
    const originalCwd = process.cwd();
    try {
      process.chdir(f.work);
      preflightModelGit(env);
      assert.equal(modelGit(['rev-parse', '--verify', 'HEAD'], { env }).trim(), head);
      assert.equal(modelGit(['show', 'HEAD:components/FeedbackWidget.tsx'],
        { env, encoding: null }).toString('utf8'), 'const label = "ok";\n');
      assert.equal(modelGit(['diff', '--name-only'], { env }), '');
    } finally { process.chdir(originalCwd); }
    const invocations = readFileSync(observed, 'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(invocations.length >= 5, 'preflight and model Git reads executed');
    for (const call of invocations) {
      assert.equal(call.provider, null, 'OpenRouter key must never reach Git');
      assert.equal(call.gh, null, 'GitHub token must never reach Git');
      assert.equal(call.unknown, null, 'unknown organization secret must never reach Git');
      assert.equal(call.node, null, 'Node startup override must never reach Git');
      assert.equal(call.proxy, null, 'proxy override must never reach Git');
      assert.ok(call.args.includes('--no-replace-objects'));
      assert.ok(call.args.includes('core.hooksPath=/dev/null'));
      assert.ok(call.args.includes('protocol.ext.allow=never'));
    }
    const diff = invocations.find((item) => item.args.includes('diff'));
    assert.ok(diff.args.includes('--no-ext-diff'));
    assert.ok(diff.args.includes('--no-textconv'));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('model preflight rejects any tracked executable clean filter and hostile Git overrides', () => {
  const f = fixture();
  try {
    const env = { ...process.env, OPENROUTER_API_KEY: 'synthetic-only' };
    const oldCwd = process.cwd();
    try {
      process.chdir(f.work);
      assert.doesNotThrow(() => preflightModelGit(env));
      assert.throws(() => modelGit(['status'], {
        env: { ...env, GIT_CONFIG_COUNT: '1' }
      }), /untrusted Git or GitHub CLI environment/);
      assert.throws(() => preflightModelGit({ ...env, GH_HOST: 'rogue.invalid' }),
        /untrusted Git or GitHub CLI environment/);
      assert.throws(() => preflightModelGit({ ...env, HTTPS_PROXY: 'https://synthetic.invalid' }),
        /untrusted Git or GitHub CLI environment/);
      writeFileSync('.gitattributes', 'components/FeedbackWidget.tsx filter=untrusted\n');
      git(f.work, 'add', '--', '.gitattributes');
      assert.throws(() => preflightModelGit(env),
        /active or unverified Git content filter/);
    } finally { process.chdir(oldCwd); }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('model source and review Git reads retain pinned executable after PATH alias swap', () => {
  const f = fixture();
  try {
    const bin = join(f.root, 'bin');
    mkdirSync(bin);
    const alias = join(bin, 'git');
    const original = join(bin, 'git-original');
    const injected = join(bin, 'git-replacement');
    const marker = join(f.root, 'untrusted-git-ran');
    // Genuine Git runs against a disposable checkout. Its first invocation
    // changes the PATH alias before preflight finishes: every later call
    // must still use the pinned, trusted executable.
    writeFileSync(original,
      '#!/bin/sh\n' +
      'rm -f ' + JSON.stringify(alias) + '\n' +
      'ln -s ' + JSON.stringify(injected) + ' ' + JSON.stringify(alias) + '\n' +
      'exec ' + JSON.stringify(rawGit) + ' "$@"\n', { mode: 0o755 });
    chmodSync(original, 0o755);
    writeFileSync(injected,
      '#!/bin/sh\n' +
      'printf untrusted > ' + JSON.stringify(marker) + '\n' +
      'exit 96\n', { mode: 0o755 });
    chmodSync(injected, 0o755);
    symlinkSync(original, alias);
    const env = {
      ...process.env, PATH: bin + delimiter + process.env.PATH,
      OPENROUTER_API_KEY: 'synthetic-provider-key-not-for-git',
      GH_TOKEN: 'synthetic-gh-key-not-for-git'
    };
    const head = git(f.work, 'rev-parse', 'HEAD');
    const originalCwd = process.cwd();
    try {
      process.chdir(f.work);
      preflightModelGit(env);
      assert.equal(modelGit(['rev-parse', '--verify', 'HEAD'], { env }).trim(), head);
      assert.equal(modelGit(['show', 'HEAD:components/FeedbackWidget.tsx'],
        { env, encoding: null }).toString('utf8'), 'const label = "ok";\n');
      assert.equal(modelGit(['diff', '--name-only'], { env }), '');
      assert.equal(existsSync(marker), false, 'substituted Git must never execute');
      env.PATH += delimiter + '/tmp/other';
      assert.throws(() => modelGit(['status'], { env }),
        /PATH changed after preflight/);
      assert.equal(existsSync(marker), false);
    } finally { process.chdir(originalCwd); }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
