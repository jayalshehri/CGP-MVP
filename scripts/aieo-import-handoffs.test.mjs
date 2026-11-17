// Exercise the same artifact extraction (0644) and hostile-file cases as Actions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync, statSync, symlinkSync, linkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  test(kind + ' import rejects aliases, unexpected files, unsafe modes and oversized data', () => {
    const f = fixture(kind, ['developer']);
    const developer = f.path('developer');
    const external = join(f.root, 'outside.json');
    try {
      for (const mode of [0o666, 0o755]) {
        chmodSync(developer, mode);
        assert.notEqual(f.run().status, 0, 'unsafe permissions must be refused');
      }
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
