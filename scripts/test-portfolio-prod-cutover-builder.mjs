// Offline check of scripts/build-prod-portfolio-cutover.py on the synthetic cutover fixture.
// The QA builder first produces a synthetic approved payload; the Production builder then
// generates its package in a temporary directory. No SQL is executed; no database, network,
// QA/Production data or credentials are involved.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = join(root, 'scripts/fixtures/portfolio-cutover');
const work = mkdtempSync(join(tmpdir(), 'cgp-prod-cutover-builder-'));
let checks = 0;
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const check = (value, label) => { assert.ok(value, label); checks++; };
try {
  const qaOut = join(work, 'qa');
  execFileSync('python3', [join(root, 'scripts/build-qa-portfolio-cutover.py'),
    '--review-dir', join(fixture, 'review'), '--backup', join(fixture, 'PRE_CUTOVER_BACKUP.json'), '--source', join(fixture, 'source.txt'),
    '--expected-source-sha', 'cac5e09d2778b0426404a7dcf3717d1077cff2d39b369a401c9ed304cb78f0fc',
    '--expected-projects', '3', '--expected-references', '4', '--expected-exact', '2', '--out-dir', qaOut], { stdio: 'ignore' });
  const approvedPath = join(qaOut, 'APPROVED_PAYLOAD.json');
  const approved = JSON.parse(readFileSync(approvedPath, 'utf8'));
  const refs = approved.flatMap(p => p.mappings);
  const count = key => approved.filter(p => p.priority === key).length;
  const out = join(work, 'prod');
  const run = extra => execFileSync('python3', [join(root, 'scripts/build-prod-portfolio-cutover.py'),
    '--approved-payload', approvedPath, '--expected-payload-sha', createHash('sha256').update(readFileSync(approvedPath)).digest('hex'),
    '--source-sha', 'cac5e09d2778b0426404a7dcf3717d1077cff2d39b369a401c9ed304cb78f0fc', '--out-dir', out,
    '--expected-projects', String(approved.length), '--expected-priorities', `${count('P1')},${count('P2')},${count('P3')}`,
    '--expected-references', String(refs.length), '--expected-exact', String(refs.filter(m => m.match_status === 'exact_match').length),
    '--expected-source-errors', String(refs.filter(m => m.source_error).length), ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const summary = JSON.parse(run([]));
  equal(summary.projects, approved.length, 'all approved projects carried');
  const payload = JSON.parse(readFileSync(join(out, 'PROD_PAYLOAD.json'), 'utf8'));
  const text = JSON.stringify(payload);
  equal(text.includes('control_id'), false, 'no QA control id in the Production payload');
  const qaIds = new Set([...approved.map(p => p.stage_id), ...refs.map(m => m.id)]);
  equal(payload.some(p => qaIds.has(p.stage_id) || p.mappings.some(m => qaIds.has(m.id))), false, 'staging/review UUIDs re-derived in the Production namespace');
  equal(payload.map(p => p.name), approved.map(p => p.name), 'exact names preserved in order');
  equal(payload.map(p => p.project_code), approved.map(p => p.project_code), 'project codes preserved');
  equal(payload.flatMap(p => p.mappings).filter(m => m.candidate === 'exact_match').length, refs.filter(m => m.match_status === 'exact_match').length, 'exact candidates preserved');
  equal(payload.flatMap(p => p.mappings).filter(m => m.source_error).every(m => m.candidate === 'needs_review'), true, 'source errors never exact');
  const dry = readFileSync(join(out, 'PROD_CUTOVER_DRY_RUN.sql'), 'utf8');
  const commit = readFileSync(join(out, 'PROD_CUTOVER_COMMIT.sql'), 'utf8');
  check(dry.trimEnd().endsWith('rollback;') && commit.trimEnd().endsWith('commit;'), 'dry run rolls back; commit commits');
  check(dry.includes('enforce_exact boolean := false') && commit.includes('enforce_exact boolean := true'), 'only COMMIT enforces full exact resolution');
  check(commit.includes("f.code=r->>'source_framework' and c.control_code=r->>'source_control_code'"), 'controls resolved by framework code + control code');
  check(commit.includes("version in ('20261006095402','20261006095409','20261006102306')"), 'cutover requires 102306 (Phase 1 block replaced)');
  check(commit.includes("where archived_at is null and import_staging_id is null") && !/delete from public\.cybersecurity_projects/i.test(commit), 'archive only; no project delete');
  check(!/\b(11111111|lkozjnpfufdpzqtzdxhe)\b/.test(commit), 'no QA user or QA ref embedded');
  check(commit.includes("select user_id into strict actor from public.profiles where role='admin' and is_active"), 'actor is a Production admin resolved at execution');
  const preflight = readFileSync(join(out, 'production-readonly-portfolio-gap.sql'), 'utf8');
  check(preflight.startsWith('-- CGP PRODUCTION') && preflight.includes('begin transaction read only;') && preflight.trimEnd().endsWith('rollback;'), 'preflight is read-only');
  check(!/\b(insert|update|delete|alter|create|drop)\b\s+(into|public|table|from)/i.test(preflight), 'preflight has no DML/DDL');
  for (const gate of ['5 RC migrations applied', 'release tables absent', 'orphans = 0', 'exact collisions', 'exact pairs resolve', 'no transaction older', 'no ungranted locks'])
    check(preflight.includes(gate), `preflight gate: ${gate}`);
  const restore = readFileSync(join(out, 'PROD_RESTORE_DRILL.sql'), 'utf8');
  check(restore.trimEnd().endsWith('rollback;') && !/delete from/i.test(restore), 'recovery drill rolls back and never deletes');
  const manifest = readFileSync(join(out, 'MANIFEST.sha256'), 'utf8');
  equal(manifest.trim().split('\n').length, 10, 'manifest covers every generated file');
  // Tampered payload is refused.
  assert.throws(() => execFileSync('python3', [join(root, 'scripts/build-prod-portfolio-cutover.py'), '--approved-payload', approvedPath,
    '--out-dir', join(work, 'x')], { stdio: 'ignore' }), 'unexpected payload SHA refused'); checks++;
  console.log(`Production cutover builder (synthetic fixture): ${checks} assertions PASS (offline, files only)`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
