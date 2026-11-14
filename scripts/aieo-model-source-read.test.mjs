// Source-sharing guard regression tests use only disposable local Git fixtures.
// No provider credentials, remote calls, real repository changes or PR writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync,
  unlinkSync, symlinkSync, linkSync, renameSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = dirname(fileURLToPath(import.meta.url));
const reader = pathToFileURL(join(scripts, 'aieo-model-source-read.mjs')).href;
const proposal = join(scripts, 'aieo-model-proposal.mjs');
const cmd = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'aieo-pre-share-'));
  const workspace = join(root, 'workspace');
  const target = join(workspace, 'components', 'FeedbackWidget.tsx');
  mkdirSync(dirname(target), { recursive: true });
  cmd(workspace, 'init', '-q');
  cmd(workspace, 'config', 'user.email', 'fixture@example.invalid');
  cmd(workspace, 'config', 'user.name', 'Fixture');
  writeFileSync(target, 'function syntheticFixture() { return 1; }\n');
  cmd(workspace, 'add', '--', 'components/FeedbackWidget.tsx');
  cmd(workspace, 'commit', '-qm', 'pinned fixture');
  cmd(workspace, 'branch', '-M', 'main');
  const env = {
    ...process.env,
    GITHUB_REPOSITORY: 'jayalshehri/CGP-MVP',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: cmd(workspace, 'rev-parse', 'HEAD'),
    AIEO_MODEL_ENABLED: 'true',
    AIEO_SOURCE_SHARING_APPROVED: 'true',
    AIEO_MODEL_TASK: 'Make one inert text replacement in a synthetic fixture.',
    OPENROUTER_API_KEY: 'synthetic-placeholder-only',
    OPENROUTER_MODEL_ID: 'provider/fixture'
  };
  return { root, workspace, target, env };
}
function readSource(f) {
  return spawnSync(process.execPath, ['--input-type=module', '-e',
    'import { readApprovedModelSource } from ' + JSON.stringify(reader) +
    '; process.stdout.write(readApprovedModelSource())'], {
    cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 15000
  });
}
function sameOutside(f, linkType) {
  const outside = join(f.root, 'outside.tsx');
  writeFileSync(outside, readFileSync(f.target));
  unlinkSync(f.target);
  if (linkType === 'symlink') symlinkSync(outside, f.target);
  else linkSync(outside, f.target);
}

test('clean, exact-commit, single-inode source can be read without provider access', () => {
  const f = fixture();
  try {
    const outcome = readSource(f);
    assert.equal(outcome.status, 0, outcome.stderr);
    assert.equal(outcome.stdout, 'function syntheticFixture() { return 1; }\n');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

const cases = [
  ['different workflow SHA', (f) => { f.env.GITHUB_SHA = '0'.repeat(40); }],
  ['untrusted branch', (f) => { f.env.GITHUB_REF = 'refs/heads/feature'; }],
  ['missing explicit consent', (f) => { f.env.AIEO_SOURCE_SHARING_APPROVED = 'false'; }],
  ['dirty source worktree', (f) => { appendFileSync(f.target, '// altered\n'); }],
  ['staged source delta', (f) => { appendFileSync(f.target, '// staged\n'); cmd(f.workspace, 'add', '--', 'components/FeedbackWidget.tsx'); }],
  ['concealed assume-unchanged index', (f) => { cmd(f.workspace, 'update-index', '--assume-unchanged', '--', 'components/FeedbackWidget.tsx'); }],
  ['concealed skip-worktree index', (f) => { cmd(f.workspace, 'update-index', '--skip-worktree', '--', 'components/FeedbackWidget.tsx'); }],
  ['same-byte symlink outside checkout', (f) => sameOutside(f, 'symlink')],
  ['same-byte hardlink outside checkout', (f) => sameOutside(f, 'hardlink')],
  ['group-writable source', (f) => { chmodSync(f.target, 0o664); }],
  ['untracked unexpected file', (f) => { writeFileSync(join(f.workspace, 'new-source.txt'), 'unexpected'); }],
  ['symlink parent directory', (f) => {
    const external = join(f.root, 'external-components');
    renameSync(join(f.workspace, 'components'), external);
    symlinkSync(external, join(f.workspace, 'components'));
  }]
];

for (const [name, mutate] of cases) {
  test('source pre-share integrity gate rejects ' + name, () => {
    const f = fixture();
    try {
      mutate(f);
      const result = readSource(f);
      assert.notEqual(result.status, 0, 'invalid source must not be approved');
      assert.match(result.stderr, /model source blocked/);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
}

test('model proposal never contacts external transport for a same-byte source symlink', () => {
  const f = fixture();
  try {
    sameOutside(f, 'symlink');
    const log = join(f.root, 'provider-called');
    const shim = join(f.root, 'intercept.mjs');
    writeFileSync(shim, [
      "import { writeFileSync } from 'node:fs';",
      "globalThis.fetch = async () => { writeFileSync(" + JSON.stringify(log) +
        ", 'called'); throw new Error('transport must not be called'); };",
      ''
    ].join('\n'));
    const result = spawnSync(process.execPath, ['--import', shim, proposal], {
      cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 15000
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /model source blocked/);
    assert.equal(existsSync(log), false, 'no HTTP transport may be invoked');
    assert.equal(existsSync(join(f.workspace, 'aieo-output', 'model-proposal.json')), false);
    assert.equal(cmd(f.workspace, 'rev-parse', 'HEAD'), f.env.GITHUB_SHA);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
