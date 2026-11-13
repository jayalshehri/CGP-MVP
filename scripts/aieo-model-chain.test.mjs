// Local model-output integration rehearsal: the transport and GitHub CLI are mocked,
// while the actual proposal, independent review processes, and Git publisher run unchanged.
// This test proves no real OpenRouter request or GitHub PR publication.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';

const scripts = dirname(fileURLToPath(import.meta.url));
const hash = (source) => createHash('sha256').update(source).digest('hex');
const route = '  const controlId = useMemo(() => /^\\/controls\\/(\\d+)(?:\\/|$)/.exec(pagePath)?.[1] ?? null, [pagePath]);';

test('mocked provider proposal travels through real QA, Security, Reviewer and Git publisher processes', () => {
  const root = mkdtempSync(join(tmpdir(), 'aieo-model-whole-chain-'));
  const workspace = join(root, 'workspace');
  const remote = join(root, 'remote.git');
  const bin = join(root, 'bin');
  const shimPath = join(root, 'mock-model-transport.mjs');
  const transportCalls = join(root, 'model-calls.txt');
  const ghLog = join(root, 'gh-commands.txt');
  const target = join(workspace, MODEL_ALLOWED_PATH);
  const report = (name) => join(workspace, 'aieo-output', 'model-' + name + '.json');
  const original = ['function fixture() {', route, '  const statusLabel = "Old status";', '}', ''].join('\n');
  const find = '  const statusLabel = "Old status";';
  const replacement = '  const statusLabel = "Current status";';
  const candidate = original.replace(find, replacement);
  const response = JSON.stringify({
    path: MODEL_ALLOWED_PATH, find, replace: replacement,
    explanation: 'Correct a stale label in this isolated fixture'
  });
  const git = (...args) => execFileSync('git', args, { cwd: workspace, encoding: 'utf8' });
  try {
    mkdirSync(workspace, { recursive: true });
    mkdirSync(bin);
    mkdirSync(dirname(target), { recursive: true });
    mkdirSync(join(workspace, 'aieo-output'));
    execFileSync('git', ['init', '-q', '--bare', remote], { cwd: root });
    git('init', '-q');
    git('config', 'user.name', 'Fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    git('remote', 'add', 'origin', remote);
    writeFileSync(target, original);
    git('add', '--', MODEL_ALLOWED_PATH);
    git('commit', '-qm', 'fixture source');
    git('branch', '-M', 'main');
    git('push', '-q', '-u', 'origin', 'main');

    // Preload only a local transport stub. A production API is never contacted.
    writeFileSync(shimPath, [
      "import { appendFileSync } from 'node:fs';",
      'globalThis.fetch = async (url, options) => {',
      '  appendFileSync(' + JSON.stringify(transportCalls) + ', "called\\n");',
      '  const payload = JSON.parse(options.body);',
      '  if (url !== "https://openrouter.ai/api/v1/chat/completions" ||',
      '      !payload.messages[1].content.includes(' + JSON.stringify(original) + ')) {',
      '    throw new Error("Mock received unexpected source or endpoint");',
      '  }',
      '  return { ok: true, text: async () => JSON.stringify({',
      '    choices: [{ message: { content: ' + JSON.stringify(response) + ' } }]',
      '  }) };',
      '};',
      ''
    ].join('\n'));

    const gh = join(bin, 'gh');
    writeFileSync(gh, "#!/usr/bin/env node\nconst {appendFileSync}=require('node:fs');\nconst {execFileSync}=require('node:child_process');\nconst a=process.argv.slice(2);\nappendFileSync(process.env.AIEO_FAKE_GH_LOG,a.join(' ')+'\\n');\nconst g=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();\nif(a[0]==='pr'&&a[1]==='create'){\n  console.log('https://github.com/jayalshehri/CGP-MVP/pull/777');process.exit(0);\n}\nif(a[0]==='pr'&&a[1]==='view'){\n  console.log(JSON.stringify({\n    url:'https://github.com/jayalshehri/CGP-MVP/pull/777',state:'OPEN',isDraft:true,\n    baseRefName:'main',headRefName:'aieo/model-proposal-77331-1',\n    baseRefOid:g('rev-parse','main'),headRefOid:g('rev-parse','HEAD'),\n    headRepository:{nameWithOwner:'jayalshehri/CGP-MVP'},headRepositoryOwner:{login:'jayalshehri'},\n    files:[{path:'components/FeedbackWidget.tsx'}]\n  }));process.exit(0);\n}\nif(a[0]==='api'&&a[1]==='repos/jayalshehri/CGP-MVP/pulls/777'){\n  console.log(JSON.stringify({number:777,url:'https://github.com/jayalshehri/CGP-MVP/pull/777',\n    login:'github-actions[bot]',id:41898282,type:'Bot'}));process.exit(0);\n}\nif(a[0]==='auth'||a[0]==='workflow')process.exit(0);\nprocess.exit(4);\n");
    chmodSync(gh, 0o755);
    const env = {
      ...process.env, PATH: bin + delimiter + process.env.PATH,
      AIEO_FAKE_GH_LOG: ghLog,
      GITHUB_REPOSITORY: 'jayalshehri/CGP-MVP',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_RUN_ID: '77331', GITHUB_RUN_ATTEMPT: '1',
      OPENROUTER_API_KEY: 'synthetic-only-do-not-use',
      OPENROUTER_MODEL_ID: 'provider/fixture',
      AIEO_MODEL_ENABLED: 'true',
      AIEO_SOURCE_SHARING_APPROVED: 'true',
      AIEO_MODEL_TASK: 'Correct the stale status label in this temporary fixture.',
      AIEO_MODEL_APPLY: '1',
      AIEO_PUBLISH_MODE: 'model',
      GH_TOKEN: 'synthetic-only-do-not-use'
    };
    const run = (args, overrides = {}) => spawnSync(process.execPath, args, {
      cwd: workspace, env: { ...env, ...overrides }, encoding: 'utf8', timeout: 25000
    });

    const proposal = join(scripts, 'aieo-model-proposal.mjs');
    const denied = run(['--import', shimPath, proposal], {
      AIEO_SOURCE_SHARING_APPROVED: 'false'
    });
    assert.notEqual(denied.status, 0, 'Unapproved external source sharing must be blocked');
    assert.equal(existsSync(transportCalls), false, 'Transport must not be invoked without opt-in');
    assert.equal(readFileSync(target, 'utf8'), original);

    const proposed = run(['--import', shimPath, proposal]);
    assert.equal(proposed.status, 0, 'Proposal CLI: ' + proposed.stderr);
    assert.equal(readFileSync(transportCalls, 'utf8').trim(), 'called');
    assert.equal(readFileSync(target, 'utf8'), candidate);
    const attestation = JSON.parse(readFileSync(report('proposal'), 'utf8'));
    assert.equal(attestation.status, 'proposed');
    assert.equal(attestation.sourceHash, hash(original));
    assert.equal(attestation.proposedHash, hash(candidate));
    assert.equal(attestation.sourceShared, true);

    // Three independent child processes use their real CLI scripts and actual Git diff.
    for (const [filename, role] of [
      ['aieo-model-gates.mjs', 'qa'],
      ['aieo-model-security.mjs', null],
      ['aieo-model-gates.mjs', 'reviewer']
    ]) {
      const child = run([join(scripts, filename), ...(role ? [role] : [])]);
      assert.equal(child.status, 0, (role || 'security') + ' gate: ' + child.stderr);
    }
    assert.equal(JSON.parse(readFileSync(report('reviewer'), 'utf8')).status,
      'draft-pr-eligible');

    // The real publisher operates against a temporary Git remote and fake gh executable.
    const published = run([join(scripts, 'aieo-publish-draft.mjs')]);
    assert.equal(published.status, 0, 'Publisher: ' + published.stderr);
    const result = JSON.parse(published.stdout);
    assert.equal(result.status, 'draft-pr-created');
    assert.equal(result.requiresHumanMerge, true);
    assert.equal(result.branch, 'aieo/model-proposal-77331-1');
    assert.equal(git('show', 'main:' + MODEL_ALLOWED_PATH), original, 'main remains unchanged');
    assert.equal(git('diff', '--name-only', 'main', 'HEAD').trim(), MODEL_ALLOWED_PATH);
    assert.match(git('ls-remote', '--heads', remote), /refs\/heads\/aieo\/model-proposal-77331-1/);
    const ghCommands = readFileSync(ghLog, 'utf8');
    assert.match(ghCommands, /pr create --draft --base main --head aieo\/model-proposal-77331-1/);
    assert.match(ghCommands, /pr view https:\/\/github.com\/jayalshehri\/CGP-MVP\/pull\/777 --json/);
    assert.match(ghCommands, /api repos\/jayalshehri\/CGP-MVP\/pulls\/777 --jq/);
    assert.match(ghCommands, /workflow run cgp-required-ci.yml --ref aieo\/model-proposal-77331-1/);
    assert.match(ghCommands, /workflow run aieo-model-candidate-roles.yml --ref main -f pr_number=777/);
    assert.equal(result.independentRoles, 'dispatched-not-proven');
    assert.doesNotMatch(ghCommands, /^pr merge\b|^release create\b|^deploy\b|--auto-merge\b/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
