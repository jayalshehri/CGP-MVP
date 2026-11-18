// Real, isolated Git/CLI regression for the first independent Developer report.
// No live network, provider or GitHub credentials are used by this fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync,
  chmodSync, existsSync, statSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const roleScript = join(dirname(fileURLToPath(import.meta.url)), 'aieo-candidate-role.mjs');
const repo = 'jayalshehri/CGP-MVP';
const branch = 'aieo/model-proposal-77331-1';
const sourcePath = 'components/FeedbackWidget.tsx';
const route = '  const controlId = useMemo(() => /^\\/controls\\/(\\d+)(?:\\/|$)/.exec(pagePath)?.[1] ?? null, [pagePath]);';
const original = ['function fixture() {', route, '  const statusLabel = "Old status";', '}', ''].join('\\n');
const candidate = original.replace('"Old status"', '"Current status"');

test('candidate Developer report rejects ctime-only race between fstat and final lstat', () => {
  const root = mkdtempSync(join(tmpdir(), 'aieo-role-report-race-'));
  try {
    const cwd = join(root, 'work');
    const bin = join(root, 'bin');
    const remote = join(root, 'remote.git');
    const prFile = join(root, 'pr.json');
    const marker = join(root, 'metadata-race.marker');
    const shim = join(root, 'race-preload.mjs');
    mkdirSync(cwd);
    mkdirSync(bin);
    mkdirSync(join(cwd, 'components'));
    const git = (...args) =>
      execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    execFileSync('git', ['init', '--bare', '-q', remote], { cwd: root });
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    git('remote', 'add', 'origin', remote);
    writeFileSync(join(cwd, sourcePath), original);
    git('add', sourcePath);
    git('commit', '-qm', 'trusted synthetic baseline');
    const base = git('rev-parse', 'HEAD');
    git('push', '-q', 'origin', 'main');
    git('switch', '-qc', branch);
    writeFileSync(join(cwd, sourcePath), candidate);
    git('add', sourcePath);
    git('commit', '-qm', 'one allowed synthetic candidate change');
    const head = git('rev-parse', 'HEAD');
    git('push', '-q', 'origin', branch);
    git('switch', '-q', 'main');
    writeFileSync(prFile, JSON.stringify({
      number: 777,
      html_url: 'https://github.com/' + repo + '/pull/777',
      state: 'open', draft: true, merged_at: null,
      user: { login: 'github-actions[bot]', id: 41898282, type: 'Bot' },
      base: { sha: base, ref: 'main', repo: { full_name: repo } },
      head: { sha: head, ref: branch, repo: { full_name: repo } }
    }));
    const gh = join(bin, 'gh');
    writeFileSync(gh, '#!/usr/bin/env node\\n' +
      "const {readFileSync}=require('node:fs');\\n" +
      "if(process.argv.slice(2).join(' ')!=='api repos/jayalshehri/CGP-MVP/pulls/777')process.exit(3);\\n" +
      "process.stdout.write(readFileSync(process.env.AIEO_FAKE_PR_FILE,'utf8'));\\n");
    chmodSync(gh, 0o755);

    const expectedPath = 'aieo-output/candidate-developer.json';
    writeFileSync(shim, [
      "import fs from 'node:fs';",
      "import { syncBuiltinESMExports } from 'node:module';",
      'const native = fs.lstatSync;',
      'let touched = false;',
      'fs.lstatSync = (path, ...args) => {',
      '  if (!touched && path === ' + JSON.stringify(expectedPath) + ') {',
      '    touched = true;',
      '    // Change only inode ctime, restoring the original private mode.',
      '    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);',
      '    fs.chmodSync(path, 0o640);',
      '    fs.chmodSync(path, 0o600);',
      '    fs.writeFileSync(' + JSON.stringify(marker) + ', "interleaved");',
      '  }',
      '  return native(path, ...args);',
      '};',
      'syncBuiltinESMExports();',
      ''
    ].join('\\n'));
    const env = {
      ...process.env,
      NODE_OPTIONS: '',
      GITHUB_ACTIONS: 'false',
      GH_TOKEN: 'synthetic-fixture-not-a-secret',
      PATH: bin + delimiter + process.env.PATH,
      AIEO_FAKE_PR_FILE: prFile,
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_SHA: base,
      GITHUB_REPOSITORY: repo,
      AIEO_PR_NUMBER: '777'
    };
    const run = (withRace) => spawnSync(process.execPath,
      withRace
        ? ['--import', shim, roleScript, 'developer']
        : [roleScript, 'developer'],
      { cwd, env, encoding: 'utf8', timeout: 25000 });

    const accepted = run(false);
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(JSON.parse(accepted.stdout).status, 'proposed');
    assert.equal(git('rev-parse', 'main'), base);
    // Exercise an independent fresh Developer process, not a reused report.
    rmSync(join(cwd, 'aieo-output'), { recursive: true, force: true });
    const blocked = run(true);
    assert.equal(readFileSync(marker, 'utf8'), 'interleaved',
      'the race must occur after the writer final fstat');
    assert.notEqual(blocked.status, 0, 'same-inode ctime mutation must fail closed');
    assert.match(blocked.stderr, /candidate role blocked/);
    assert.ok(existsSync(join(cwd, expectedPath)));
    assert.equal(statSync(join(cwd, expectedPath)).mode & 0o7777, 0o600);
    assert.equal(git('rev-parse', 'main'), base,
      'untrusted report must never change the trusted main commit');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
