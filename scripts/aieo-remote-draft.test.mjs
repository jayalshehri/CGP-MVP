import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyRemoteDraft } from '../aieo/lib/remote-draft.mjs';

const repo = 'jayalshehri/CGP-MVP';
const url = 'https://github.com/' + repo + '/pull/987';
const branch = 'aieo/model-proposal-99123-1';
const baseSha = 'a'.repeat(40);
const candidateSha = 'b'.repeat(40);
const path = 'components/FeedbackWidget.tsx';

function fixture({ changeView, changeActor, urlOverride, branchOverride, malformedView, malformedActor } = {}) {
  const view = {
    url, state: 'OPEN', isDraft: true, baseRefName: 'main',
    headRefName: branch, baseRefOid: baseSha, headRefOid: candidateSha,
    headRepository: { nameWithOwner: repo },
    headRepositoryOwner: { login: 'jayalshehri' },
    files: [{ path }]
  };
  const actor = { number: 987, url, login: 'github-actions[bot]', id: 41898282, type: 'Bot' };
  changeView?.(view);
  changeActor?.(actor);
  const calls = [];
  const gh = (binary, args) => {
    assert.equal(binary, 'gh');
    calls.push(args);
    if (args[0] === 'pr' && args[1] === 'view') return malformedView ?? JSON.stringify(view);
    if (args[0] === 'api' && args[1] === 'repos/' + repo + '/pulls/987') {
      return malformedActor ?? JSON.stringify(actor);
    }
    throw Error('Unexpected GitHub CLI operation: ' + args.join(' '));
  };
  const options = {
    url: urlOverride ?? url, branch: branchOverride ?? branch, baseSha, candidateSha, path, gh
  };
  return { options, calls };
}

test('independent remote metadata and official bot identity establish a Draft only', () => {
  const f = fixture();
  assert.deepEqual(verifyRemoteDraft(f.options), { url, number: 987, isDraft: true });
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0][0], 'pr');
  assert.equal(f.calls[0][1], 'view');
  assert.equal(f.calls[0][2], url);
  assert.equal(f.calls[1][0], 'api');
  assert.equal(f.calls[1][1], 'repos/' + repo + '/pulls/987');
});

const remoteFailures = [
  ['not-draft', (v) => { v.isDraft = false; }],
  ['closed', (v) => { v.state = 'CLOSED'; }],
  ['forged-url', (v) => { v.url = 'https://github.com/foreign/CGP-MVP/pull/987'; }],
  ['wrong-base-ref', (v) => { v.baseRefName = 'release'; }],
  ['wrong-head-ref', (v) => { v.headRefName = 'aieo/other'; }],
  ['wrong-base-oid', (v) => { v.baseRefOid = '0'.repeat(40); }],
  ['wrong-candidate-oid', (v) => { v.headRefOid = '0'.repeat(40); }],
  ['foreign-repository', (v) => { v.headRepository.nameWithOwner = 'foreign/CGP-MVP'; }],
  ['foreign-owner', (v) => { v.headRepositoryOwner.login = 'foreign'; }],
  ['missing-repository', (v) => { v.headRepository = null; }],
  ['missing-owner', (v) => { v.headRepositoryOwner = null; }],
  ['extra-file', (v) => { v.files.push({ path: 'package.json' }); }],
  ['different-file', (v) => { v.files = [{ path: 'src/other.ts' }]; }],
  ['missing-files', (v) => { delete v.files; }]
];
for (const [name, changeView] of remoteFailures) {
  test('reject remote GraphQL attestation: ' + name, () => {
    const f = fixture({ changeView });
    assert.throws(() => verifyRemoteDraft(f.options), /remote Draft PR attestation failed/);
    assert.equal(f.calls.length, 1, 'invalid remote PR must stop before REST identity call');
  });
}
const actorFailures = [
  ['human-author', (a) => { a.login = 'jayalshehri'; }],
  ['spoofed-login-id', (a) => { a.id = 191056639; }],
  ['non-bot-type', (a) => { a.type = 'User'; }],
  ['wrong-number', (a) => { a.number = 986; }],
  ['wrong-url', (a) => { a.url = 'https://github.com/' + repo + '/pull/986'; }],
  ['missing-login', (a) => { a.login = null; }]
];
for (const [name, changeActor] of actorFailures) {
  test('reject independent REST bot identity: ' + name, () => {
    const f = fixture({ changeActor });
    assert.throws(() => verifyRemoteDraft(f.options), /remote Draft PR attestation failed/);
    assert.equal(f.calls.length, 2);
  });
}
for (const [name, changes] of [
  ['foreign-create-url', { urlOverride: 'https://github.com/foreign/CGP-MVP/pull/987' }],
  ['leading-zeros', { urlOverride: 'https://github.com/' + repo + '/pull/0987' }],
  ['bad-branch', { branchOverride: 'main' }],
  ['non-json-view', { malformedView: '{' }],
  ['non-json-actor', { malformedActor: '{' }]
]) {
  test('fail closed on ' + name, () => {
    const f = fixture(changes);
    assert.throws(() => verifyRemoteDraft(f.options), /remote Draft PR attestation failed/);
    if (name === 'foreign-create-url' || name === 'leading-zeros' || name === 'bad-branch') {
      assert.equal(f.calls.length, 0);
    }
  });
}
test('attestation does not accept identical, short or absent local commit identities', () => {
  for (const mutation of [{ candidateSha: baseSha }, { baseSha: 'short' }, { candidateSha: null }]) {
    const f = fixture();
    assert.throws(() => verifyRemoteDraft({ ...f.options, ...mutation }));
    assert.equal(f.calls.length, 0);
  }
});
