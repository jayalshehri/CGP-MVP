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
  const approvedTask = 'Improve the inert status label in this fixture.';
  const target = join(workspace, MODEL_ALLOWED_PATH);
  writeFileSync(target, source);
  git(workspace, 'add', '--', MODEL_ALLOWED_PATH);
  git(workspace, 'commit', '-qm', 'fixture');
  git(workspace, 'branch', '-M', 'main');
  git(workspace, 'push', '-q', '-u', 'origin', 'main');
  writeFileSync(target, candidate);
  const proposal = { schemaVersion: 1, status: 'proposed', path: MODEL_ALLOWED_PATH,
    sourceHash: hash(source), proposedHash: hash(candidate),
    sourceShared: true, taskHash: hash(approvedTask),
    dispatchRunId: '99123', dispatchRunAttempt: '1',
    sourceCommitSha: git(workspace, 'rev-parse', 'HEAD') };
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
    AIEO_SOURCE_SHARING_APPROVED: 'true', AIEO_MODEL_TASK: approvedTask
  };
  return { root, workspace, remote, log, env, target, args, qa, security, reviewer };
}

test('publisher blocks inherited Git executable/config overrides before any remote write', () => {
  const f = fixture();
  try {
    const mainBefore = git(f.workspace, 'rev-parse', 'main');
    // Synthetic process settings only. None is a live credential or script.
    for (const injection of [
      { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.fsmonitor',
        GIT_CONFIG_VALUE_0: 'untrusted-helper' },
      { GIT_CONFIG_KEY_0: 'core.hooksPath' },
      { GIT_CONFIG_GLOBAL: join(f.root, 'untrusted-global-config') },
      { GIT_INDEX_FILE: join(f.root, 'untrusted-index') },
      { GIT_SSH_COMMAND: 'untrusted-transport-helper' },
      { GIT_ASKPASS: 'untrusted-credential-helper' }
    ]) {
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env: { ...f.env, ...injection },
        encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(child.status, 0, 'Git environment injection must fail closed');
      assert.match(child.stderr, /untrusted inherited Git environment override/);
      assert.equal(existsSync(f.log), false, 'GitHub CLI must never be contacted');
      assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
      assert.equal(git(f.workspace, 'rev-parse', 'main'), mainBefore);
      assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote),
        /refs\/heads\/aieo\/model-proposal-99123-1/);
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

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
    assert.equal(verifyCandidate({ mode: 'model', env: f.env, ...f.args,
      reports: { proposal: f.args.proposal, qa: f.qa, security: f.security, reviewer: f.reviewer } }), true);
    assert.throws(() => verifyCandidate({ mode: 'model', env: f.env, ...f.args,
      reports: { proposal: f.args.proposal, qa: { ...f.qa, routeCasesPassed: 0 },
        security: f.security, reviewer: f.reviewer } }));
    assert.throws(() => verifyCandidate({ mode: 'model', env: f.env, ...f.args,
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



test('publisher refuses reuse of an existing run-attempt branch before any Git write', () => {
  const f = fixture();
  try {
    const base = git(f.workspace, 'rev-parse', 'main');
    const ref = 'refs/heads/aieo/model-proposal-99123-1';
    // Existing branch is an ancestor of the candidate, so a normal push
    // would silently fast-forward it without this preflight.
    git(f.workspace, 'push', 'origin', base + ':' + ref);
    assert.equal(git(f.workspace, 'ls-remote', 'origin', ref),
      base + '\t' + ref);
    const child = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
    });
    assert.notEqual(child.status, 0, 'a repeated attempt must fail closed');
    assert.match(child.stderr, /candidate branch already exists on origin/);
    assert.equal(git(f.workspace, 'ls-remote', 'origin', ref),
      base + '\t' + ref, 'occupied remote branch must remain unchanged');
    assert.equal(git(f.workspace, 'rev-parse', 'HEAD'), base);
    assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
    assert.equal(existsSync(f.log), false, 'no gh command before refusal');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// Git can invoke three different local hook types during publication. Each
// runs under the publisher's GH_TOKEN unless explicitly suppressed.
for (const hookName of ['post-checkout', 'pre-commit', 'pre-push']) {
  test('publisher never executes a token-bearing local Git ' + hookName + ' hook', () => {
    const f = fixture();
    try {
      const marker = join(f.root, 'untrusted-git-' + hookName + '-executed');
      const hook = join(f.workspace, '.git', 'hooks', hookName);
      // The hook deliberately fails the run and writes a marker if executed.
      // Neither the marker nor the hook contains any real credential.
      writeFileSync(hook,
        '#!/bin/sh\n' +
        'printf invoked > ' + JSON.stringify(marker) + '\n' +
        'exit 91\n');
      chmodSync(hook, 0o755);
      const base = git(f.workspace, 'rev-parse', 'main');
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
      });
      assert.equal(child.status, 0,
        'independently verified candidate must reach Draft path: ' + child.stderr);
      assert.equal(existsSync(marker), false, hookName + ' was unexpectedly executed');
      assert.equal(git(f.workspace, 'rev-parse', 'main'), base);
      assert.equal(JSON.parse(child.stdout).status, 'draft-pr-created');
      assert.match(readFileSync(f.log, 'utf8'), /pr create --draft/);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
}

// A bare remote's post-receive hook simulates the advertised refs changing
// during the push itself. The publisher must not open a PR for stale or
// redirected refs, even though its earlier pre-push checks passed.
for (const movedRef of ['main', 'candidate']) {
  test('publisher refuses ' + movedRef + ' ref drift during push before creating a Draft PR', () => {
    const f = fixture();
    try {
      const base = git(f.workspace, 'rev-parse', 'main');
      let update;
      if (movedRef === 'main') {
        // Place a distinct single-parent commit in the disposable bare remote,
        // without changing main before the publisher's initial preflight.
        const tree = git(f.workspace, 'rev-parse', 'HEAD^{tree}');
        const nextMain = git(f.workspace, 'commit-tree', tree, '-p', base, '-m',
          'synthetic post-push drift');
        git(f.workspace, 'push', '-q', 'origin',
          nextMain + ':refs/heads/synthetic-drift-ready');
        update = 'git update-ref refs/heads/main ' + nextMain;
      } else {
        // Overwrite the freshly pushed candidate ref in the disposable remote;
        // this emulates a concurrent actor changing the branch behind the
        // publisher. The pre-push branch-absence check cannot catch this.
        update = 'git update-ref refs/heads/aieo/model-proposal-99123-1 ' + base;
      }
      const hook = join(f.remote, 'hooks', 'post-receive');
      writeFileSync(hook, [
        '#!/bin/sh',
        'while read old new ref; do',
        '  if [ "$ref" = "refs/heads/aieo/model-proposal-99123-1" ]; then',
        '    ' + update,
        '  fi',
        'done', ''
      ].join('\n'));
      chmodSync(hook, 0o755);
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(child.status, 0, 'remote drift must fail closed');
      assert.match(child.stderr, /remote refs changed after candidate push/);
      assert.equal(git(f.workspace, 'rev-parse', 'main'), base,
        'the local trusted baseline is never modified');
      assert.equal(existsSync(f.log), true, 'only initial gh auth was allowed');
      assert.equal(readFileSync(f.log, 'utf8').trim(), 'auth setup-git',
        'no PR, workflow dispatch, merge or other GitHub write');
      if (movedRef === 'candidate') {
        assert.equal(git(f.workspace, 'ls-remote', 'origin',
          'refs/heads/aieo/model-proposal-99123-1'),
          base + '\trefs/heads/aieo/model-proposal-99123-1');
      } else {
        assert.notEqual(git(f.workspace, 'ls-remote', 'origin',
          'refs/heads/main'), base + '\trefs/heads/main');
      }
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
}

test('publisher rejects remote main drift before branch, push, or any GitHub CLI call', () => {
  const f = fixture();
  try {
    const trusted = f.env.GITHUB_SHA;
    // Advance only bare remote main with an actual descendant commit. All
    // local approved evidence and the checkout remain unchanged.
    const changedMain = git(f.workspace, 'commit-tree', trusted + '^{tree}',
      '-p', trusted, '-m', 'synthetic concurrent change on remote main');
    git(f.workspace, 'push', 'origin', changedMain + ':refs/heads/main');
    assert.equal(git(f.workspace, 'rev-parse', 'HEAD'), trusted);
    assert.ok(git(f.workspace, 'ls-remote', 'origin', 'refs/heads/main')
      .startsWith(changedMain + '\t'), 'fixture remote main actually advanced');

    const child = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
    });
    assert.notEqual(child.status, 0, 'stale reviewed base must fail closed');
    assert.match(child.stderr, /remote main changed since the trusted workflow checkout/);
    assert.equal(git(f.workspace, 'rev-parse', 'HEAD'), trusted);
    assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
    assert.equal(existsSync(f.log), false, 'GitHub CLI must not be reached');
    assert.equal(git(f.workspace, 'ls-remote', '--heads', f.remote)
      .includes('refs/heads/aieo/model-proposal-99123-1'), false,
      'stale candidate branch must never be pushed');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
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

test('publisher rejects replayed task, missing consent, wrong run or source commit before GitHub writes', () => {
  const f = fixture();
  try {
    const handoffPath = join(f.workspace, 'aieo-output/model-proposal.json');
    const originalReport = readFileSync(handoffPath, 'utf8');
    const base = git(f.workspace, 'rev-parse', 'main');
    for (const [caseName, reportChanges, envChanges] of [
      ['source not consented in proposal', { sourceShared: false }, {}],
      ['proposal from different run', { dispatchRunId: '99124' }, {}],
      ['proposal from different run attempt', { dispatchRunAttempt: '2' }, {}],
      ['task hash replaced', { taskHash: '0'.repeat(64) }, {}],
      ['proposal from another trusted source commit', { sourceCommitSha: '0'.repeat(40) }, {}],
      ['proposal missing source commit', { sourceCommitSha: null }, {}],
      ['publisher given another task', {}, { AIEO_MODEL_TASK: 'Different explicitly approved test task.' }],
      ['publisher task missing', {}, { AIEO_MODEL_TASK: '' }]
    ]) {
      writeFileSync(handoffPath, JSON.stringify({ ...f.args.proposal, ...reportChanges }) + '\n');
      const result = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env: { ...f.env, ...envChanges }, encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(result.status, 0, caseName);
      assert.match(result.stderr, /model proposal is not bound to approved task and workflow dispatch/,
        caseName);
      assert.equal(existsSync(f.log), false, caseName + ': must not contact GitHub CLI');
      assert.equal(git(f.workspace, 'branch', '--show-current'), 'main', caseName);
      assert.equal(git(f.workspace, 'rev-parse', 'main'), base, caseName);
      assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote),
        /refs\/heads\/aieo\/model-proposal-99123-1/, caseName);
    }
    writeFileSync(handoffPath, originalReport);
    assert.equal(verifyCandidate({
      mode: 'model', env: f.env, ...f.args,
      reports: { proposal: f.args.proposal, qa: f.qa,
        security: f.security, reviewer: f.reviewer }
    }), true, 'valid original dispatch remains eligible after negative tests');
  } finally { rmSync(f.root, { force: true, recursive: true }); }
});

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
        assert.equal(git(f.workspace, 'ls-remote', '--heads', f.remote)
          .includes('refs/heads/aieo/model-proposal-'), false);
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


for (const [name, alter] of [
  ['group-writable candidate', (f) => chmodSync(f.target, 0o664)],
  ['world-writable candidate', (f) => chmodSync(f.target, 0o666)],
  ['group-writable source directory', (f) => chmodSync(join(f.workspace, 'components'), 0o775)]
]) {
  test('publisher refuses an unsafe pre-push source inode: ' + name, () => {
    const f = fixture();
    try {
      const main = git(f.workspace, 'rev-parse', 'main');
      alter(f);
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(child.status, 0, 'untrusted source must be rejected');
      assert.match(child.stderr, /untrusted candidate source or directory/);
      assert.equal(git(f.workspace, 'rev-parse', 'main'), main);
      assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
      assert.equal(existsSync(f.log), false, 'must not contact GitHub CLI');
      assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote),
        /refs\/heads\/aieo\/model-proposal-99123-1/);
    } finally {
      rmSync(f.root, { force: true, recursive: true });
    }
  });
}

// A lossy UTF-8 decode can make the reviewer approve a normalized string
// while Git publishes different raw candidate bytes. This fixture deliberately
// recomputes *valid* QA/Security/Reviewer reports over the lossy decoded text:
// the publisher must reject the underlying raw bytes before any remote write.
test('publisher rejects invalid UTF-8 bytes even when decoded candidate evidence passes', () => {
  const f = fixture();
  try {
    const decoded = f.args.actual.replace(
      '  const sample = 2;', '  const sample = 2; //\uFFFD');
    assert.notEqual(decoded, f.args.actual);
    const raw = Buffer.from(decoded.replace('\uFFFD', '\0'), 'utf8');
    const marker = raw.indexOf(0);
    assert.ok(marker >= 0);
    raw[marker] = 0xff;
    writeFileSync(f.target, raw);
    const observed = readFileSync(f.target, 'utf8');
    assert.equal(observed, decoded, 'Node silently replaces invalid input on decode');
    assert.notDeepEqual(Buffer.from(observed, 'utf8'), raw,
      'reviewed decoded text is not identical to the bytes Git would publish');
    const args = {
      original: f.args.original, actual: observed,
      changedPaths: [MODEL_ALLOWED_PATH],
      diff: git(f.workspace, 'diff', '--unified=0', '--', MODEL_ALLOWED_PATH)
    };
    const proposal = { ...f.args.proposal, proposedHash: hash(observed) };
    const qa = inspectModelQa({ ...args, report: proposal });
    const security = inspectModelDiff({ ...args, report: proposal });
    const reviewer = inspectModelReviewer({
      ...args, proposal, qa, security
    });
    assert.equal(qa.status, 'passed', 'control: QA approves the decoded text');
    assert.equal(security.status, 'passed', 'control: Security approves decoded text');
    assert.equal(reviewer.status, 'draft-pr-eligible',
      'control: reviewer sees consistent synthetic evidence');
    for (const [kind, report] of Object.entries({
      proposal, qa, security, reviewer
    })) {
      writeFileSync(join(f.workspace, 'aieo-output', 'model-' + kind + '.json'),
        JSON.stringify(report) + '\n');
    }
    const mainBefore = git(f.workspace, 'rev-parse', 'main');
    const child = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
    });
    assert.notEqual(child.status, 0, 'raw invalid bytes must be blocked');
    assert.match(child.stderr, /untrusted candidate source or directory/);
    assert.equal(existsSync(f.log), false, 'GitHub CLI never contacted');
    assert.equal(git(f.workspace, 'rev-parse', 'main'), mainBefore);
    assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
    assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote),
      /refs\/heads\/aieo\/model-proposal-99123-1/);
  } finally {
    rmSync(f.root, { force: true, recursive: true });
  }
});
