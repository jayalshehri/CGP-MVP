// Source-sharing guard regression tests use only disposable local Git fixtures.
// No provider credentials, remote calls, real repository changes or PR writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync,
  unlinkSync, symlinkSync, linkSync, renameSync, chmodSync, statSync, existsSync, rmSync } from 'node:fs';
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

// These regressions exercise the REAL model proposal CLI with an injected
// transport. They must never reach a provider or edit any file outside Git.
for (const alias of ['symlink', 'hardlink']) {
  test('model proposal refuses a preexisting ' + alias + ' report alias before fetch', () => {
    const f = fixture();
    try {
      const output = join(f.workspace, 'aieo-output');
      mkdirSync(output);
      const protectedFile = join(f.root, 'protected-report.json');
      writeFileSync(protectedFile, 'external file must remain untouched\n');
      const report = join(output, 'model-proposal.json');
      if (alias === 'symlink') symlinkSync(protectedFile, report);
      else linkSync(protectedFile, report);
      const log = join(f.root, 'provider-called');
      const shim = join(f.root, 'intercept-output.mjs');
      writeFileSync(shim, [
        "import { writeFileSync } from 'node:fs';",
        "globalThis.fetch = async () => { writeFileSync(" + JSON.stringify(log) +
          ", 'called'); throw new Error('unexpected provider call'); };",
        ''
      ].join('\n'));
      const result = spawnSync(process.execPath, ['--import', shim, proposal], {
        cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 15000
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /model proposal report blocked/);
      assert.equal(existsSync(log), false, 'unsafe output must never reach HTTP');
      assert.equal(readFileSync(protectedFile, 'utf8'), 'external file must remain untouched\n');
      assert.equal(readFileSync(f.target, 'utf8'), 'function syntheticFixture() { return 1; }\n');
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
}

test('model proposal rejects group-writable output directory before fetch', () => {
  const f = fixture();
  try {
    const output = join(f.workspace, 'aieo-output');
    mkdirSync(output);
    chmodSync(output, 0o777);
    const log = join(f.root, 'provider-called');
    const shim = join(f.root, 'intercept-output.mjs');
    writeFileSync(shim, [
      "import { writeFileSync } from 'node:fs';",
      "globalThis.fetch = async () => { writeFileSync(" + JSON.stringify(log) +
        ", 'called'); throw new Error('unexpected provider call'); };",
      ''
    ].join('\n'));
    const result = spawnSync(process.execPath, ['--import', shim, proposal], {
      cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 15000
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /model proposal report blocked/);
    assert.equal(existsSync(log), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

for (const alias of ['symlink', 'hardlink']) {
  test('post-provider ' + alias + ' source swap cannot redirect an applied edit', () => {
    const f = fixture();
    try {
      const source = readFileSync(f.target, 'utf8');
      const external = join(f.root, 'outside.tsx');
      writeFileSync(external, source);
      const transportLog = join(f.root, 'provider-called');
      const shim = join(f.root, 'swap-during-provider.mjs');
      const response = JSON.stringify({
        path: 'components/FeedbackWidget.tsx',
        find: 'function syntheticFixture() { return 1; }',
        replace: 'function syntheticFixture() { return 2; }',
        explanation: 'Update synthetic fixture in bounded test'
      });
      writeFileSync(shim, [
        "import { writeFileSync, unlinkSync, symlinkSync, linkSync } from 'node:fs';",
        "globalThis.fetch = async () => {",
        "  writeFileSync(" + JSON.stringify(transportLog) + ", 'called');",
        "  unlinkSync(" + JSON.stringify(f.target) + ");",
        "  " + (alias === 'symlink' ? 'symlinkSync' : 'linkSync') +
          "(" + JSON.stringify(external) + ", " + JSON.stringify(f.target) + ");",
        "  return { ok: true, text: async () => JSON.stringify({",
        "    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: " + JSON.stringify(response) + " } }]",
        "  }) };",
        "};",
        ''
      ].join('\n'));
      const result = spawnSync(process.execPath, ['--import', shim, proposal], {
        cwd: f.workspace,
        env: { ...f.env, AIEO_MODEL_APPLY: '1' },
        encoding: 'utf8', timeout: 15000
      });
      assert.notEqual(result.status, 0, 're-attestation must block the swapped checkout');
      assert.match(result.stderr, /model source blocked/);
      assert.equal(readFileSync(transportLog, 'utf8'), 'called');
      assert.equal(readFileSync(external, 'utf8'), source, 'external inode must not be modified');
      assert.equal(cmd(f.workspace, 'rev-parse', 'HEAD'), f.env.GITHUB_SHA);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
}

test('provider-time replacement of a safe-looking output directory is refused', () => {
  const f = fixture();
  try {
    const output = join(f.workspace, 'aieo-output');
    const relocated = join(f.root, 'old-approved-output');
    const response = JSON.stringify({
      path: 'components/FeedbackWidget.tsx',
      find: 'function syntheticFixture() { return 1; }',
      replace: 'function syntheticFixture() { return 2; }',
      explanation: 'One bounded synthetic fixture edit'
    });
    const shim = join(f.root, 'replace-artifact-directory.mjs');
    // The provider is a local stub; a new mode-0700 directory must not
    // silently inherit the old directory's authorization to receive a report.
    writeFileSync(shim, [
      "import { renameSync, mkdirSync } from 'node:fs';",
      "globalThis.fetch = async () => {",
      "  renameSync(" + JSON.stringify(output) + ", " + JSON.stringify(relocated) + ");",
      "  mkdirSync(" + JSON.stringify(output) + ", { mode: 0o700 });",
      "  return { ok: true, text: async () => JSON.stringify({",
      "    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: " + JSON.stringify(response) + " } }]",
      "  }) };",
      "};",
      ''
    ].join('\n'));
    const result = spawnSync(process.execPath, ['--import', shim, proposal], {
      cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 15000
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /model proposal report blocked/);
    assert.equal(existsSync(join(output, 'model-proposal.json')), false);
    assert.equal(existsSync(join(relocated, 'model-proposal.json')), false);
    assert.equal(readFileSync(f.target, 'utf8'),
      'function syntheticFixture() { return 1; }\n');
    assert.equal(cmd(f.workspace, 'rev-parse', 'HEAD'), f.env.GITHUB_SHA);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('pre-share reader rejects a same-inode chmod during its bounded read', () => {
  const f = fixture();
  try {
    const shim = join(f.root, 'source-chmod-during-read.mjs');
    writeFileSync(shim, [
      "import fs from 'node:fs';",
      "import { syncBuiltinESMExports } from 'node:module';",
      "const originalRead = fs.readSync;",
      "let changed = false;",
      "fs.readSync = (...args) => {",
      "  const n = originalRead(...args);",
      "  if (!changed) {",
      "    changed = true;",
      "    fs.chmodSync(" + JSON.stringify(f.target) + ", 0o666);",
      "  }",
      "  return n;",
      "};",
      "syncBuiltinESMExports();",
      ''
    ].join('\n'));
    const result = spawnSync(process.execPath, ['--import', shim, '--input-type=module', '-e',
      'import { readApprovedModelSource } from ' + JSON.stringify(reader) +
      '; process.stdout.write(readApprovedModelSource())'], {
      cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 15000
    });
    assert.notEqual(result.status, 0, 'a source chmod race must invalidate sharing authorization');
    assert.match(result.stderr, /model source blocked/);
    assert.notEqual(statSync(f.target).mode & 0o022, 0, 'the adversarial chmod actually occurred');
    assert.equal(readFileSync(f.target, 'utf8'), 'function syntheticFixture() { return 1; }\n');
    assert.equal(cmd(f.workspace, 'rev-parse', 'HEAD'), f.env.GITHUB_SHA);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('model apply refuses a same-inode chmod between opened read and edit', () => {
  const f = fixture();
  try {
    const shim = join(f.root, 'apply-chmod-during-read.mjs');
    const response = JSON.stringify({
      path: 'components/FeedbackWidget.tsx',
      find: 'function syntheticFixture() { return 1; }',
      replace: 'function syntheticFixture() { return 2; }',
      explanation: 'Change one bounded synthetic fixture'
    });
    writeFileSync(shim, [
      "import fs from 'node:fs';",
      "import { syncBuiltinESMExports } from 'node:module';",
      "const originalRead = fs.readSync;",
      "let changed = false;",
      "fs.readSync = (...args) => {",
      "  const n = originalRead(...args);",
      "  if (!changed && typeof args[4] === 'number') {",
      "    changed = true;",
      "    fs.chmodSync(" + JSON.stringify(f.target) + ", 0o666);",
      "  }",
      "  return n;",
      "};",
      "syncBuiltinESMExports();",
      "globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify({",
      "  choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: " + JSON.stringify(response) + " } }]",
      "}) });",
      ''
    ].join('\n'));
    const result = spawnSync(process.execPath, ['--import', shim, proposal], {
      cwd: f.workspace, env: { ...f.env, AIEO_MODEL_APPLY: '1' },
      encoding: 'utf8', timeout: 15000
    });
    assert.notEqual(result.status, 0, 'local patch must not edit the now group-writable inode');
    assert.match(result.stderr, /model source blocked/);
    assert.notEqual(statSync(f.target).mode & 0o022, 0, 'chmod took place within the apply read');
    assert.equal(readFileSync(f.target, 'utf8'), 'function syntheticFixture() { return 1; }\n',
      'no partial or unauthorized model edit');
    assert.equal(cmd(f.workspace, 'rev-parse', 'HEAD'), f.env.GITHUB_SHA);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});


test('pre-share refuses a clean committed malformed UTF-8 source before any HTTP transport', () => {
  const f = fixture();
  try {
    // Git can legitimately store arbitrary bytes in a blob. With Node's
    // lossy decoder, both the worktree bytes and HEAD:source previously
    // normalized 0xff to U+FFFD, bypassing the string equality check.
    const malformed = Buffer.from('function syntheticFixture() { return "x"; }\n');
    malformed[malformed.lastIndexOf('x')] = 0xff;
    assert.equal(Buffer.from(malformed.toString('utf8')).equals(malformed), false);
    writeFileSync(f.target, malformed);
    cmd(f.workspace, 'add', '--', 'components/FeedbackWidget.tsx');
    cmd(f.workspace, 'commit', '-qm', 'synthetic malformed Git blob');
    f.env.GITHUB_SHA = cmd(f.workspace, 'rev-parse', 'HEAD');
    assert.equal(cmd(f.workspace, 'status', '--porcelain'), '',
      'fixture has a clean, matching commit; only raw-byte validation can reject it');
    assert.equal(readFileSync(f.target, 'utf8'),
      execFileSync('git', ['show', 'HEAD:components/FeedbackWidget.tsx'],
        { cwd: f.workspace, encoding: 'utf8' }),
      'legacy lossy text comparison would incorrectly accept these bytes');

    const read = readSource(f);
    assert.notEqual(read.status, 0);
    assert.match(read.stderr, /model source blocked/);

    const log = join(f.root, 'unexpected-fetch');
    const shim = join(f.root, 'intercept-malformed-source.mjs');
    writeFileSync(shim, [
      "import { writeFileSync } from 'node:fs';",
      "globalThis.fetch = async () => { writeFileSync(" + JSON.stringify(log) +
        ", 'called'); throw new Error('transport must not be called'); };",
      ''
    ].join('\n'));
    const run = spawnSync(process.execPath, ['--import', shim, proposal], {
      cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 15000
    });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /model source blocked/);
    assert.equal(existsSync(log), false, 'malformed committed source must not reach transport');
    assert.equal(existsSync(join(f.workspace, 'aieo-output', 'model-proposal.json')), false);
    assert.equal(cmd(f.workspace, 'rev-parse', 'HEAD'), f.env.GITHUB_SHA);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('pre-share still accepts a clean, valid UTF-8 replacement character in committed Git', () => {
  const f = fixture();
  try {
    const valid = 'function syntheticFixture() { return "\\ufffd"; }\n'.replace('\\ufffd', '\ufffd');
    writeFileSync(f.target, valid);
    cmd(f.workspace, 'add', '--', 'components/FeedbackWidget.tsx');
    cmd(f.workspace, 'commit', '-qm', 'synthetic valid UTF-8 replacement codepoint');
    f.env.GITHUB_SHA = cmd(f.workspace, 'rev-parse', 'HEAD');
    const outcome = readSource(f);
    assert.equal(outcome.status, 0, outcome.stderr);
    assert.equal(outcome.stdout, valid, 'raw bytes round-trip without accidental rejection');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
