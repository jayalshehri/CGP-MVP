// Offline check of scripts/build-qa-portfolio-cutover.py on a synthetic fixture.
// Generates files in a temporary directory only; no SQL is executed and no
// database, network, QA data or credentials are involved.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = join(root, 'scripts/fixtures/portfolio-cutover');
const out = mkdtempSync(join(tmpdir(), 'cgp-cutover-builder-'));
let checks = 0;
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const check = (value, label) => { assert.ok(value, label); checks++; };
try {
  const run = extra => execFileSync('python3', [join(root, 'scripts/build-qa-portfolio-cutover.py'),
    '--review-dir', join(fixture, 'review'), '--backup', join(fixture, 'PRE_CUTOVER_BACKUP.json'), '--source', join(fixture, 'source.txt'),
    '--expected-source-sha', 'cac5e09d2778b0426404a7dcf3717d1077cff2d39b369a401c9ed304cb78f0fc',
    '--expected-projects', '3', '--expected-references', '4', '--expected-exact', '2', '--out-dir', out, ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const summary = JSON.parse(run([]));
  equal([summary.projects, summary.references], [3, 4], 'builder summary');
  const payload = JSON.parse(readFileSync(join(out, 'APPROVED_PAYLOAD.json'), 'utf8'));
  equal(payload.map(p => p.project_code), ['PF43-001', 'PF43-002', 'PF43-003'], 'deterministic project codes');
  equal(payload.map(p => p.name), ['SYNTHETIC — مشروع أ', 'SYNTHETIC — مشروع ب', 'SYNTHETIC — مشروع ج'], 'exact names preserved');
  equal(payload[1].executive_owner_other, 'Synthetic Unit', 'Other owner text carried');
  equal(payload[0].executive_owner_other, null, 'non-Other owner text is NULL');
  const maps = payload.flatMap(p => p.mappings);
  equal(maps.filter(m => m.match_status === 'exact_match').map(m => m.control_id), [9001, 9002], 'only exact matches carry a control');
  equal(maps.filter(m => m.source_error).map(m => m.source_reference), ['FX'], 'missing control code is a source error');
  check(maps.every(m => m.match_status === 'exact_match' || m.control_id === null), 'needs_review never guesses a control');
  const dry = readFileSync(join(out, 'CUTOVER_DRY_RUN.sql'), 'utf8'), commit = readFileSync(join(out, 'CUTOVER_COMMIT.sql'), 'utf8');
  check(dry.trimEnd().endsWith('rollback;') && commit.trimEnd().endsWith('commit;'), 'dry run rolls back; commit file commits');
  check(readFileSync(join(out, 'RESTORE_DRILL.sql'), 'utf8').trimEnd().endsWith('rollback;'), 'restore drill rolls back');
  check(dry.includes('-- QA ONLY: lkozjnpfufdpzqtzdxhe') && dry.includes("raise exception 'Unexpected QA ledger'"), 'QA-only guards present in generated SQL');
  const again = JSON.parse(run([]));
  equal(again.batch, summary.batch, 'deterministic batch identity');
  assert.throws(() => run(['--expected-exact', '3'])); checks++;
  let message = '';
  try { execFileSync('python3', [join(root, 'scripts/build-qa-portfolio-cutover.py'), '--review-dir', join(out, 'missing'), '--out-dir', out, '--source', join(out, 'missing.xlsx')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { message = String(error.stderr); }
  check(message.includes('Missing required input(s)'), 'clear error when untracked inputs are absent');
} finally {
  rmSync(out, { recursive: true, force: true });
}
console.log(`Portfolio cutover builder (synthetic fixture): ${checks} assertions PASS (offline, files only)`);
