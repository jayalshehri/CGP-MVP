// Exercise the same artifact extraction (0644) and hostile-file cases as Actions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync, statSync, symlinkSync, linkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = join(dirname(fileURLToPath(import.meta.url)), 'aieo-import-handoffs.mjs');
const report = JSON.stringify({ schemaVersion: 2, role: 'developer' }, null, 2) + '\n';

function fixture(kind, roles) {
  const root = mkdtempSync(join(tmpdir(), 'aieo-import-evidence-'));
  const dir = join(root, 'aieo-output');
  mkdirSync(dir);
  const prefix = kind === 'candidate' ? 'candidate-' : '';
  const path = (role) => join(dir, prefix + role + '.json');
  for (const role of roles) writeFileSync(path(role), report, { mode: 0o644 });
  const run = (...actualRoles) => spawnSync(process.execPath,
    [script, kind, ...(actualRoles.length ? actualRoles : roles)],
    { cwd: root, encoding: 'utf8', timeout: 15000 });
  return { root, dir, path, run };
}

for (const kind of ['foundation', 'candidate']) {
  for (const roles of [['developer'], ['developer', 'qa', 'security']]) {
    test(kind + ' import makes exactly named 0644 artifact handoffs private', () => {
      const f = fixture(kind, roles);
      try {
        assert.equal(f.run().status, 0, 'trusted import should succeed');
        for (const role of roles) {
          assert.equal(statSync(f.path(role)).mode & 0o777, 0o600);
          assert.equal(readFileSync(f.path(role), 'utf8'), report,
            'normalization must not change evidence bytes');
        }
      } finally { rmSync(f.root, { recursive: true, force: true }); }
    });
  }
  test(kind + ' refuses a late invalid bundle member without changing earlier reports', () => {
    const roles = ['developer', 'qa', 'security'];
    const f = fixture(kind, roles);
    try {
      for (const invalidRole of ['qa', 'security']) {
        chmodSync(f.path(invalidRole), 0o666);
        assert.notEqual(f.run().status, 0,
          'the entire bundle must be rejected before any handoff is normalized');
        for (const role of roles) {
          assert.equal(statSync(f.path(role)).mode & 0o777, role === invalidRole ? 0o666 : 0o644,
            'preflight rejection must preserve each incoming permission');
          assert.equal(readFileSync(f.path(role), 'utf8'), report,
            'preflight rejection must preserve every evidence byte');
        }
        chmodSync(f.path(invalidRole), 0o644);
      }
      assert.equal(f.run().status, 0, 'valid three-role bundle must still import');
      for (const role of roles)
        assert.equal(statSync(f.path(role)).mode & 0o777, 0o600);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
  test(kind + ' import rejects aliases, unexpected files, unsafe modes and oversized data', () => {
    const f = fixture(kind, ['developer']);
    const developer = f.path('developer');
    const external = join(f.root, 'outside.json');
    try {
      for (const mode of [0o666, 0o755, 0o004, 0o000, 0o1644]) {
        chmodSync(developer, mode);
        assert.notEqual(f.run().status, 0,
          'untrusted, owner-unreadable or special file mode must be refused: ' + mode.toString(8));
        assert.equal(statSync(developer).mode & 0o7777, mode,
          'rejected importer must not first re-permission the inode');
      }
      chmodSync(developer, 0o644);
      chmodSync(f.dir, 0o777);
      assert.notEqual(f.run().status, 0, 'untrusted evidence directory must be refused');
      assert.equal(statSync(developer).mode & 0o777, 0o644,
        'rejected directory must not normalize evidence files');
      chmodSync(f.dir, 0o755);
      chmodSync(developer, 0o644);
      writeFileSync(join(f.dir, 'unexpected.json'), report);
      assert.notEqual(f.run().status, 0, 'extra evidence is not an expected role');
      rmSync(join(f.dir, 'unexpected.json'));
      writeFileSync(developer, ' '.repeat(65537));
      assert.notEqual(f.run().status, 0, 'oversized data is refused');
      rmSync(developer);
      writeFileSync(external, report, { mode: 0o644 });
      symlinkSync(external, developer);
      assert.notEqual(f.run().status, 0, 'symlink must not be followed');
      rmSync(developer);
      linkSync(external, developer);
      assert.notEqual(f.run().status, 0, 'hardlink must not be modified');
      assert.equal(statSync(external).mode & 0o777, 0o644);
      rmSync(developer);
      writeFileSync(developer, report, { mode: 0o644 });
      assert.equal(f.run().status, 0, 'fresh ordinary artifact can be safely normalized');
      assert.equal(statSync(developer).mode & 0o777, 0o600);
      assert.equal(readFileSync(external, 'utf8'), report);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
}

const ioUrl = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)),
  'aieo-role-artifact-io.mjs')).href;
// The child only simulates a different process uid for an authorization check;
// it never alters file ownership or runs with elevated privileges.
function invokeEvidenceIo(cwd, method, args, spoofUid = false) {
  const script = 'import { ' + method + ' } from ' + JSON.stringify(ioUrl) + ';\n' +
    (spoofUid ? 'const uid = process.getuid(); process.getuid = () => uid + 1;\n' : '') +
    method + '(...' + JSON.stringify(args) + ');\n';
  return spawnSync(process.execPath, ['--input-type=module', '--eval', script],
    { cwd, encoding: 'utf8', timeout: 15000 });
}

test('all role evidence readers reject special file/directory bits and foreign uid attestations', () => {
  for (const [kind, method, role] of [
    ['foundation', 'readBoundedFoundationRoleReport', 'developer'],
    ['candidate', 'readBoundedRoleReport', 'developer'],
    ['model', 'readBoundedModelReport', 'proposal']
  ]) {
    const f = fixture(kind === 'candidate' ? 'candidate' : 'foundation', ['developer']);
    const evidence = kind === 'model'
      ? join(f.dir, 'model-proposal.json')
      : f.path('developer');
    try {
      if (kind === 'model') {
        rmSync(f.path('developer'));
        writeFileSync(evidence, report, { mode: 0o600 });
      } else {
        chmodSync(evidence, 0o600);
      }
      const run = (spoofUid = false) => invokeEvidenceIo(f.root, method, [role], spoofUid);
      assert.equal(run().status, 0, kind + ': ordinary private evidence should pass');
      assert.notEqual(run(true).status, 0, kind + ': unrelated uid must be rejected');
      for (const mode of [0o4600, 0o2600, 0o1600]) {
        chmodSync(evidence, mode);
        assert.equal(statSync(evidence).mode & 0o7000, mode & 0o7000,
          'fixture must actually set the special permission bit');
        assert.notEqual(run().status, 0,
          kind + ': setuid/setgid/sticky metadata must be rejected');
        chmodSync(evidence, 0o600);
      }
      chmodSync(f.dir, 0o2700);
      assert.notEqual(run().status, 0, kind + ': setgid evidence directory must be rejected');
      chmodSync(f.dir, 0o755);
      assert.equal(run().status, 0, kind + ': safe permissions should recover');
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});

test('role report writers reject unsafe output-directory metadata before creating a report', () => {
  for (const [method, filename] of [
    ['writeExclusiveFoundationRoleReport', 'qa.json'],
    ['writeExclusiveModelRoleReport', 'model-qa.json']
  ]) {
    const f = fixture('foundation', ['developer']);
    try {
      const output = join(f.dir, filename);
      const write = (spoofUid = false) =>
        invokeEvidenceIo(f.root, method, ['qa', { role: 'qa', status: 'passed' }], spoofUid);
      assert.notEqual(write(true).status, 0, method + ': foreign uid must be rejected');
      chmodSync(f.dir, 0o2700);
      assert.notEqual(write().status, 0, method + ': setgid output directory must fail');
      assert.equal(statSync(f.path('developer')).mode & 0o777, 0o644,
        'other evidence is never modified by a rejected writer');
      chmodSync(f.dir, 0o755);
      assert.equal(write().status, 0, method + ': ordinary output directory should work');
      assert.equal(statSync(output).mode & 0o777, 0o600);
      const original = readFileSync(output, 'utf8');
      assert.notEqual(write().status, 0, 'existing report remains immutable');
      assert.equal(readFileSync(output, 'utf8'), original);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});
