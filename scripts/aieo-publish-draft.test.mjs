import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync, symlinkSync, linkSync, unlinkSync } from 'node:fs';
import { join, dirname, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';
import { inspectModelQa, inspectModelReviewer } from '../aieo/lib/model-gates.mjs';
import { inspectModelDiff } from './aieo-model-security.mjs';
import { validateDispatch, verifyCandidate, verifyOfficialPublisherOrigin, publisherSubprocessEnvironment } from './aieo-publish-draft.mjs';

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
  mkdirSync(join(workspace, 'aieo-output'), { mode: 0o700 });
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
      JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  }
  const log = join(root, 'fake-gh.log');
  const gh = join(bin, 'gh');
  writeFileSync(gh, "#!/usr/bin/env node\nconst {appendFileSync}=require('node:fs');\nconst {execFileSync}=require('node:child_process');\nconst a=process.argv.slice(2);\nappendFileSync(process.env.AIEO_FAKE_GH_LOG,a.join(' ')+'\\n');\nconst g=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();\nif(a[0]==='pr'&&a[1]==='create'){\n  console.log(process.env.AIEO_FAKE_RESPONSE==='foreign-create-url'?'https://github.com/foreign/CGP-MVP/pull/123':'https://github.com/jayalshehri/CGP-MVP/pull/123');\n  process.exit(0);\n}\nif(a[0]==='pr'&&a[1]==='view'){\n  const v={\n    url:'https://github.com/jayalshehri/CGP-MVP/pull/123',state:'OPEN',isDraft:true,\n    baseRefName:'main',headRefName:'aieo/model-proposal-99123-1',\n    baseRefOid:g('rev-parse','main'),headRefOid:g('rev-parse','HEAD'),\n    headRepository:{nameWithOwner:'jayalshehri/CGP-MVP'},headRepositoryOwner:{login:'jayalshehri'},\n    files:[{path:'components/FeedbackWidget.tsx'}]\n  };\n  switch(process.env.AIEO_FAKE_RESPONSE){\n    case 'view-not-draft':v.isDraft=false;break;\n    case 'view-extra-file':v.files.push({path:'package.json'});break;\n    case 'view-wrong-head-oid':v.headRefOid='0'.repeat(40);break;\n    case 'bad-view-json':console.log('{invalid');process.exit(0);\n  }\n  console.log(JSON.stringify(v));process.exit(0);\n}\nif(a[0]==='api'&&a[1]==='repos/jayalshehri/CGP-MVP/pulls/123'){\n  const v={number:123,url:'https://github.com/jayalshehri/CGP-MVP/pull/123',\n    login:'github-actions[bot]',id:41898282,type:'Bot',\n    state:'open',draft:true,mergedAt:null,baseRef:'main',baseSha:g('rev-parse','main'),\n    baseRepo:'jayalshehri/CGP-MVP',headRef:'aieo/model-proposal-99123-1',\n    headSha:g('rev-parse','HEAD'),headRepo:'jayalshehri/CGP-MVP'};\n  if(process.env.AIEO_FAKE_RESPONSE==='actor-spoof')v.id=191056639;\n  if(process.env.AIEO_FAKE_RESPONSE==='rest-undrafted')v.draft=false;\n  if(process.env.AIEO_FAKE_RESPONSE==='rest-head-moved')v.headSha='0'.repeat(40);\n  console.log(JSON.stringify(v));process.exit(0);\n}\nif(a[0]==='auth'&&process.env.AIEO_FAKE_RESPONSE==='auth-redirect-pushurl'){\nconst path=require('node:path');\nexecFileSync('git',['config','remote.origin.pushurl',path.join(path.dirname(process.env.AIEO_FAKE_GH_LOG),'trap.git')]);\nprocess.exit(0);\n}\nif(a[0]==='auth'||a[0]==='workflow')process.exit(0);\nprocess.exit(4);\n");
  chmodSync(gh, 0o755);
  const env = { ...process.env,
    PATH: bin + ':' + process.env.PATH, AIEO_FAKE_GH_LOG: log,
    GITHUB_ACTIONS: 'false', // offline file:// fixture; production is always true
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'jayalshehri/CGP-MVP',
    GITHUB_RUN_ID: '99123', GITHUB_RUN_ATTEMPT: '1',
    GITHUB_SHA: git(workspace, 'rev-parse', 'HEAD'),
    GH_TOKEN: 'fixture-never-live',
    AIEO_PUBLISH_MODE: 'model', AIEO_MODEL_ENABLED: 'true',
    AIEO_SOURCE_SHARING_APPROVED: 'true', AIEO_MODEL_TASK: approvedTask
  };
  return { root, workspace, remote, log, env, target, args, qa, security, reviewer };
}

// Actual Git and gh children must never inherit arbitrary secrets that a
// previous build step could have added to the write-token publisher process.
test('publisher isolates real Git and gh children from unrelated secrets', () => {
  const f = fixture();
  try {
    const secret = 'synthetic-no-disclosure';
    const inherited = { ...f.env,
      AIEO_INTERNAL_SECRET: secret, OPENROUTER_API_KEY: secret, NPM_TOKEN: secret,
      NEXT_PUBLIC_SUPABASE_URL: 'https://invalid.example.invalid'
    };
    const childEnv = publisherSubprocessEnvironment(inherited);
    assert.equal(childEnv.GH_TOKEN, 'fixture-never-live');
    assert.equal(childEnv.PATH, inherited.PATH);
    assert.equal(childEnv.GIT_TERMINAL_PROMPT, '0');
    assert.equal(childEnv.GIT_NO_REPLACE_OBJECTS, '1');
    for (const key of ['AIEO_INTERNAL_SECRET', 'OPENROUTER_API_KEY',
      'NPM_TOKEN', 'NEXT_PUBLIC_SUPABASE_URL', 'GITHUB_TOKEN']) {
      assert.equal(Object.hasOwn(childEnv, key), false, key + ' must be absent');
    }
    const fakeGh = join(f.root, 'bin', 'gh');
    const script = readFileSync(fakeGh, 'utf8');
    assert.ok(script.includes('const a=process.argv.slice(2);'));
    writeFileSync(fakeGh, script.replace('const a=process.argv.slice(2);',
      'if (process.env.AIEO_INTERNAL_SECRET || process.env.OPENROUTER_API_KEY || ' +
      'process.env.NPM_TOKEN || process.env.NEXT_PUBLIC_SUPABASE_URL) process.exit(89);\n' +
      'if (process.env.GH_TOKEN !== "fixture-never-live") process.exit(90);\n' +
      'const a=process.argv.slice(2);'));
    const child = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace, env: inherited, encoding: 'utf8', timeout: 25000
    });
    assert.equal(child.status, 0, 'real fake gh must receive only scoped secrets: ' + child.stderr);
    assert.match(child.stdout, /draft-pr-created/);
    assert.match(readFileSync(f.log, 'utf8'), /pr create --draft/);
    assert.equal(git(f.workspace, 'branch', '--show-current'), 'aieo/model-proposal-99123-1');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// Every Git invocation is a possible execution boundary: credentialed
// read-only commands must not have access to the write-scoped GH_TOKEN.
test('publisher grants GH_TOKEN to the one verified Git push, never local Git reads or commits', () => {
  const f = fixture();
  try {
    const realGit = process.env.PATH.split(delimiter)
      .map((dir) => join(dir, 'git')).find((candidate) => existsSync(candidate));
    assert.ok(realGit, 'Git executable must be available for the fixture');
    // The fake gh stub performs its own Git inspection to model GitHub API
    // readback. Exempt only those fake-gh implementation details so this
    // wrapper precisely measures subprocesses launched by the publisher.
    const fakeGh = join(f.root, 'bin', 'gh');
    const ghCode = readFileSync(fakeGh, 'utf8');
    const from = "const g=(...args)=>execFileSync('git',args,";
    assert.ok(ghCode.includes(from));
    writeFileSync(fakeGh, ghCode.replace(from,
      'const g=(...args)=>execFileSync(' + JSON.stringify(realGit) + ',args,'));

    const log = join(f.root, 'git-credential-scope.log');
    const wrapper = join(f.root, 'bin', 'git');
    writeFileSync(wrapper, '#!' + process.execPath + '\n' + [
      "const {spawnSync}=require('node:child_process');",
      "const {appendFileSync}=require('node:fs');",
      'const args=process.argv.slice(2);',
      "const push=args.includes('push');",
      "const token=Boolean(process.env.GH_TOKEN);",
      'appendFileSync(' + JSON.stringify(log) +
        ",JSON.stringify({push,token})+'\\n');",
      'if(push!==token)process.exit(86);',
      'const result=spawnSync(' + JSON.stringify(realGit) +
        ',args,{stdio:"inherit",env:process.env});',
      'process.exit(result.status??87);'
    ].join('\n') + '\n');
    chmodSync(wrapper, 0o755);
    const child = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 25000
    });
    assert.equal(child.status, 0, 'Git token scope must preserve the Draft publisher: ' + child.stderr);
    assert.match(child.stdout, /draft-pr-created/);
    const attestations = readFileSync(log, 'utf8').trim().split('\n')
      .map((line) => JSON.parse(line));
    assert.ok(attestations.some((entry) => entry.push && entry.token),
      'verified Git push still receives the scoped credential');
    assert.ok(attestations.some((entry) => !entry.push && !entry.token),
      'local Git preflight and commit operate without a write token');
    assert.ok(attestations.every((entry) => entry.push === entry.token),
      'no other publisher Git subprocess may inherit GH_TOKEN');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('publisher subprocess environment never forwards test-only knobs in Actions', () => {
  const scoped = publisherSubprocessEnvironment({
    PATH: '/usr/bin', HOME: '/tmp', GH_TOKEN: 'synthetic-not-a-secret',
    GITHUB_ACTIONS: 'true', AIEO_FAKE_GH_LOG: '/tmp/fake.log',
    AIEO_FAKE_RESPONSE: 'rest-undrafted', GITHUB_TOKEN: 'other-token',
    GIT_CONFIG_COUNT: '1', OPENROUTER_API_KEY: 'never-forward'
  });
  assert.equal(scoped.GH_TOKEN, 'synthetic-not-a-secret');
  for (const key of ['AIEO_FAKE_GH_LOG', 'AIEO_FAKE_RESPONSE',
    'GITHUB_TOKEN', 'GIT_CONFIG_COUNT', 'OPENROUTER_API_KEY']) {
    assert.equal(Object.hasOwn(scoped, key), false);
  }
});

test('publisher rejects GitHub CLI host, repository and config redirects before Git or gh', () => {
  const f = fixture();
  try {
    const main = git(f.workspace, 'rev-parse', 'main');
    // Unset GH_* is the only acceptable inherited CLI context. Even
    // canonical-looking explicit overrides remain prohibited by the
    // existing strict Git/GitHub environment denylist.
    assert.equal(validateDispatch(f.env), 'model');
    for (const canonical of [
      { GH_HOST: 'github.com' },
      { GH_REPO: 'jayalshehri/CGP-MVP' },
      { GH_CONFIG_DIR: '' }
    ]) {
      assert.throws(() => validateDispatch({ ...f.env, ...canonical }),
        /untrusted inherited Git environment override/);
    }
    for (const overrides of [
      { GH_HOST: 'attacker.example.invalid' },
      { GH_HOST: 'github.com.attacker.invalid' },
      { GH_REPO: 'other/repository' },
      { GH_CONFIG_DIR: f.root }
    ]) {
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env: { ...f.env, ...overrides },
        encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(child.status, 0, 'redirected CLI context must fail closed');
      assert.match(child.stderr, /untrusted inherited Git environment override/);
      assert.equal(existsSync(f.log), false, 'gh must not have been invoked');
      assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
      assert.equal(git(f.workspace, 'rev-parse', 'main'), main);
      assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote),
        /refs\/heads\/aieo\//, 'publisher must not create candidate refs');
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('publisher checks live process overrides even with a clean injected dispatch', () => {
  // Direct API callers must not evade the real process environment check by
  // passing a sanitized env argument. No real GH token or network is used.
  const safe = {
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'jayalshehri/CGP-MVP',
    GITHUB_RUN_ID: '99123',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_ACTIONS: 'false', GH_TOKEN: 'synthetic-fixture-not-a-secret',
    AIEO_PUBLISH_MODE: 'deterministic'
  };
  const script = 'import { validateDispatch } from ' +
    JSON.stringify(new URL('./aieo-publish-draft.mjs', import.meta.url).href) +
    '; validateDispatch(' + JSON.stringify(safe) + ');';
  for (const injection of [
    { GH_HOST: 'attacker.example.invalid' },
    { GH_REPO: 'other/repository' },
    { GH_CONFIG_DIR: '/tmp/untrusted-gh-config' },
    { GIT_CONFIG_GLOBAL: '/tmp/untrusted-git-config' }
  ]) {
    const child = spawnSync(process.execPath,
      ['--input-type=module', '-e', script],
      { env: { ...process.env, ...injection }, encoding: 'utf8', timeout: 10000 });
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /untrusted inherited Git environment override/);
  }
});

// GITHUB_ACTIONS=false is never sufficient to bypass official GitHub origin
// checks while a real, credential-bearing publisher context is in scope.
test('publisher rejects privileged offline-mode spoof before Git or gh', () => {
  const f = fixture();
  try {
    const originalMain = git(f.workspace, 'rev-parse', 'main');
    const trapBin = join(f.root, 'trap-bin');
    const marker = join(f.root, 'unsafe-command-executed');
    mkdirSync(trapBin);
    for (const binary of ['git', 'gh']) {
      const script = join(trapBin, binary);
      writeFileSync(script, '#!/bin/sh\n' +
        'printf invoked >> ' + JSON.stringify(marker) + '\nexit 91\n');
      chmodSync(script, 0o755);
    }
    for (const change of [
      { GITHUB_ACTIONS: 'false', GH_TOKEN: 'looks-like-a-live-token' },
      { GITHUB_ACTIONS: 'FALSE', GH_TOKEN: 'looks-like-a-live-token' },
      { GITHUB_ACTIONS: '', GH_TOKEN: 'looks-like-a-live-token' },
      { GITHUB_ACTIONS: 'false', GH_TOKEN: 'synthetic-only-do-not-use' }
    ]) {
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace,
        env: { ...f.env, ...change, PATH: trapBin + delimiter + f.env.PATH },
        encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(child.status, 0, 'spoofed Actions context must be blocked');
      assert.match(child.stderr, /publisher requires genuine Actions context for credentials/);
      assert.equal(existsSync(marker), false, 'no Git or gh process may run');
      assert.equal(existsSync(f.log), false, 'no GitHub CLI use');
    }
    assert.equal(git(f.workspace, 'rev-parse', 'main'), originalMain);
    assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
    assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote),
      /refs\/heads\/aieo\//, 'no candidate ref may be published');
    assert.equal(validateDispatch(f.env), 'model', 'real offline fixture stays supported');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('publisher checks process credentials even with a sanitized fixture context', () => {
  const fixtureEnv = {
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'jayalshehri/CGP-MVP',
    GITHUB_RUN_ID: '99123', GITHUB_RUN_ATTEMPT: '1',
    GITHUB_ACTIONS: 'false', GH_TOKEN: 'fixture-never-live',
    AIEO_PUBLISH_MODE: 'deterministic'
  };
  const script = 'import { validateDispatch } from ' +
    JSON.stringify(new URL('./aieo-publish-draft.mjs', import.meta.url).href) +
    '; validateDispatch(' + JSON.stringify(fixtureEnv) + ');';
  for (const injected of [
    { GITHUB_ACTIONS: 'false', GH_TOKEN: 'looks-like-a-live-token' },
    { GITHUB_ACTIONS: 'true', GH_TOKEN: 'looks-like-a-live-token' },
    { GITHUB_ACTIONS: 'false', GITHUB_TOKEN: 'looks-like-a-live-token',
      GH_TOKEN: 'fixture-never-live' }
  ]) {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, ...injected }, encoding: 'utf8', timeout: 10000
    });
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /publisher requires genuine Actions context for credentials/);
  }
});

// A build can leave Git-ignored inputs that the ordinary untracked check
// misses. Independent review of the candidate must not rely solely on
// --exclude-standard and a clean tracked-file diff before Draft publishing.
for (const [label, excludedPath, pattern] of [
  ['ignored environment file', '.env.local', '.env.local'],
  ['ignored nested private key', 'secrets/sample.pem', '*.pem'],
  ['ignored extra build directory', 'coverage/report.txt', 'coverage/']
]) {
  test('publisher blocks ' + label + ' before any Draft write', () => {
    const f = fixture();
    try {
      const base = git(f.workspace, 'rev-parse', 'main');
      const exclusion = join(f.workspace, '.git', 'info', 'exclude');
      writeFileSync(exclusion, readFileSync(exclusion, 'utf8') + '\n' + pattern + '\n');
      const pathname = join(f.workspace, excludedPath);
      mkdirSync(dirname(pathname), { recursive: true });
      writeFileSync(pathname, 'synthetic ignored input\n');
      assert.doesNotMatch(git(f.workspace, 'ls-files', '--others', '--exclude-standard'),
        /(?:\.env\.local|sample\.pem|coverage\/report)/,
        'control: ordinary untracked check must miss the ignored file');
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(child.status, 0);
      assert.match(child.stderr, /unexpected ignored repository inputs/);
      assert.equal(existsSync(f.log), false, 'publisher must not call GitHub CLI');
      assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
      assert.equal(git(f.workspace, 'rev-parse', 'main'), base);
      assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote),
        /refs\/heads\/aieo\//);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
}

// A report directory may carry its own .gitignore; that file is tolerated
// as an untracked handoff by the old check, but must not hide an extra payload.
test('publisher rejects ignored payload hidden by a nested handoff .gitignore', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.workspace, 'aieo-output', '.gitignore'), 'hidden.payload\n');
    writeFileSync(join(f.workspace, 'aieo-output', 'hidden.payload'), 'fixture only\n');
    const child = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
    });
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /unexpected ignored repository inputs/);
    assert.equal(existsSync(f.log), false);
    assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// The strict guard must still accept the exact generated outputs of the
// legitimate Next/npm build, without opening a general ignored-path bypass.
test('publisher permits only the known ignored npm and Next build artifacts', () => {
  const f = fixture();
  try {
    const exclusion = join(f.workspace, '.git', 'info', 'exclude');
    writeFileSync(exclusion, readFileSync(exclusion, 'utf8') +
      '\nnode_modules/\n.next/\nnext-env.d.ts\ntsconfig.tsbuildinfo\n');
    mkdirSync(join(f.workspace, 'node_modules', 'synthetic'), { recursive: true });
    mkdirSync(join(f.workspace, '.next', 'synthetic'), { recursive: true });
    writeFileSync(join(f.workspace, 'node_modules', 'synthetic', 'a.txt'), 'fixture\n');
    writeFileSync(join(f.workspace, '.next', 'synthetic', 'b.txt'), 'fixture\n');
    writeFileSync(join(f.workspace, 'next-env.d.ts'), '// fixture\n');
    writeFileSync(join(f.workspace, 'tsconfig.tsbuildinfo'), '{}\n');
    const child = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(JSON.parse(child.stdout).status, 'draft-pr-created');
    assert.match(readFileSync(f.log, 'utf8'), /pr create --draft/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// An attribute-selected diff.textconv helper executes even with --no-ext-diff.
// Demonstrate the fixture is executable outside the publisher, then ensure
// every publisher diff uses raw bytes and never invokes the helper with GH_TOKEN.
for (const attrOrigin of ['info', 'global']) {
  test('publisher suppresses executable Git diff textconv: ' + attrOrigin, () => {
    const f = fixture();
    try {
      const trusted = git(f.workspace, 'rev-parse', 'main');
      const marker = join(f.root, 'untrusted-textconv-executed');
      const executable = join(f.root, 'untrusted-textconv');
      writeFileSync(executable, '#!/bin/sh\n' +
        'printf invoked > ' + JSON.stringify(marker) + '\n' +
        'printf "synthetic textconv\\n"\n');
      chmodSync(executable, 0o755);
      git(f.workspace, 'config', 'diff.untrusted.textconv', executable);
      const attributes = attrOrigin === 'info'
        ? join(f.workspace, '.git', 'info', 'attributes')
        : join(f.root, 'global-textconv-attributes');
      writeFileSync(attributes, 'components/FeedbackWidget.tsx diff=untrusted\n');
      if (attrOrigin === 'global') {
        git(f.workspace, 'config', 'core.attributesFile', attributes);
      }
      // Test-only control, with no publisher token: --no-ext-diff alone
      // does not suppress this executable diff driver.
      git(f.workspace, 'diff', '--no-ext-diff', '--unified=0', '--', MODEL_ALLOWED_PATH);
      assert.equal(existsSync(marker), true, 'fixture did not activate textconv');
      unlinkSync(marker);
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
      });
      assert.equal(child.status, 0, child.stderr);
      assert.equal(existsSync(marker), false, 'textconv executed with publisher credentials');
      assert.equal(JSON.parse(child.stdout).status, 'draft-pr-created');
      assert.equal(git(f.workspace, 'rev-parse', 'main'), trusted);
      assert.match(readFileSync(f.log, 'utf8'), /pr create --draft/);
      assert.ok(git(f.workspace, 'ls-remote', '--heads', f.remote)
        .includes('refs/heads/aieo/model-proposal-99123-1'));
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
}

// Repository/global Git signing settings can launch an arbitrary gpg.program
// during the publisher's Git commit, with its write-scoped GH_TOKEN inherited.
// Do not invoke any user-configured signer for bounded Draft candidates.
test('publisher bypasses configured executable commit signer under GH_TOKEN', () => {
  const f = fixture();
  try {
    const trusted = git(f.workspace, 'rev-parse', 'HEAD');
    const marker = join(f.root, 'untrusted-signing-helper-executed');
    const signer = join(f.root, 'untrusted-signing-helper');
    writeFileSync(signer, '#!/bin/sh\n' +
      'printf invoked > ' + JSON.stringify(marker) + '\nexit 91\n');
    chmodSync(signer, 0o755);
    git(f.workspace, 'config', 'commit.gpgsign', 'true');
    git(f.workspace, 'config', 'gpg.program', signer);
    // The isolated control carries no publisher token. Git really would
    // invoke the signer if commit.gpgsign were not overridden.
    const control = spawnSync('git', ['commit', '--allow-empty', '-m',
      'synthetic signing control'], {
      cwd: f.workspace, encoding: 'utf8', timeout: 15000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME }
    });
    assert.notEqual(control.status, 0);
    assert.equal(existsSync(marker), true, 'fixture did not invoke signer');
    unlinkSync(marker);
    assert.equal(git(f.workspace, 'rev-parse', 'HEAD'), trusted);

    const child = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(existsSync(marker), false, 'signer ran with publisher token');
    assert.equal(JSON.parse(child.stdout).status, 'draft-pr-created');
    assert.equal(git(f.workspace, 'rev-parse', 'main'), trusted);
    assert.match(readFileSync(f.log, 'utf8'), /pr create --draft/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// The publisher receives GH_TOKEN for PR creation and authenticated push.
// Its Git subprocesses must not run executable remote helpers selected by
// an injected origin URL or pushurl, even when the Git environment is clean.
for (const remoteSetting of ['fetch-url', 'pushurl']) {
  test('publisher blocks executable Git origin ' + remoteSetting + ' under GH_TOKEN', () => {
    const f = fixture();
    try {
      const trusted = git(f.workspace, 'rev-parse', 'main');
      const marker = join(f.root, 'executable-transport-ran');
      const helper = join(f.root, 'untrusted-remote-helper');
      writeFileSync(helper, '#!/bin/sh\nprintf invoked > ' + JSON.stringify(marker) +
        '\nexit 93\n');
      chmodSync(helper, 0o755);
      const url = 'ext::' + helper;
      git(f.workspace, 'config',
        remoteSetting === 'fetch-url' ? 'remote.origin.url' : 'remote.origin.pushurl', url);

      // Control: this real Git fixture WOULD run the helper if ext:: were
      // allowed. The control subprocess has no publisher credential.
      const control = spawnSync('git', ['-c', 'protocol.ext.allow=always',
        remoteSetting === 'fetch-url' ? 'ls-remote' : 'push', 'origin',
        ...(remoteSetting === 'fetch-url' ? [] : ['main:refs/heads/main'])], {
        cwd: f.workspace, encoding: 'utf8', timeout: 15000,
        env: { PATH: process.env.PATH, HOME: process.env.HOME,
          GIT_TERMINAL_PROMPT: '0' }
      });
      assert.notEqual(control.status, 0, 'unprotected transport must fail after invoking helper');
      assert.equal(existsSync(marker), true, 'executable fixture did not run');
      unlinkSync(marker);

      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(child.status, 0, 'untrusted remote transport must fail closed');
      assert.equal(existsSync(marker), false, 'Git remote helper executed with GH_TOKEN');
      assert.equal(git(f.workspace, 'rev-parse', 'main'), trusted);
      assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote),
        /refs\/heads\/aieo\/model-proposal-99123-1/,
        'no candidate remote branch may be pushed');
      if (existsSync(f.log)) {
        const actions = readFileSync(f.log, 'utf8');
        assert.doesNotMatch(actions, /pr create|workflow run|pr merge/,
          'no PR or workflow writes after a forbidden Git transport');
      }
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
}

// An untrusted clean filter can execute during *git diff*, before git add.
// Reject it from every Git attribute source while the publisher holds GH_TOKEN.
for (const attrOrigin of ['info', 'working-tree', 'global']) {
  test('publisher blocks executable Git clean filter before any diff: ' + attrOrigin, () => {
    const f = fixture();
    try {
      const trusted = git(f.workspace, 'rev-parse', 'main');
      const marker = join(f.root, 'untrusted-clean-filter-executed');
      const executable = join(f.root, 'untrusted-clean-filter');
      writeFileSync(executable, '#!/bin/sh\n' +
        'printf invoked > ' + JSON.stringify(marker) + '\ncat\n');
      chmodSync(executable, 0o755);
      git(f.workspace, 'config', 'filter.untrusted.clean', executable);
      const attributes = attrOrigin === 'info'
        ? join(f.workspace, '.git', 'info', 'attributes')
        : attrOrigin === 'working-tree'
          ? join(f.workspace, '.gitattributes')
          : join(f.root, 'external-git-attributes');
      writeFileSync(attributes, 'components/FeedbackWidget.tsx filter=untrusted\n');
      if (attrOrigin === 'global') {
        git(f.workspace, 'config', 'core.attributesFile', attributes);
      }
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(child.status, 0, 'executable attribute must be rejected');
      assert.match(child.stderr, /Git content filter; executable clean filters are forbidden/);
      assert.equal(existsSync(marker), false, 'clean filter ran with publisher credentials');
      assert.equal(existsSync(f.log), false, 'must reject before any GitHub CLI call');
      assert.equal(git(f.workspace, 'rev-parse', 'main'), trusted);
      assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
      assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote),
        /refs\/heads\/aieo\/model-proposal-99123-1/,
        'no candidate branch was pushed');
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
}

// Candidate-only attribute checks are insufficient: a different, tracked and
// modified file can run its clean filter during the publisher's global diff
// before changed-path scoping. Reject all tracked filters without invoking any.
test('publisher refuses an executable clean filter on an unrelated tracked file', () => {
  const f = fixture();
  try {
    const other = 'components/Unrelated.tsx';
    writeFileSync(join(f.workspace, other), 'export const unrelated = 1;\n');
    git(f.workspace, 'add', '--', other);
    git(f.workspace, 'commit', '-qm', 'additional trusted tracked file');
    git(f.workspace, 'push', '-q', 'origin', 'main');
    const trusted = git(f.workspace, 'rev-parse', 'HEAD');
    f.env.GITHUB_SHA = trusted;
    writeFileSync(join(f.workspace, other), 'export const unrelated = 2;\n');

    const marker = join(f.root, 'other-clean-filter-executed');
    const executable = join(f.root, 'other-clean-filter');
    writeFileSync(executable, '#!/bin/sh\nprintf invoked > ' + JSON.stringify(marker) +
      '\ncat\n');
    chmodSync(executable, 0o755);
    git(f.workspace, 'config', 'filter.untrusted.clean', executable);
    writeFileSync(join(f.workspace, '.git', 'info', 'attributes'),
      'components/Unrelated.tsx filter=untrusted\n');

    // Control proves this Git setup is actually capable of running the
    // helper (outside the publisher, with no synthetic publisher GH_TOKEN).
    git(f.workspace, 'diff', '--no-ext-diff', '--no-textconv', '--', other);
    assert.equal(existsSync(marker), true, 'fixture did not activate the clean helper');
    unlinkSync(marker);

    const child = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
    });
    assert.notEqual(child.status, 0, 'unrelated clean helper must fail closed');
    assert.match(child.stderr, /Git content filter; executable clean filters are forbidden/);
    assert.equal(existsSync(marker), false, 'unrelated helper ran under publisher credentials');
    assert.equal(existsSync(f.log), false, 'must reject before any GitHub CLI action');
    assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
    assert.equal(git(f.workspace, 'rev-parse', 'main'), trusted);
    assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote),
      /refs\/heads\/aieo\/model-proposal-99123-1/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// Git config inside a disposable checkout is an executable-code surface too.
// Neither inherited-environment checks nor suppressed hooks alone protect
// read-only ls-files/diff operations against configured helper programs.
for (const key of ['core.fsmonitor', 'diff.external']) {
  test('publisher disables repository-local executable Git helper: ' + key, () => {
    const f = fixture();
    try {
      const marker = join(f.root, 'untrusted-helper-was-executed');
      const executable = join(f.root, 'untrusted-local-git-helper');
      writeFileSync(executable, '#!/bin/sh\nprintf invoked > ' +
        JSON.stringify(marker) + '\nexit 91\n');
      chmodSync(executable, 0o755);
      git(f.workspace, 'config', key, executable);
      const trusted = git(f.workspace, 'rev-parse', 'main');
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
      });
      // No helper is invoked, so the bounded mocked Draft flow runs.
      assert.equal(child.status, 0, child.stderr);
      assert.equal(existsSync(marker), false, key + ' executable ran under publisher token');
      assert.equal(JSON.parse(child.stdout).status, 'draft-pr-created');
      git(f.workspace, 'config', '--unset', key);
      assert.equal(git(f.workspace, 'rev-parse', 'main'), trusted);
      assert.match(readFileSync(f.log, 'utf8'), /pr create --draft/);
      assert.match(git(f.workspace, 'ls-remote', '--heads', f.remote),
        /refs\/heads\/aieo\/model-proposal-99123-1/);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
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
      { GIT_ASKPASS: 'untrusted-credential-helper' },
      { GIT_EXEC_PATH: join(f.root, 'untrusted-git-helpers') },
      { GIT_EXTERNAL_DIFF: 'untrusted-diff-helper' },
      { GIT_SSL_NO_VERIFY: '1' },
      { GIT_SSL_CAINFO: join(f.root, 'untrusted-git-ca.pem') },
      { SSL_CERT_FILE: join(f.root, 'untrusted-trust.pem') },
      { CURL_CA_BUNDLE: join(f.root, 'untrusted-curl.pem') },
      { HTTPS_PROXY: 'http://untrusted-proxy.invalid:8080' },
      { https_proxy: 'http://untrusted-proxy.invalid:8080' },
      { ALL_PROXY: 'socks5://untrusted-proxy.invalid:1080' },
      { GIT_TRACE_CURL: join(f.root, 'untrusted-trace.log') },
      // GitHub CLI dispatch and API metadata must also stay pinned to the
      // checked repository and authenticated github.com host.
      { GH_HOST: 'untrusted.example.invalid' },
      { GH_REPO: 'other/foreign-repository' },
      { GH_CONFIG_DIR: join(f.root, 'foreign-gh-config') },
      { GH_DEBUG: 'api' },
      { GH_PAGER: 'untrusted-helper' },
      { GH_ENTERPRISE_TOKEN: 'synthetic-placeholder-only' }
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
    GITHUB_RUN_ATTEMPT: '1', GITHUB_ACTIONS: 'false',
    GH_TOKEN: 'fixture-never-live', AIEO_PUBLISH_MODE: 'model',
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

// The gh authentication subprocess runs after the initial trusted-origin
// check. If it unexpectedly changes origin.pushurl, never publish to that
// alternate remote even though the candidate and earlier origin were valid.
test('publisher blocks late pushurl rewrite by gh auth setup before token-bearing push', () => {
  const f = fixture();
  try {
    const trap = join(f.root, 'trap.git');
    git(f.root, 'init', '-q', '--bare', trap);
    const base = git(f.workspace, 'rev-parse', 'main');
    f.env.AIEO_FAKE_RESPONSE = 'auth-redirect-pushurl';
    const child = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
    });
    assert.notEqual(child.status, 0, 'late push redirection must fail closed');
    assert.match(child.stderr, /origin resolution changed before candidate push/);
    assert.equal(git(f.workspace, 'rev-parse', 'main'), base);
    assert.equal(git(f.workspace, 'remote', 'get-url', '--push', 'origin'), trap,
      'fixture actually modified the remote push destination after preflight');
    assert.equal(readFileSync(f.log, 'utf8').trim(), 'auth setup-git',
      'no PR creation, workflow dispatch, merge or other GitHub write');
    assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', trap),
      /refs\/heads\/aieo\/model-proposal-99123-1/,
      'candidate must not reach the unapproved destination');
    assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote),
      /refs\/heads\/aieo\/model-proposal-99123-1/,
      'candidate must not be pushed anywhere');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

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
      writeFileSync(handoffPath, JSON.stringify({ ...f.args.proposal, ...reportChanges }, null, 2) + '\n');
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
      JSON.stringify({ ...f.qa, routeCasesPassed: 0 }, null, 2) + '\n');
    const child = spawnSync(process.execPath, [publisher], { cwd: f.workspace,
      env: f.env, encoding: 'utf8', timeout: 20000 });
    assert.notEqual(child.status, 0);
    assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
    assert.equal(git(f.workspace, 'ls-remote', '--heads', f.remote).includes('model-proposal-99123-1'), false);
  } finally { rmSync(f.root, { force: true, recursive: true }); }
});

for (const fakeResponse of ['foreign-create-url', 'view-not-draft', 'view-extra-file', 'view-wrong-head-oid', 'actor-spoof', 'rest-undrafted', 'rest-head-moved', 'bad-view-json']) {
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
        writeFileSync(reportPath, original, { mode: 0o600 });
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
    chmodSync(dir, 0o700);
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
  ['candidate unreadable by its owner', (f) => chmodSync(f.target, 0o200)],
  ['setuid candidate', (f) => chmodSync(f.target, 0o4600)],
  ['setgid candidate', (f) => chmodSync(f.target, 0o2600)],
  ['sticky candidate', (f) => chmodSync(f.target, 0o1600)],
  ['group-writable source directory', (f) => chmodSync(join(f.workspace, 'components'), 0o775)],
  ['setuid source directory', (f) => chmodSync(join(f.workspace, 'components'), 0o4755)],
  ['setgid source directory', (f) => chmodSync(join(f.workspace, 'components'), 0o2755)],
  ['sticky source directory', (f) => chmodSync(join(f.workspace, 'components'), 0o1755)]
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

// The publisher verifies a candidate via the opened inode and then verifies
// the final pathname. An attacker may touch that same inode after final fstat,
// restoring private mode and size. Reject the changed ctime before any push.
test('publisher rejects same-inode metadata mutation between final fstat and lstat', () => {
  const f = fixture();
  try {
    const base = git(f.workspace, 'rev-parse', 'main');
    const source = readFileSync(f.target, 'utf8');
    const preload = join(f.root, 'publisher-final-path-race.mjs');
    const marker = join(f.root, 'final-path-race.marker');
    writeFileSync(preload, [
      "import fs from 'node:fs';",
      "import { syncBuiltinESMExports } from 'node:module';",
      'const nativeLstat = fs.lstatSync;',
      'let sourceStats = 0;',
      'fs.lstatSync = (path, ...args) => {',
      '  if (path === ' + JSON.stringify(MODEL_ALLOWED_PATH) + ' && ++sourceStats === 3) {',
      '    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);',
      '    fs.chmodSync(path, 0o600);',
      '    fs.chmodSync(path, 0o644);',
      '    fs.writeFileSync(' + JSON.stringify(marker) + ', "mutated");',
      '  }',
      '  return nativeLstat(path, ...args);',
      '};',
      'syncBuiltinESMExports();',
      ''
    ].join('\n'));
    const attacked = spawnSync(process.execPath, ['--import', preload, publisher], {
      cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 25000
    });
    assert.equal(readFileSync(marker, 'utf8'), 'mutated',
      'control: race must happen after descriptor fstat and before pathname lstat');
    assert.notEqual(attacked.status, 0, 'same-inode ctime change must fail closed');
    assert.match(attacked.stderr, /untrusted candidate source or directory/);
    assert.equal(readFileSync(f.target, 'utf8'), source,
      'attack must preserve the exact reviewed source bytes');
    assert.equal(git(f.workspace, 'rev-parse', 'main'), base);
    assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
    assert.equal(existsSync(f.log), false, 'failed attestation cannot contact GitHub CLI');
    assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote),
      /refs\/heads\/aieo\/model-proposal-99123-1/);
    const healthy = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 25000
    });
    assert.equal(healthy.status, 0, healthy.stderr);
    assert.equal(JSON.parse(healthy.stdout).status, 'draft-pr-created');
    assert.equal(git(f.workspace, 'rev-parse', 'main'), base);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

// A malformed blob in trusted Git history must never be normalized into a
// string and treated as the exact approved base. Git accepts arbitrary bytes;
// Node's UTF-8 decode does not. The candidate itself is valid UTF-8 here, so
// only an independent raw-byte check on the immutable base detects the flaw.
test('publisher rejects invalid UTF-8 in immutable base before GitHub writes', () => {
  const f = fixture();
  try {
    const raw = Buffer.from(f.args.original.replace(
      '  const sample = 1;', '  const sample = 1; //~'), 'utf8');
    const marker = raw.indexOf(Buffer.from('~'));
    assert.ok(marker >= 0);
    raw[marker] = 0xff;
    writeFileSync(f.target, raw);
    git(f.workspace, 'add', '--', MODEL_ALLOWED_PATH);
    git(f.workspace, 'commit', '-qm', 'fixture malformed base bytes');
    git(f.workspace, 'push', '-q', 'origin', 'main');
    const base = git(f.workspace, 'rev-parse', 'main');
    f.env.GITHUB_SHA = base;
    const normalized = readFileSync(f.target, 'utf8');
    assert.equal(normalized.includes('\uFFFD'), true,
      'control: plain UTF-8 reading silently changes base bytes');
    assert.equal(Buffer.from(normalized, 'utf8').equals(raw), false);
    writeFileSync(f.target,
      normalized.replace('  const sample = 1;', '  const sample = 2;'));
    assert.equal(git(f.workspace, 'diff', '--name-only'), MODEL_ALLOWED_PATH);
    const child = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
    });
    assert.notEqual(child.status, 0, 'invalid immutable base must fail closed');
    assert.match(child.stderr, /immutable Git source blob contains invalid UTF-8/);
    assert.equal(existsSync(f.log), false, 'no GitHub CLI may be called');
    assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
    assert.equal(git(f.workspace, 'rev-parse', 'main'), base);
    assert.doesNotMatch(git(f.workspace, 'ls-remote', '--heads', f.remote),
      /refs\/heads\/aieo\/model-proposal-99123-1/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

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


// Git runs post-index-change when git add writes the index. Prevent a
// repository-local hook from executing under the privileged publisher token.
// Earlier protections applied only to switch/commit/push, leaving git add open.
test('publisher suppresses post-index-change on git add with scoped GH_TOKEN', () => {
  const f = fixture();
  try {
    const base = git(f.workspace, 'rev-parse', 'main');
    const marker = join(f.root, 'untrusted-index-hook-ran');
    const hook = join(f.workspace, '.git', 'hooks', 'post-index-change');
    writeFileSync(hook, '#!/bin/sh\nprintf invoked > ' + JSON.stringify(marker) + '\n');
    chmodSync(hook, 0o755);

    // Control: with no privileged credential, unprotected git add must
    // execute this real hook. Reset restores the fixture's unstaged patch.
    git(f.workspace, 'add', '--', MODEL_ALLOWED_PATH);
    assert.equal(existsSync(marker), true,
      'control must prove the injected hook actually executes');
    git(f.workspace, 'reset', '-q', '--', MODEL_ALLOWED_PATH);
    unlinkSync(marker);
    assert.equal(git(f.workspace, 'diff', '--name-only'), MODEL_ALLOWED_PATH);

    const child = spawnSync(process.execPath, [publisher], {
      cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
    });
    assert.equal(child.status, 0, 'guarded publisher must succeed: ' + child.stderr);
    assert.equal(existsSync(marker), false,
      'post-index-change must never execute with publisher credentials');
    assert.equal(JSON.parse(child.stdout).status, 'draft-pr-created');
    assert.equal(git(f.workspace, 'rev-parse', 'main'), base);
    assert.match(readFileSync(f.log, 'utf8'), /pr create --draft/);
    assert.match(git(f.workspace, 'ls-remote', '--heads', f.remote),
      /refs\/heads\/aieo\/model-proposal-99123-1/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});


// A trusted repo URL by itself does not attest Git transport. A local or
// URL-specific proxy/TLS/header setting can silently alter ls-remote and push.
// Pretend to run on Actions but abort before contacting the canonical HTTPS URL.
test('real Actions publisher refuses hostile Git transport config before any network or GitHub write', () => {
  for (const [key, value] of [
    ['http.proxy', 'http://proxy.invalid:8080'],
    ['http.https://github.com/.proxy', 'http://scoped.invalid:8080'],
    ['http.sslVerify', 'false'],
    ['http.https://github.com/.extraHeader', 'Authorization: Bearer fixture-only'],
    ['http.followRedirects', 'true'],
    ['core.askPass', '/tmp/should-not-execute-askpass'],
    ['core.sshCommand', '/tmp/should-not-execute-ssh'],
    ['core.gitProxy', '/tmp/should-not-execute-proxy'],
    ['core.alternateRefsCommand', '/tmp/should-not-execute-refs'],
    ['uploadpack.packObjectsHook', '/tmp/should-not-execute-hook'],
    ['credential.https://github.com.helper', '!synthetic-helper'],
    ['remote.origin.proxy', 'http://proxy.invalid:8080'],
    ['remote.origin.uploadpack', 'custom-helper'],
    ['url.https://alternate.invalid/.insteadOf', 'https://github.com/']
  ]) {
    const f = fixture();
    try {
      const originalMain = git(f.workspace, 'rev-parse', 'main');
      git(f.workspace, 'remote', 'set-url', 'origin',
        'https://github.com/jayalshehri/CGP-MVP.git');
      git(f.workspace, 'config', '--local', key, value);
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace,
        env: { ...f.env, GITHUB_ACTIONS: 'true' },
        encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(child.status, 0, key + ' must refuse publication');
      assert.match(child.stderr, /publisher Git transport configuration is unsafe/, key);
      assert.equal(existsSync(f.log), false, 'no gh access: ' + key);
      assert.equal(git(f.workspace, 'branch', '--show-current'), 'main', key);
      assert.equal(git(f.workspace, 'rev-parse', 'main'), originalMain, key);
      // No ls-remote/push is safe to try against the newly configured HTTPS
      // origin here. The specific config-block error precedes both in code.
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});

test('official publisher origin policy accepts only one exact HTTPS repo fetch/push target', () => {
  assert.equal(verifyOfficialPublisherOrigin(
    ['https://github.com/jayalshehri/CGP-MVP'],
    ['https://github.com/jayalshehri/CGP-MVP.git']), true);
  for (const [fetchUrls, pushUrls] of [
    [['https://evil.invalid/jayalshehri/CGP-MVP'], ['https://github.com/jayalshehri/CGP-MVP']],
    [['https://github.com/jayalshehri/CGP-MVP'], ['file:///tmp/rogue.git']],
    [['https://github.com/jayalshehri/CGP-MVP'], ['https://github.com/jayalshehri/CGP-MVP', 'https://example.org/mirror']],
    [['https://user:token@github.com/jayalshehri/CGP-MVP'], ['https://github.com/jayalshehri/CGP-MVP']]
  ]) {
    assert.throws(() => verifyOfficialPublisherOrigin(fetchUrls, pushUrls),
      /origin fetch and push URLs must target/);
  }
});

// A rogue origin can mirror the exact approved main SHA, pass the existing
// remote-main attestation, and accept a confidential patch. A local or global
// insteadOf rewrite or a separate pushurl is equally dangerous. Prove each
// destination is rejected BEFORE any branch, push, gh API call, or disclosure.
for (const variant of ['fetch', 'push', 'insteadOf']) {
  test('trusted Actions publisher rejects mirrored unapproved origin: ' + variant, () => {
    const f = fixture();
    try {
      const base = git(f.workspace, 'rev-parse', 'main');
      const rogue = join(f.root, 'rogue.git');
      git(f.root, 'init', '-q', '--bare', rogue);
      git(f.workspace, 'push', '-q', rogue, 'main:refs/heads/main');
      assert.equal(git(f.workspace, 'ls-remote', rogue, 'refs/heads/main'),
        base + '\trefs/heads/main',
        'control: attacker remote mirrors the trusted source SHA');
      if (variant === 'fetch') {
        git(f.workspace, 'remote', 'set-url', 'origin', rogue);
      } else if (variant === 'push') {
        git(f.workspace, 'remote', 'set-url', '--push', 'origin', rogue);
      } else {
        git(f.workspace, 'remote', 'set-url', 'origin',
          'https://github.com/jayalshehri/CGP-MVP');
        git(f.workspace, 'config', 'url.' + rogue + '.insteadOf',
          'https://github.com/jayalshehri/CGP-MVP');
        assert.equal(git(f.workspace, 'remote', 'get-url', 'origin'), rogue,
          'control: Git expands a repo-local insteadOf rewrite');
      }
      const child = spawnSync(process.execPath, [publisher], {
        cwd: f.workspace, env: { ...f.env, GITHUB_ACTIONS: 'true' },
        encoding: 'utf8', timeout: 20000
      });
      assert.notEqual(child.status, 0, 'unapproved origin must fail closed');
      // The stronger configuration gate now rejects pushurl and insteadOf
      // earlier than the URL gate; a direct rogue fetch URL still fails at
      // the exact-origin check. Do not weaken either control.
      assert.match(child.stderr, variant === 'fetch'
        ? /origin fetch and push URLs must target/
        : /publisher Git transport configuration is unsafe/);
      assert.equal(git(f.workspace, 'rev-parse', 'main'), base);
      assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
      assert.equal(existsSync(f.log), false, 'must never call GitHub CLI');
      assert.doesNotMatch(git(f.workspace, 'ls-remote', rogue),
        /refs\/heads\/aieo\/model-proposal-99123-1/);
      assert.doesNotMatch(git(f.workspace, 'ls-remote', f.remote),
        /refs\/heads\/aieo\/model-proposal-99123-1/);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
}


test('publisher refuses semantically identical but noncanonical or shadowed model handoffs before GitHub writes', () => {
  const f = fixture();
  try {
    const main = git(f.workspace, 'rev-parse', 'main');
    for (const kind of ['proposal', 'qa', 'security', 'reviewer']) {
      const path = join(f.workspace, 'aieo-output', 'model-' + kind + '.json');
      const original = readFileSync(path, 'utf8');
      const parsed = JSON.parse(original);
      const attacks = [
        ['compact JSON', JSON.stringify(parsed) + '\n'],
        ['duplicate status', '{\n  "status": "shadow",\n' + original.slice(2)]
      ];
      for (const [label, bytes] of attacks) {
        // JSON.parse(bytes) yields the original report claims in both cases.
        assert.deepEqual(JSON.parse(bytes), parsed);
        writeFileSync(path, bytes);
        const child = spawnSync(process.execPath, [publisher], {
          cwd: f.workspace, env: f.env, encoding: 'utf8', timeout: 20000
        });
        assert.notEqual(child.status, 0, kind + ': ' + label);
        assert.equal(existsSync(f.log), false,
          kind + ': untrusted handoff must not reach gh');
        assert.equal(git(f.workspace, 'rev-parse', 'main'), main);
        assert.equal(git(f.workspace, 'branch', '--show-current'), 'main');
      }
      writeFileSync(path, original);
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
