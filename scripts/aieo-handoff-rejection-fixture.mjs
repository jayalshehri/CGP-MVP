// Read-only negative integration test against REAL downloaded GitHub role
// artifacts. Run only in the isolated synthetic fixture, never on app source.
// A clean handoff MUST pass before forged claims are expected to fail closed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const roles = ['developer', 'qa', 'security'];
const here = process.cwd();
const roleCli = join(dirname(fileURLToPath(import.meta.url)), 'aieo-role.mjs');
const source = join(here, 'components', 'FeedbackWidget.tsx');
const originals = Object.fromEntries(roles.map(role => [
  role, JSON.parse(readFileSync(join(here, 'aieo-output', role + '.json'), 'utf8'))
]));
const fixtureSource = readFileSync(source, 'utf8');
assert.equal(originals.developer.status, 'proposed',
  'the proof must use a nontrivial Developer proposal');
assert.notEqual(originals.developer.sourceHash, originals.developer.candidateHash,
  'candidate must be different from source');

function exercise(label, tamper = () => {}, shouldPass = false) {
  const work = mkdtempSync(join(tmpdir(), 'aieo-handoff-rejection-'));
  try {
    mkdirSync(join(work, 'components'), { mode: 0o700 });
    mkdirSync(join(work, 'aieo-output'), { mode: 0o700 });
    copyFileSync(source, join(work, 'components', 'FeedbackWidget.tsx'));
    const evidence = structuredClone(originals);
    tamper(evidence);
    for (const role of roles) {
      writeFileSync(join(work, 'aieo-output', role + '.json'),
        JSON.stringify(evidence[role], null, 2) + '\n',
        { mode: 0o600, flag: 'wx' });
    }
    const result = spawnSync(process.execPath, [roleCli, 'reviewer'], {
      cwd: work,
      env: {
        PATH: process.env.PATH || '/usr/bin:/bin',
        AIEO_TASK: 'feedback-control-route-boundary'
      },
      encoding: 'utf8', timeout: 10000
    });
    assert.equal(result.error, undefined, label + ': reviewer did not execute');
    if (shouldPass) {
      assert.equal(result.status, 0, label + ': clean evidence must pass: ' + result.stderr);
      const verdict = JSON.parse(readFileSync(
        join(work, 'aieo-output', 'reviewer.json'), 'utf8'));
      assert.equal(verdict.status, 'draft-pr-eligible');
      assert.equal(verdict.handoffValidated, true);
      assert.equal(verdict.requiresHumanMerge, true);
    } else {
      assert.notEqual(result.status, 0, label + ': forged evidence was accepted');
      assert.match(result.stderr, /handoff|evidence|artifact|mismatch|Invalid|untrusted/i,
        label + ': expected evidence rejection rather than an unrelated failure');
      assert.equal(existsSync(join(work, 'aieo-output', 'reviewer.json')), false,
        label + ': rejected evidence must not produce reviewer approval');
    }
    console.log(label + ': ' + (shouldPass ? 'clean handoff verified' : 'rejected as required'));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

exercise('baseline downloaded Developer/QA/Security artifacts', () => {}, true);
const mutations = [
  ['forged Developer no-change verdict', e => { e.developer.status = 'no-change'; }],
  ['replayed Developer source hash', e => { e.developer.sourceHash = '0'.repeat(64); }],
  ['forged QA case results', e => { e.qa.casesPassed = 4; }],
  ['injected QA command field', e => { e.qa.command = 'synthetic-not-executed'; }],
  ['concealed Security finding', e => { e.security.findings = ['synthetic-altered-finding']; }],
  ['replayed Security candidate hash', e => { e.security.candidateHash = '0'.repeat(64); }],
  ['forged Security additional status', e => { e.security.attested = true; }]
];
for (const [label, mutate] of mutations) exercise(label, mutate);

// GitHub jobs are independent: a downloaded, authentic handoff from a previous
// job must not be accepted against a changed checkout, even if nobody edits
// the artifact itself. Test BOTH appended bytes and an equal-byte-length
// mutation: accepting the latter would expose size-only source attestations.
const originalMarker = 'function example() {';
assert.equal(fixtureSource.split(originalMarker).length - 1, 1,
  'synthetic fixture must contain exactly one same-length mutation marker');
const sameLengthSource = fixtureSource.replace(originalMarker, 'function Example() {');
assert.notEqual(sameLengthSource, fixtureSource);
assert.equal(Buffer.byteLength(sameLengthSource), Buffer.byteLength(fixtureSource),
  'same-length test must not be reducible to a file-size check');
const driftCases = [
  ['appended', fixtureSource + '\n// Synthetic source drift after Developer attestation\n'],
  ['same-byte-length', sameLengthSource]
];
for (const [driftType, changedSource] of driftCases) {
  for (const role of ['qa', 'security', 'reviewer']) {
    const work = mkdtempSync(join(tmpdir(), 'aieo-source-drift-'));
    try {
      mkdirSync(join(work, 'components'), { mode: 0o700 });
      mkdirSync(join(work, 'aieo-output'), { mode: 0o700 });
      assert.notEqual(changedSource, fixtureSource);
      writeFileSync(join(work, 'components', 'FeedbackWidget.tsx'),
        changedSource, { mode: 0o600, flag: 'wx' });
      const inputs = role === 'reviewer' ? roles : ['developer'];
      for (const prior of inputs) {
        writeFileSync(join(work, 'aieo-output', prior + '.json'),
          JSON.stringify(originals[prior], null, 2) + '\n',
          { mode: 0o600, flag: 'wx' });
      }
      const checked = spawnSync(process.execPath, [roleCli, role], {
        cwd: work,
        env: { PATH: process.env.PATH || '/usr/bin:/bin',
          AIEO_TASK: 'feedback-control-route-boundary' },
        encoding: 'utf8', timeout: 10000
      });
      assert.equal(checked.error, undefined, role + ': drift check did not execute');
      assert.notEqual(checked.status, 0,
        role + ': stale downloaded evidence was incorrectly approved after ' + driftType);
      assert.match(checked.stderr, /Invalid, stale, or mismatched developer handoff artifact/,
        role + ': rejection must be source-bound, not an unrelated failure');
      assert.equal(existsSync(join(work, 'aieo-output', role + '.json')), false,
        role + ': stale evidence must not produce new role approval');
      assert.equal(readFileSync(join(work, 'components', 'FeedbackWidget.tsx'), 'utf8'),
        changedSource, role + ': rejection must not alter the test source');
      console.log(role + ': rejected authentic handoff after ' + driftType + ' source drift');
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
}
assert.equal(readFileSync(source, 'utf8'), fixtureSource,
  'negative cases must never change application or fixture source');
console.log('AIEO GitHub artifact boundary: 1 real clean pass + ' +
  mutations.length + ' independent tampered-copy rejections and ' +
  driftCases.length * 3 + ' independent source-drift rejections');
