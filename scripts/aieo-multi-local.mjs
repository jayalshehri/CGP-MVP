// Local AIEO task registry and independent evidence gates. No external model,
// production access, arbitrary command/path input, or automated merge.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PILOT_BASE = '9ede5b5219850add924f4e8c2174453be4a39129';
const PILOT_REF = 'refs/heads/aieo/multi-task-local-pilot-20261127';
const TEST = 'scripts/aieo-multi-local-regression.mjs';
const OUT = 'aieo-multi-evidence';
const TASKS = [
  {
    id: 'status-label-fallback',
    path: 'components/StatusBadge.tsx',
    blob: '903742b28494880d43d4d4cdae8621da42dd76cb',
    edits: [[
      'export function statusText(status: string) { return labels[status.trim().toLowerCase()] || status || "غير محدد"; }',
      'export function statusText(status: string) {\n  const value = status.trim().toLowerCase();\n  return Object.hasOwn(labels, value) ? labels[value] : status.trim() || "غير محدد";\n}',
    ]],
  },
  {
    id: 'dialog-busy-accessibility',
    path: 'components/AccessibleDialog.tsx',
    blob: '4aa068af44565c66504cd0a1723f17c126c54e4d',
    edits: [['    aria-labelledby={labelledBy}\n', '    aria-labelledby={labelledBy}\n    aria-busy={busy}\n']],
  },
  {
    id: 'strategy-filter-anchor',
    path: 'lib/strategy-navigation.ts',
    blob: 'aeddd865bfb159d0a1bcde9e3d27098cc9db6118',
    edits: [[
      '  const next = url(window.location.pathname, params);\n  if (next === \x60${window.location.pathname}${window.location.search}\x60) return;',
      '  const next = url(window.location.pathname, params) + window.location.hash;\n  if (next === \x60${window.location.pathname}${window.location.search}${window.location.hash}\x60) return;',
    ]],
  },
];

const role = process.argv[2];
const selection = process.env.AIEO_TASK_SELECTION;
const head = process.env.GITHUB_SHA;
const runId = process.env.GITHUB_RUN_ID;
const pilot = process.env.GITHUB_EVENT_NAME === 'push' && process.env.GITHUB_REF === PILOT_REF;
const trustedDispatch = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' &&
  process.env.GITHUB_REF === 'refs/heads/main';
const base = pilot ? PILOT_BASE : head;
const assert = (value, msg) => { if (!value) throw Error(msg); };
const sha256 = text => createHash('sha256').update(text).digest('hex');
const gitBlob = text => createHash('sha1').update('blob ' + Buffer.byteLength(text) + '\0').update(text).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
assert((pilot || trustedDispatch) && process.env.GITHUB_REPOSITORY === 'jayalshehri/CGP-MVP' &&
  /^[a-f0-9]{40}$/.test(head || '') && /^[0-9]+$/.test(runId || ''), 'unapproved workflow identity');
assert(git('rev-parse', 'HEAD').trim() === head, 'unexpected checkout');
assert(git('merge-base', '--is-ancestor', base, head) === '', 'unexpected base ancestry');
assert(selection === 'all' || TASKS.some(t => t.id === selection), 'task not allowlisted');
const selected = TASKS.filter(t => selection === 'all' || t.id === selection);
assert(new Set(selected.map(t => t.path)).size === selected.length, 'overlapping task paths');

function replaceExact(source, edits, reverse = false) {
  let output = source;
  for (const [original, replacement] of reverse ? [...edits].reverse() : edits) {
    const before = reverse ? replacement : original, after = reverse ? original : replacement;
    assert(output.split(before).length === 2, 'bounded replacement must be unique');
    output = output.replace(before, after);
  }
  return output;
}

function plan(task) {
  const source = git('show', base + ':' + task.path);
  const sourceBlob = git('rev-parse', base + ':' + task.path).trim();
  let candidate, status;
  if (sourceBlob === task.blob && gitBlob(source) === task.blob) {
    candidate = replaceExact(source, task.edits);
    status = 'proposed';
  } else {
    // Accept no-op only when reversing the exact known patch yields the
    // originally reviewed blob. Any unrelated edit requires registry review.
    assert(gitBlob(replaceExact(source, task.edits, true)) === task.blob, 'source changed: ' + task.id);
    candidate = source;
    status = 'no-change';
  }
  assert((candidate !== source) === (status === 'proposed'), 'inconsistent plan');
  return { ...task, source, candidate, status,
    sourceHash: sha256(source), candidateHash: sha256(candidate) };
}

const plans = selected.map(plan);
const changed = plans.filter(p => p.status === 'proposed');
const testSource = readFileSync(TEST, 'utf8');
const testHash = sha256(testSource);
const metadata = { version: 1, mode: 'local-deterministic', base, head, runId, selection, testHash,
  tasks: plans.map(p => ({
    id: p.id, path: p.path, status: p.status, sourceHash: p.sourceHash, candidateHash: p.candidateHash,
  })) };
mkdirSync(OUT, { recursive: true, mode: 0o700 });

function evidence(name, status) {
  return JSON.stringify({ ...metadata, role: name, status }) + '\n';
}
function save(name, status) {
  writeFileSync(join(OUT, name + '.json'), evidence(name, status), { flag: 'wx', mode: 0o600 });
  console.log(name.toUpperCase() + ': ' + status);
}
function verify(name, status) {
  assert(readFileSync(join(OUT, name + '.json'), 'utf8') === evidence(name, status), 'evidence mismatch: ' + name);
}
function unchanged() {
  for (const p of plans) assert(readFileSync(p.path, 'utf8') === p.source, 'unexpected source workspace');
  assert(git('diff', '--name-only').trim() === '', 'unexpected tracked changes');
}
function verifyCandidate() {
  for (const p of plans) assert(readFileSync(p.path, 'utf8') === p.candidate, 'candidate drift: ' + p.id);
  const expected = changed.map(p => p.path).sort().join('\n');
  assert(git('diff', '--name-only').trim().split('\n').sort().join('\n') === expected, 'out-of-scope changes');
  assert(git('diff', '--check') === '', 'invalid diff');
  assert(sha256(readFileSync(TEST, 'utf8')) === testHash, 'test drift');
}
function regression(p, mode) {
  execFileSync(process.execPath, [TEST, p.id, mode], { stdio: 'inherit', timeout: 30000 });
}
function verifySecurity() {
  for (const p of plans) {
    const original = p.status === 'proposed' ? p.source : replaceExact(p.source, p.edits, true);
    assert(gitBlob(original) === p.blob, 'unapproved original');
    assert(replaceExact(original, p.edits) === p.candidate, 'unapproved candidate');
    // The explicit replacement list is limited to display state and URL
    // fragments. No credentials, data mutations, imports, network or execution.
    const edits = p.edits.map(e => e[1]).join('\n');
    assert(!/\b(?:fetch|eval|require|import|localStorage|sessionStorage|supabase)\b|process\.env/.test(edits),
      'unexpected capability in replacement');
  }
}

if (role === 'developer') {
  unchanged();
  save('developer', 'proposed-or-no-change');
} else if (role === 'qa-prepare') {
  verify('developer', 'proposed-or-no-change');
  unchanged();
  for (const p of plans) if (p.status === 'proposed') regression(p, 'baseline');
  for (const p of changed) writeFileSync(p.path, p.candidate);
  verifyCandidate();
  for (const p of plans) regression(p, 'candidate');
} else if (role === 'qa-pass') {
  verify('developer', 'proposed-or-no-change');
  verifyCandidate();
  for (const p of plans) regression(p, 'candidate');
  save('qa', 'passed');
} else if (role === 'security') {
  unchanged();
  verify('developer', 'proposed-or-no-change');
  verifySecurity();
  save('security', 'passed');
} else if (role === 'reviewer' || role === 'publish-prepare') {
  unchanged();
  verify('developer', 'proposed-or-no-change');
  verify('qa', 'passed');
  verify('security', 'passed');
  verifySecurity();
  if (role === 'reviewer') {
    save('reviewer', 'draft-eligible');
    const summary = process.env.GITHUB_STEP_SUMMARY;
    assert(typeof summary === 'string' && summary.length > 0, 'missing summary');
    const rows = plans.map(p => '| ' + p.id + ' | ' + p.status + ' | PASS | PASS | PASS |').join('\n');
    writeFileSync(summary, '# AIEO task dashboard\n\nLocal deterministic mode; human merge required.\n\n' +
      '| Task | Developer | QA | Security | Reviewer |\n|---|---|---|---|---|\n' + rows +
      '\n\nCombined application CI passed. No external source sharing or automatic deployment.\n', { flag: 'a' });
  } else {
    verify('reviewer', 'draft-eligible');
    const temp = process.env.RUNNER_TEMP;
    assert(typeof temp === 'string' && temp.startsWith('/'), 'invalid temp directory');
    const root = join(temp, 'aieo-multi-publish');
    mkdirSync(root, { mode: 0o700 });
    const files = changed.map(p => ({ path: p.path, text: p.candidate }));
    // A branch-pilot candidate needs its regression test. On main dispatch,
    // the reviewed test harness is already part of the pinned base.
    if (pilot && changed.length) files.push({ path: TEST, text: testSource });
    files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
    for (const f of files) {
      const target = join(root, f.path);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, f.text, { flag: 'wx', mode: 0o600 });
    }
    writeFileSync(join(root, 'paths'), files.map(f => f.path).sort().join('\n') + (files.length ? '\n' : ''), { flag: 'wx' });
    writeFileSync(join(root, 'sha256'), files.map(f => sha256(f.text) + '  ' + f.path).join('\n') + (files.length ? '\n' : ''), { flag: 'wx' });
    writeFileSync(join(root, 'base'), base + '\n', { flag: 'wx' });
    console.log(files.length ? 'DRAFT_READY' : 'NO_CHANGES_NO_DRAFT');
  }
} else {
  throw Error('unapproved role');
}
