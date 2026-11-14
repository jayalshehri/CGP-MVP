import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync, symlinkSync, linkSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';
import { inspectModelQa, inspectModelReviewer } from '../aieo/lib/model-gates.mjs';
import { inspectModelDiff } from './aieo-model-security.mjs';
import { validateDispatch, verifyCandidate } from './aieo-publish-draft.mjs';

const publisher = join(dirname(fileURLToPath(import.meta.url)), 'aieo-publish-draft.mjs');
const route = String.raw`  const controlId = useMemo(() => /^\/controls\/(\d+)(?:\/|$)/.exec(pagePath)?.[1] ?? null, [pagePath]);`;
const hash = (source) => createHash('sha256').update(source).digest('hex');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'aieo-draft-e2e-'));
  const workspace = join(root, 'workspace');
  const remote = join(root, 'remote.git');
  const bin = join(root, 'bin');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(bin);
  git(root, 'init', '-q', '--bare', remote);
  git(workspace, 'init', '-q');
  git(workspace, 'config', 'user.name', 'Fixture');
  git(workspace, 'config', 'user.email', 'fixture@example.invalid');
  git(workspace, 'remote', 'add', 'origin', remote);
  mkdirSync(join(workspace, 'components'));
  mkdirSync(join(workspace, 'aieo-output'));
  const source = 'function fixture() {\n' + route + '\n  const sample = 1;\n}\n';
  const candidate = source.replace('  const sample = 1;', '  const sample = 2;');
  const target = join(workspace, MODEL_ALLOWED_PATH);
  writeFileSync(target, source);
  git(workspace, 'add', '--', MODEL_ALLOWED_PATH);
  git(workspace, 'commit', '-qm', 'fixture');
  git(workspace, 'branch', '-M', 'main');
  git(workspace, 'push', '-q', '-u', 'origin', 'main');
  writeFileSync(target, candidate);
  const proposal = { schemaVersion: 1, status: 'proposed', path: MODEL_ALLOWED_PATH,
    sourceHash: hash(source), proposedHash: hash(candidate) };
  const diff = git(workspace, 'diff', '--unified=0', '--', MODEL_ALLOWED_PATH);
  const args = { original: source, actual: candidate,
    changedPaths: [MODEL_ALLOWED_PATH], diff, proposal };
  const qa = inspectModelQa({ ...args, report: proposal });
  const security = inspectModelDiff({ ...args, report: proposal });
  const reviewer = inspectModelReviewer({ ...args, qa, security });
  for (const [kind, report] of Object.entries({ proposal, qa, security, reviewer })) {
    writeFileSync(join(workspace, 'aieo-output', 'model-' + kind + '.json'),
      JSON.stringify(report) + '\n');
  }
  const log = join(root, 'fake-gh.log');
  const gh = join(bin, 'gh');
  writeFileSync(gh, "#!/usr/bin/env node\nconst {appendFileSync}=require('node:fs');\nconst {execFileSync}=require('node:child_process');\nconst a=process.argv.slice(2);\nappendFileSync(process.env.AIEO_FAKE_GH_LOG,a.join(' ')+'\\n');\nconst g=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();\nif(a[0]==='pr'&&a[1]==='create'){\n  console.log(process.env.AIEO_FAKE_RESPONSE==='foreign-create-url'?'https://github.com/foreign/CGP-MVP/pull/123':'https://github.com/jayalshehri/CGP-MVP/pull/123');\n  process.exit(0);\n}\nif(a[0]==='pr'&&a[1]==='view'){\n  const v={\n    url:'https://github.com/jayalshehri/CGP-MVP/pull/123',state:'OPEN',isDraft:true,\n    baseRefName:'main',headRefName:'aieo/model-proposal-99123-1',\n    baseRefOid:g('rev-parse','main'),headRefOid:g('rev-parse','HEAD'),\n    headRepository:{nameWithOwner:'jayalshehri/CGP-MVP'},headRepositoryOwner:{login:'jayalshehri'},\n    files:[{path:'components/FeedbackWidget.tsx'}]\n  };\n  switch(process.env.AIEO_FAKE_RESPONSE){\n    case 'view-not-draft':v.isDraft=false;break;\n    case 'view-extra-file':v.files.push({path:'package.json'});break;\n    case 'view-wrong-head-oid':v.headRefOid='0'.repeat(40);break;\n    case 'bad-view-json':console.log('{invalid');process.exit(0);\n  }\n  console.log(JSON.stringify(v));process.exit(0);\n}\nif(a[0]==='api'&&a[1]==='repos/jayalshehri/CGP-MVP/pulls/123'){\n  const v={number:123,url:'https://github.com/jayalshehri/CGP-MVP/pull/123',\n    login:'github-actions[bot]',id:41898282,type:'Bot'};\n  if(process.env.AIEO_FAKE_RESPONSE==='actor-spoof')v.id=191056639;\n  console.log(JSON.stringify(v));process.exit(0);\n}\nif(a[0]==='auth'||a[0]==='workflow')process.exit(0);\nprocess.exit(4);\n");
  chmodSync(gh, 0o755);
  const env = { ...process.env,
    PATH: bin + ':' + process.env.PATH, AIEO_FAKE_GH_LOG: log,
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'jayalshehri/CGP-MVP',
    GITHUB_RUN_ID: '99123', GITHUB_RUN_ATTEMPT: '1',
    GITHUB_SHA: git(workspace, 'rev-parse', 'HEAD'),
    GH_TOKEN: 'placeholder-not-a-real-secret',
    AIEO_PUBLISH_MODE: 'model', AIEO_MODEL_ENABLED: 'true',
    AIEO_SOURCE_SHARING_APPROVED: 'true'
  };
  return { root, workspace, remote, log, env, target, args, qa, security, reviewer };
}

test('publisher rejects unsafe dispatch contexts and missing source consent', () => {
  const env = { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'jayalshehri/CGP-MVP', GITHUB_RUN_ID: '77',
    GITHUB_RUN_ATTEMPT: '1', GH_TOKEN: 'synthetic', AIEO_PUBLISH_MODE: 'model',
    AIEO_MODEL_ENABLED: 'true', AIEO_SOURCE_SHARING_APPROVED: 'true' };
  assert.equal(validateDispatch(env), 'model');
  for (const overrides of [
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_REF: 'refs/heads/aieo/branch' },
    { GITHUB_REPOSITORY: 'another/repo' },
    { GH_TOKEN: '' },
    { GITHUB_RUN_ID: 'abc' },
    { AIEO_SOURCE_SHARING_APPROVED: 'false' },
    { AIEO_MODEL_ENABLED: 'false' }
  ]) assert.throws(() => validateDispatch({ ...env, ...overrides }));
});

test('publisher independently recomputes model handoffs and blocks forged evidence', () => {
  const f = fixture();
  try {
    assert.equal(verifyCandidate({ mode: 'model', ...f.args,
      reports: { proposal: f.args.proposal, qa: f.qa, security: f.security, reviewer: f.reviewer } }), true);
    assert.throws(() => verifyCandidate({ mode: 'model', ...f.args,
      reports: { proposal: f.args.proposal, qa: { ...f.qa, routeCasesPassed: 0 },
        security: f.security, reviewer: f.reviewer } }));
    assert.throws(() => verifyCandidate({ mode: 'model', ...f.args,
      changedPaths: [MODEL_ALLOWED_PATH, 'package.json'],
      reports: { proposal: f.args.proposal, qa: f.qa, security: f.security, reviewer: f.reviewer } }));
  } finally { rmSync(f.root, { force: true, recursive: true }); }
});

test('publisher pushes a scoped candidate branch and invokes only Draft PR commands in isolated Git remote', () => {
  const f = fixture();
  try {
    const child = spawnSync(process.execPath, [publisher], { cwd: f.workspace,
      env: f.env, encoding: 'utf8', timeout: 20000 });
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.status, 'draft-pr-created');
    assert.equal(result.requiresHumanMerge, true);
    assert.equal(result.branch, 'aieo/model-proposal-99123-1');
    const remoteHeads = git(f.workspace, 'ls-remote', '--heads', f.remote);
    assert.ok(remoteHeads.includes('refs/heads/aieo/model-proposal-99123-1'));
    assert.ok(remoteHeads.includes('refs/heads/main'));
    assert.equal(git(f.workspace, 'diff', 'main', 'HEAD', '--name-only'), MODEL_ALLOWED_PATH);
    const commands = readFileSync(f.log, 'utf8');
    assert.match(commands, /pr create --draft --base main --head aieo\/model-proposal-99123-1/);
    assert.match(commands, /pr view https:\/\/github.com\/jayalshehri\/CGP-MVP\/pull\/123 --json/);
    assert.match(commands, /api repos\/jayalshehri\/CGP-MVP\/pulls\/123 --jq/);
    assert.match(commands, /workflow run cgp-required-ci.yml --ref aieo\/model-proposal-99123-1/);
    assert.match(commands, /workflow run aieo-model-candidate-roles.yml --ref main -f pr_number=123/);
    assert.equal(result.independentRoles, 'dispatched-not-proven');
    assert.doesNotMatch(commands, /(?:^|\n).*?(?:pr merge|deployment|release)(?: |$)/);
  } finally { rmSync(f.root, { force: true, recursive: true }); }
});


for (const [name, mutate] of [
  ['missing trusted GitHub SHA', (f) => { delete f.env.GITHUB_SHA; }],
  ['mismatched trusted GitHub SHA', (f) => { f.env.GITHUB_SHA = '0'.repeat(40); }],
  ['assume-unchanged Git index flag', (f) => {
    git(f.workspace, 'update-index', '--assume-unchanged', '--', MODEL_ALLOWED_PATH);
  }],
  ['skip-worktree Git index flag', (f) => {
    git(f.workspace, 'update-index', '--skip-worktree', '--', MODEL_ALLOWED_PATH);
  }],
  ['new executable mode on candidate', (f) => { chmodSync(f.target, 0o755); }],
  ['symlink replacing tracked source', (f) => {
    const outside = join(f.root, 'external-source.tsx');
    writeFileSync(outside, readFileSync(f.target, 'utf8'));
    unlinkSync(f.target);
    symlinkSync(outside, f.target);
  }],
  ['hardlink replacing tracked source', (f) => {
    const outside = join(f.root, 'external-source-hardlink.tsx');
    writeFileSync(outside, readFileSync(f.target, 'utf8'));
    unlinkSync(f.target);
    linkSync(outside, f.target);
    assert.equal(git(f.workspace, 'diff', '--name-only'), MODEL_ALLOWED_PATH,
      'Git sees only the same approved path, not the external inode alias');
  }]
]) {
  test('publisher refuses untrusted checkout before any branch or remote write: ' + name, () => {
    const f = fixture();
    try {
      const oldMain = git(f.workspace, 'rev-parse', 'main');
      mutate(f);
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(child.status, 0, 'unsafe checkout must be rejected');
      assert.equal(git(f.workspace, 'rev-parse', 'main'), oldMain);
      assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
      assert.equal(existsSync(f.log), false, 'GitHub CLI must not be called');
      assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote),
        /refs\/heads\/aieo\/model-proposal-99123-1/);
    } finally { rmSync(f.root, { force: true, recursive: true }); }
  });
}

test('tampered model QA evidence stops before any push or PR operation', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.workspace, 'aieo-output/model-qa.json'),
      JSON.stringify({ ...f.qa, routeCasesPassed: 0 }));
    const child = spawnSync(process.execPath, [publisher], { cwd: f.workspace,
      env: f.env, encoding: 'utf8', timeout: 20000 });
    assert.notEqual(child.status, 0);
    assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
    assert.equal(git(f.workspace, 'ls-remote', '--heads', f.remote).includes('model-proposal-99123-1'), false);
  } finally { rmSync(f.root, { force: true, recursive: true }); }
});

for (const fakeResponse of ['foreign-create-url', 'view-not-draft', 'view-extra-file', 'view-wrong-head-oid', 'actor-spoof', 'bad-view-json']) {
  test('publisher withholds success and CI dispatch on unverified remote Draft: ' + fakeResponse, () => {
    const f = fixture();
    try {
      const main = git(f.workspace, 'rev-parse', 'main');
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env: { ...f.env, AIEO_FAKE_RESPONSE: fakeResponse },
        encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(child.status, 0);
      assert.match(child.stderr, /remote Draft PR attestation failed/);
      assert.equal(git(f.workspace, 'rev-parse', 'main'), main);
      const commands = readFileSync(f.log, 'utf8');
      assert.match(commands, /pr create --draft/);
      assert.doesNotMatch(commands, /workflow run cgp-required-ci.yml/);
      assert.doesNotMatch(commands, /^(?:pr merge\b|release create\b|deploy\b)/m);
    } finally {
      rmSync(f.root, { force: true, recursive: true });
    }
  });
}


for (const linkType of ['symlink', 'hardlink']) {
  test('model publisher rejects same-byte external ' + linkType + ' evidence for all four gates', () => {
    const f = fixture();
    try {
      const main = git(f.workspace, 'rev-parse', 'main');
      for (const kind of ['proposal', 'qa', 'security', 'reviewer']) {
        const reportPath = join(f.workspace, 'aieo-output', 'model-' + kind + '.json');
        const original = readFileSync(reportPath, 'utf8');
        const outside = join(f.root, 'outside-' + kind + '.json');
        writeFileSync(outside, original);
        unlinkSync(reportPath);
        if (linkType === 'symlink') symlinkSync(outside, reportPath);
        else linkSync(outside, reportPath);
        const child = spawnSync(process.execPath, [publisher], {
          cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
        });
        assert.notEqual(child.status, 0, kind + ' must reject external ' + linkType);
        assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
        assert.equal(git(f.workspace, 'rev-parse', 'main'), main);
        assert.equal(existsSync(f.log), false, 'blocked handoff must never invoke gh');
        assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote),
          /refs\\/heads\\/aieo\\/model-proposal-/);
        unlinkSync(reportPath);
        writeFileSync(reportPath, original);
      }
    } finally { rmSync(f.root, { force: true, recursive: true }); }
  });
}

test('model publisher rejects writable and oversized reports or a writable handoff directory', () => {
  const f = fixture();
  try {
    const dir = join(f.workspace, 'aieo-output');
    const main = git(f.workspace, 'rev-parse', 'main');
    const report = join(dir, 'model-reviewer.json');
    const original = readFileSync(report, 'utf8');
    const blocked = (description) => {
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(child.status, 0, description);
      assert.equal(existsSync(f.log), false, 'no GitHub CLI access: ' + description);
      assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
      assert.equal(git(f.workspace, 'rev-parse', 'main'), main);
    };
    chmodSync(report, 0o666);
    blocked('world-writable Reviewer evidence');
    chmodSync(report, 0o600);
    writeFileSync(report, original + ' '.repeat(65537));
    blocked('valid JSON evidence exceeds the 64KiB bound');
    writeFileSync(report, original);
    chmodSync(dir, 0o777);
    blocked('writable handoff directory');
    chmodSync(dir, 0o755);
    const child = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
    });
    assert.equal(child.status, 0, 'restored trusted reports should publish: ' + child.stderr);
    assert.equal(JSON.parse(child.stdout).status, 'draft-pr-created');
    assert.equal(git(f.workspace, 'rev-parse', 'main'), main);
  } finally { rmSync(f.root, { force: true, recursive: true }); }
});
