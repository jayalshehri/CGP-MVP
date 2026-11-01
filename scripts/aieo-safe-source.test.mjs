import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync,
  symlinkSync, linkSync, existsSync, statSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Temporary, non-sensitive fixtures only. Exercise the actual independent CLI
// entrypoints, not just a mocked filesystem validator.
const scripts = dirname(fileURLToPath(import.meta.url));
const source = 'function fixture() {\n  const controlId = useMemo(() => /^\\/controls\\/(\\d+)/.exec(pagePath)?.[1] ?? null, [pagePath]);\n}\n';
const approved = 'components/FeedbackWidget.tsx';
function withWorkspace(run) {
  const cwd = mkdtempSync(join(tmpdir(), 'aieo-source-boundary-'));
  const path = join(cwd, approved);
  const outside = join(cwd, 'external-synthetic.tsx');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
  writeFileSync(outside, source);
  const launch = (name) => spawnSync(process.execPath, [
    join(scripts, name === 'orchestrator' ? 'aieo-runner.mjs' : 'aieo-role.mjs'),
    ...(name === 'developer' ? ['developer'] : [])
  ], {
    cwd, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, AIEO_TASK: 'feedback-control-route-boundary',
      AIEO_APPLY: '0', AIEO_TRUSTED_WORKFLOW: '0' }
  });
  try { run({ cwd, path, outside, launch }); }
  finally { rmSync(cwd, { recursive: true, force: true }); }
}

test('ordinary local synthetic source remains accepted by orchestrator and independent Developer', () => {
  withWorkspace(({ launch, cwd }) => {
    for (const entry of ['orchestrator', 'developer']) {
      const result = launch(entry);
      assert.equal(result.status, 0, entry + ': ' + result.stderr);
    }
    const out = join(cwd, 'aieo-output');
    assert.equal(JSON.parse(readFileSync(join(out, 'developer.json'), 'utf8')).status, 'proposed');
    assert.equal(JSON.parse(readFileSync(join(out, 'multi-agent-report.json'), 'utf8')).developer.status, 'proposed');
  });
});

for (const [label, modify] of [
  ['symlinked source file', ({ path, outside }) => {
    rmSync(path);
    symlinkSync(outside, path);
  }],
  ['hardlinked source file', ({ path, outside }) => {
    rmSync(path);
    linkSync(outside, path);
  }],
  ['symlinked ancestor directory', ({ cwd }) => {
    const folder = join(cwd, 'components');
    const replacement = join(cwd, 'alternative-components');
    mkdirSync(replacement);
    writeFileSync(join(replacement, 'FeedbackWidget.tsx'), source);
    rmSync(folder, { recursive: true });
    symlinkSync(replacement, folder, 'dir');
  }],
  ['oversized source', ({ path }) => {
    writeFileSync(path, Buffer.alloc(512 * 1024 + 1, 0x61));
  }],
  ['invalid UTF-8 source', ({ path }) => {
    writeFileSync(path, Buffer.from([0xc3, 0x28]));
  }]
]) {
  test('orchestrator and Developer reject ' + label + ' before writing reports', () => {
    withWorkspace((context) => {
      modify(context);
      for (const entry of ['orchestrator', 'developer']) {
        const result = context.launch(entry);
        assert.notEqual(result.status, 0, entry + ' accepted ' + label);
        assert.match(result.stderr, /Unsafe or oversized AIEO approved source/);
        assert.equal(existsSync(join(context.cwd, 'aieo-output')), false,
          'Unsafe source must not produce CI artifacts');
        assert.equal(readFileSync(context.outside, 'utf8'), source,
          'External synthetic file was modified');
      }
      assert.equal(statSync(context.outside).isFile(), true);
    });
  });
}
