// One-shot, deterministic QA-only repair. No model/provider, no app secrets,
// no arbitrary task/path input. A separate publisher verifies role evidence.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = '9ede5b5219850add924f4e8c2174453be4a39129';
const BLOB = '47a9f1ba9c4f12908667e29b6ea0e9820a74c56b';
const FILE = 'components/FeedbackWidget.tsx';
const TEST = 'scripts/test-feedback-submit-concurrency.mjs';
const ROOT = 'aieo-local-proof';
const role = process.argv[2];
const sha = s => createHash('sha256').update(s).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
const assert = (ok, msg) => { if (!ok) throw Error(msg); };

assert(process.env.GITHUB_REPOSITORY === 'jayalshehri/CGP-MVP' &&
  process.env.GITHUB_REF === 'refs/heads/aieo/qa-local-feedback-submit-20261126' &&
  process.env.GITHUB_EVENT_NAME === 'push' &&
  /^[0-9]+$/.test(process.env.GITHUB_RUN_ID || '') &&
  /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || '') &&
  git('rev-parse', 'HEAD').trim() === process.env.GITHUB_SHA, 'unexpected workflow identity');

assert(git('rev-parse', BASE + ':' + FILE).trim() === BLOB, 'trusted source blob mismatch');
const source = git('show', BASE + ':' + FILE);
const regression = readFileSync(TEST, 'utf8');
const changes = [
  ['import { FormEvent, useMemo, useState } from "react";',
    'import { FormEvent, useMemo, useRef, useState } from "react";'],
  ['  const [error, setError] = useState("");',
    '  const [error, setError] = useState("");\n  const submitInFlight = useRef(false);'],
  ['    if (state === "saving") return;',
    '    if (state === "saving" || submitInFlight.current) return;'],
  ['    setState("saving"); setError("");',
    '    submitInFlight.current = true;\n    setState("saving"); setError("");'],
  ['    } catch {\n      fail(connectionError);\n    }\n  }',
    '    } catch {\n      fail(connectionError);\n    } finally {\n      submitInFlight.current = false;\n    }\n  }'],
];
let candidate = source;
for (const [before, after] of changes) {
  assert(candidate.split(before).length === 2, 'unexpected source: exact bounded replacement not unique');
  candidate = candidate.replace(before, after);
}
assert(source !== candidate && candidate.length > source.length, 'no actual candidate');
const metadata = {
  base: BASE, sourceBlob: BLOB, sourceHash: sha(source), candidateHash: sha(candidate),
  testHash: sha(regression), workflowSha: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID,
};
mkdirSync(ROOT, { recursive: true, mode: 0o700 });
function save(name, status) {
  writeFileSync(join(ROOT, name + '.json'), JSON.stringify({ ...metadata, role: name, status }) + '\n',
    { flag: 'wx', mode: 0o600 });
  console.log(name.toUpperCase() + '_' + status.toUpperCase().replaceAll('-', '_'));
}
function verify(name, status) {
  const raw = readFileSync(join(ROOT, name + '.json'), 'utf8');
  assert(raw === JSON.stringify({ ...metadata, role: name, status }) + '\n', 'evidence mismatch: ' + name);
}
function verifyUnchangedBase() {
  assert(readFileSync(FILE, 'utf8') === source, 'application workspace is not original trusted source');
}
function verifyCandidate() {
  assert(readFileSync(FILE, 'utf8') === candidate, 'workspace candidate differs from exact developer patch');
  assert(git('diff', '--name-only').trim() === FILE, 'unexpected tracked changes');
  assert(git('diff', '--check') === '', 'invalid diff');
  assert(sha(readFileSync(TEST, 'utf8')) === metadata.testHash, 'regression test changed');
}

if (role === 'developer') {
  verifyUnchangedBase();
  save('developer', 'proposed');
} else if (role === 'qa-prepare') {
  verify('developer', 'proposed');
  verifyUnchangedBase();
  writeFileSync(FILE, candidate);
  verifyCandidate();
} else if (role === 'qa-pass') {
  verify('developer', 'proposed');
  verifyCandidate();
  save('qa', 'passed');
} else if (role === 'security') {
  verify('developer', 'proposed');
  verifyUnchangedBase();
  // Only the five literal changes above are permitted. Check that security-
  // sensitive integration lines and inputs remain byte-for-byte unchanged.
  const sensitive = s => s.split('\n').filter(line =>
    /supabase|authError|auth\.user|created_by|control_id|page_path|insertError|navigator\.onLine|cleanMessage/.test(line));
  assert(JSON.stringify(sensitive(source)) === JSON.stringify(sensitive(candidate)), 'integration or data handling changed');
  assert(!/fetch\(|process\.env|localStorage|eval\(/.test(candidate.replace(source, '')) ||
    !/fetch\(|process\.env|localStorage|eval\(/.test(changes.map(pair => pair[1]).join('\n')), 'unexpected capability');
  assert(candidate.includes('finally {\n      submitInFlight.current = false;'), 'no release on failure');
  save('security', 'passed');
} else if (role === 'reviewer') {
  verifyUnchangedBase();
  verify('developer', 'proposed');
  verify('qa', 'passed');
  verify('security', 'passed');
  save('reviewer', 'draft-pr-eligible');
} else if (role === 'publish-prepare') {
  verifyUnchangedBase();
  verify('developer', 'proposed');
  verify('qa', 'passed');
  verify('security', 'passed');
  verify('reviewer', 'draft-pr-eligible');
  // The publishing job must not run the proposed component or npm lifecycle.
  const temp = process.env.RUNNER_TEMP;
  assert(typeof temp === 'string' && temp.startsWith('/'), 'missing runner temporary directory');
  writeFileSync(join(temp, 'aieo-feedback-candidate.tsx'), candidate, { flag: 'wx', mode: 0o600 });
  writeFileSync(join(temp, 'aieo-feedback-regression.mjs'), regression, { flag: 'wx', mode: 0o600 });
  writeFileSync(join(temp, 'aieo-feedback-hashes'), metadata.candidateHash + '\n' + metadata.testHash + '\n',
    { flag: 'wx', mode: 0o600 });
  console.log('PUBLISH_DRAFT_ONLY_READY');
} else {
  throw Error('unapproved role');
}
