// Read-only negative integration test against REAL downloaded GitHub role
// artifacts. Run only in the isolated synthetic fixture, never on app source.
// A clean handoff MUST pass before forged claims are expected to fail closed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
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

// GitHub artifact inputs are BYTES, not merely parsed JSON values. A valid
// object with duplicate keys, noncanonical serialization, or invalid UTF-8
// must fail at the inode-bounded reader before any receiving role can attest it.
// Exercise real downloaded reports across three independently launched roles.
function exerciseMalformedHandoff(label, receivingRole, corruptRole, tamperBytes) {
  const work = mkdtempSync(join(tmpdir(), 'aieo-raw-handoff-rejection-'));
  try {
    mkdirSync(join(work, 'components'), { mode: 0o700 });
    mkdirSync(join(work, 'aieo-output'), { mode: 0o700 });
    copyFileSync(source, join(work, 'components', 'FeedbackWidget.tsx'));
    const inputs = receivingRole === 'reviewer' ? roles : ['developer'];
    assert.ok(inputs.includes(corruptRole), label + ': invalid test input role');
    for (const prior of inputs) {
      const canonical = Buffer.from(JSON.stringify(originals[prior], null, 2) + '\n', 'utf8');
      const bytes = prior === corruptRole ? tamperBytes(canonical) : canonical;
      if (prior === corruptRole) {
        assert.ok(Buffer.isBuffer(bytes), label + ': mutation must produce bytes');
        assert.notDeepEqual(bytes, canonical, label + ': evidence bytes must actually change');
      }
      writeFileSync(join(work, 'aieo-output', prior + '.json'), bytes,
        { mode: 0o600, flag: 'wx' });
    }
    const checked = spawnSync(process.execPath, [roleCli, receivingRole], {
      cwd: work,
      env: {
        PATH: process.env.PATH || '/usr/bin:/bin',
        AIEO_TASK: 'feedback-control-route-boundary'
      },
      encoding: 'utf8', timeout: 10000
    });
    assert.equal(checked.error, undefined, label + ': receiving role did not execute');
    assert.notEqual(checked.status, 0, label + ': untrusted raw evidence was approved');
    assert.match(checked.stderr,
      /AIEO role artifact rejected: untrusted file or changed evidence/,
      label + ': rejection must be from the bounded evidence reader');
    assert.equal(existsSync(join(work, 'aieo-output', receivingRole + '.json')), false,
      label + ': failed raw evidence must not produce approval');
    assert.equal(readFileSync(join(work, 'components', 'FeedbackWidget.tsx'), 'utf8'),
      fixtureSource, label + ': failed input must not change source');
    console.log(receivingRole + ': rejected ' + label + ' from downloaded ' + corruptRole);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
const rawCases = [
  ['duplicate JSON key', 'qa', 'developer', bytes => {
    const raw = bytes.toString('utf8');
    const key = '"schemaVersion": 2,';
    assert.equal(raw.split(key).length - 1, 1);
    return Buffer.from(raw.replace(key, key + '\n  "schemaVersion": 2,'), 'utf8');
  }],
  ['noncanonical trailing newline', 'security', 'developer',
    bytes => Buffer.concat([bytes, Buffer.from('\n')])],
  ['invalid UTF-8 byte', 'reviewer', 'qa',
    bytes => Buffer.concat([bytes.subarray(0, bytes.length - 1), Buffer.from([0xff, 0x0a])])],
  ['UTF-8 byte-order mark', 'reviewer', 'security',
    bytes => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes])],
  ['oversized raw evidence', 'qa', 'developer', () => Buffer.alloc(65537, 0x20)],
  ['noncanonical CRLF', 'reviewer', 'qa',
    bytes => Buffer.from(bytes.toString('utf8').replaceAll('\n', '\r\n'), 'utf8')],
  ['trailing NUL', 'security', 'developer',
    bytes => Buffer.concat([bytes, Buffer.from([0])])]
];
for (const [label, receivingRole, corruptRole, tamperBytes] of rawCases) {
  exerciseMalformedHandoff(label, receivingRole, corruptRole, tamperBytes);
}

// A canonical signed-off report is NOT safe to receive from a directory that
// any other account can traverse. Similarly the Developer must not write fresh
// role evidence there. Keep evidence bytes unmodified in these rejection tests.
function exercisePublicEvidenceDirectory(role) {
  const work = mkdtempSync(join(tmpdir(), 'aieo-public-evidence-dir-'));
  try {
    mkdirSync(join(work, 'components'), { mode: 0o700 });
    mkdirSync(join(work, 'aieo-output'), { mode: 0o700 });
    copyFileSync(source, join(work, 'components', 'FeedbackWidget.tsx'));
    if (role === 'reviewer') {
      for (const prior of roles) {
        writeFileSync(join(work, 'aieo-output', prior + '.json'),
          JSON.stringify(originals[prior], null, 2) + '\n',
          { mode: 0o600, flag: 'wx' });
      }
    }
    chmodSync(join(work, 'aieo-output'), 0o755);
    const checked = spawnSync(process.execPath, [roleCli, role], {
      cwd: work,
      env: { PATH: process.env.PATH || '/usr/bin:/bin',
        AIEO_TASK: 'feedback-control-route-boundary' },
      encoding: 'utf8', timeout: 10000
    });
    assert.equal(checked.error, undefined, role + ': public-directory test did not execute');
    assert.notEqual(checked.status, 0, role + ': public evidence directory accepted');
    assert.match(checked.stderr,
      /AIEO role artifact rejected: untrusted file or changed evidence/,
      role + ': rejection must come from the bounded role evidence I/O');
    assert.equal(existsSync(join(work, 'aieo-output', role + '.json')), false,
      role + ': insecure directory must not yield a new role report');
    assert.equal(readFileSync(join(work, 'components', 'FeedbackWidget.tsx'), 'utf8'),
      fixtureSource, role + ': rejected role cannot change the source');
    console.log(role + ': refused public role-evidence directory');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
for (const role of ['developer', 'reviewer']) exercisePublicEvidenceDirectory(role);

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
  driftCases.length * 3 + ' independent source-drift rejections and ' +
  rawCases.length + ' malformed raw-handoff rejections and 2 public-directory rejections');
