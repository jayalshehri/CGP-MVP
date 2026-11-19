// Local model-output integration rehearsal: the transport and GitHub CLI are mocked,
// while the actual proposal, independent review processes, and Git publisher run unchanged.
// This test proves no real OpenRouter request or GitHub PR publication.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';

const scripts = dirname(fileURLToPath(import.meta.url));
const hash = (source) => createHash('sha256').update(source).digest('hex');
const route = '  const controlId = useMemo(() => /^\\/controls\\/(\\d+)(?:\\/|$)/.exec(pagePath)?.[1] ?? null, [pagePath]);';

const scenarios = [
  {
    name: 'minimal synthetic source',
    original: ['function fixture() {', route, '  const statusLabel = "Old status";', '}', ''].join('\n'),
    find: '  const statusLabel = "Old status";',
    replace: '  const statusLabel = "Current status";',
    task: 'Correct the stale status label in this temporary fixture.'
  },
  {
    name: 'real checked-in FeedbackWidget TSX',
    // The checked-in source is used only in a local Git fixture and intercepted fetch.
    original: readFileSync(join(scripts, '..', MODEL_ALLOWED_PATH), 'utf8'),
    find: '<h2 id="feedback-title">أرسل ملاحظتك</h2>',
    replace: '<h2 id="feedback-title">شارك ملاحظتك</h2>',
    task: 'Improve the Arabic feedback dialog heading without changing any interactive behavior.'
  }
];
for (const scenario of scenarios) {
test('mocked whole-chain independently reviews ' + scenario.name, () => {
  const root = mkdtempSync(join(tmpdir(), 'aieo-model-whole-chain-'));
  const workspace = join(root, 'workspace');
  const remote = join(root, 'remote.git');
  const bin = join(root, 'bin');
  const shimPath = join(root, 'mock-model-transport.mjs');
  const transportCalls = join(root, 'model-calls.txt');
  const ghLog = join(root, 'gh-commands.txt');
  const target = join(workspace, MODEL_ALLOWED_PATH);
  const report = (name) => join(workspace, 'aieo-output', 'model-' + name + '.json');
  const { original, find, replace: replacement, task } = scenario;
  assert.equal(original.split(find).length, 2, 'the source must contain exactly one approved text target');
  const candidate = original.replace(find, replacement);
  const response = JSON.stringify({
    path: MODEL_ALLOWED_PATH, find, replace: replacement,
    explanation: 'Change one approved inert display text node in an isolated fixture'
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
      '    choices: [{ finish_reason: "stop", message: { role: "assistant", content: ' + JSON.stringify(response) + ' } }]',
      '  }) };',
      '};',
      ''
    ].join('\n'));

    const gh = join(bin, 'gh');
    writeFileSync(gh, "#!/usr/bin/env node\nconst {appendFileSync}=require('node:fs');\nconst {execFileSync}=require('node:child_process');\nconst a=process.argv.slice(2);\nappendFileSync(process.env.AIEO_FAKE_GH_LOG,a.join(' ')+'\\n');\nconst g=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();\nif(a[0]==='pr'&&a[1]==='create'){\n  console.log('https://github.com/jayalshehri/CGP-MVP/pull/777');process.exit(0);\n}\nif(a[0]==='pr'&&a[1]==='view'){\n  console.log(JSON.stringify({\n    url:'https://github.com/jayalshehri/CGP-MVP/pull/777',state:'OPEN',isDraft:true,\n    baseRefName:'main',headRefName:'aieo/model-proposal-77331-1',\n    baseRefOid:g('rev-parse','main'),headRefOid:g('rev-parse','HEAD'),\n    headRepository:{nameWithOwner:'jayalshehri/CGP-MVP'},headRepositoryOwner:{login:'jayalshehri'},\n    files:[{path:'components/FeedbackWidget.tsx'}]\n  }));process.exit(0);\n}\nif(a[0]==='api'&&a[1]==='repos/jayalshehri/CGP-MVP/pulls/777'){\n  console.log(JSON.stringify({number:777,url:'https://github.com/jayalshehri/CGP-MVP/pull/777',\n    login:'github-actions[bot]',id:41898282,type:'Bot',\n    state:'open',draft:true,mergedAt:null,baseRef:'main',baseSha:g('rev-parse','main'),\n    baseRepo:'jayalshehri/CGP-MVP',headRef:'aieo/model-proposal-77331-1',\n    headSha:g('rev-parse','HEAD'),headRepo:'jayalshehri/CGP-MVP'}));process.exit(0);\n}\nif(a[0]==='auth'||a[0]==='workflow')process.exit(0);\nprocess.exit(4);\n");
    chmodSync(gh, 0o755);
    const env = {
      ...process.env, PATH: bin + delimiter + process.env.PATH,
      GITHUB_ACTIONS: 'false', // offline local bare-remote rehearsal, never a trusted runner
      AIEO_FAKE_GH_LOG: ghLog,
      GITHUB_REPOSITORY: 'jayalshehri/CGP-MVP',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_RUN_ID: '77331', GITHUB_RUN_ATTEMPT: '1',
      GITHUB_SHA: git('rev-parse', 'HEAD').trim(),
      OPENROUTER_API_KEY: 'synthetic-only-do-not-use',
      OPENROUTER_MODEL_ID: 'provider/fixture',
      AIEO_MODEL_ENABLED: 'true',
      AIEO_SOURCE_SHARING_APPROVED: 'true',
      AIEO_MODEL_TASK: task,
      AIEO_MODEL_APPLY: '1',
      AIEO_PUBLISH_MODE: 'model',
      GH_TOKEN: 'fixture-never-live'
    };
    const run = (args, overrides = {}, workingDirectory = workspace) => spawnSync(process.execPath, args, {
      cwd: workingDirectory, env: { ...env, ...overrides }, encoding: 'utf8', timeout: 25000
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
    assert.equal(attestation.taskHash, hash(task));
    assert.equal(attestation.dispatchRunId, env.GITHUB_RUN_ID);
    assert.equal(attestation.dispatchRunAttempt, env.GITHUB_RUN_ATTEMPT);
    assert.equal(attestation.sourceCommitSha, env.GITHUB_SHA,
      'the mocked provider-to-publisher handoff must attest the exact trusted commit');

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

    if (scenario.name === 'real checked-in FeedbackWidget TSX') {
      // A successful chain is not proof that each independent process will
      // reject a candidate changed AFTER the model proposal. Exercise the
      // actual QA, Security and Reviewer CLIs separately, not only the final
      // publisher. Each role uses an exclusive output path; remove its prior
      // valid report before rerunning and restore it afterwards.
      const modified = candidate.replace('if (!visible) return null;', 'if (true) return null;');
      assert.notEqual(modified, candidate, 'fixture must contain the visibility guard');
      for (const [role, script, args, refusedStatus] of [
        ['qa', 'aieo-model-gates.mjs', ['qa'], 'failed'],
        ['security', 'aieo-model-security.mjs', [], 'failed'],
        ['reviewer', 'aieo-model-gates.mjs', ['reviewer'], 'blocked']
      ]) {
        const evidencePath = report(role);
        const approvedReport = readFileSync(evidencePath, 'utf8');
        rmSync(evidencePath);
        writeFileSync(target, modified);
        try {
          const refusedRole = run([join(scripts, script), ...args]);
          assert.notEqual(refusedRole.status, 0,
            role + ' must independently reject changed executable source');
          const refusedReport = JSON.parse(readFileSync(evidencePath, 'utf8'));
          assert.equal(refusedReport.status, refusedStatus,
            role + ' must issue its own negative verdict');
          assert.equal(existsSync(ghLog), false,
            role + ' rejection must not contact GitHub CLI');
          assert.equal(git('branch', '--show-current').trim(), 'main');
          assert.equal(git('show', 'main:' + MODEL_ALLOWED_PATH), original);
          assert.doesNotMatch(git('ls-remote', '--heads', remote),
            /refs\/heads\/aieo\/model-proposal-/);
        } finally {
          writeFileSync(target, candidate);
          rmSync(evidencePath, { force: true });
          writeFileSync(evidencePath, approvedReport, { mode: 0o600 });
        }
      }

      // Even after all role reports pass, the publisher must independently
      // reject a post-review executable mutation before invoking git push or gh.
      const tampered = candidate.replace('if (!visible) return null;', 'if (true) return null;');
      assert.notEqual(tampered, candidate, 'test requires a live source visibility guard');
      writeFileSync(target, tampered);
      const refused = run([join(scripts, 'aieo-publish-draft.mjs')]);
      assert.notEqual(refused.status, 0, 'publisher must reverify evidence at the final boundary');
      assert.equal(existsSync(ghLog), false, 'rejected candidate must not contact GitHub CLI');
      assert.equal(git('branch', '--show-current').trim(), 'main');
      assert.doesNotMatch(git('ls-remote', '--heads', remote),
        /refs\/heads\/aieo\/model-proposal-/, 'rejected patch must not create a remote branch');
      writeFileSync(target, candidate);

      // A successful run of QA, Security and Reviewer is not itself authority
      // to publish. Corrupt each independent handoff *after* it passed, then
      // demonstrate that the unchanged publisher refuses every forged report
      // before contacting gh or pushing a branch.
      for (const role of ['qa', 'security', 'reviewer']) {
        const evidencePath = report(role);
        const verified = readFileSync(evidencePath, 'utf8');
        const forged = JSON.parse(verified);
        forged.proposedHash = '0'.repeat(64);
        try {
          writeFileSync(evidencePath, JSON.stringify(forged) + '\n');
          const deniedEvidence = run([join(scripts, 'aieo-publish-draft.mjs')]);
          assert.notEqual(deniedEvidence.status, 0,
            role + ' evidence tampering must block publication');
          assert.equal(existsSync(ghLog), false,
            role + ' tampering must not invoke any GitHub CLI operation');
          assert.equal(git('branch', '--show-current').trim(), 'main');
          assert.equal(git('show', 'main:' + MODEL_ALLOWED_PATH), original);
          assert.doesNotMatch(git('ls-remote', '--heads', remote),
            /refs\/heads\/aieo\/model-proposal-/,
            role + ' tampering must not create a remote candidate branch');
        } finally {
          writeFileSync(evidencePath, verified);
        }
      }
    }

    // Model/QA/Security/Reviewer ran in the unprivileged producer checkout.
    // Emulate the artifact boundary with a SECOND, clean Git checkout: copy
    // only the five allowlisted handoffs and start the unchanged importer in
    // its own child process, with neither a model nor a GitHub credential.
    // The later publisher is a different process and receives its synthetic
    // GitHub credential only after the stage process has exited successfully.
    const isolated = join(root, 'isolated-publisher');
    execFileSync('git', ['clone', '-q', '--branch', 'main', remote, isolated], { cwd: root });
    const isolatedGit = (...args) => execFileSync('git', args, { cwd: isolated, encoding: 'utf8' });
    const staging = join(isolated, 'aieo-staging');
    mkdirSync(join(staging, 'components'), { recursive: true, mode: 0o700 });
    mkdirSync(join(staging, 'aieo-output'), { recursive: true, mode: 0o700 });
    copyFileSync(target, join(staging, MODEL_ALLOWED_PATH));
    for (const name of ['proposal', 'qa', 'security', 'reviewer']) {
      copyFileSync(report(name), join(staging, 'aieo-output', 'model-' + name + '.json'));
    }
    const cleanSource = join(isolated, MODEL_ALLOWED_PATH);
    assert.equal(readFileSync(cleanSource, 'utf8'), original,
      'fresh publisher checkout must begin with original trusted source');

    const stageScript = join(scripts, 'aieo-stage-reviewed-model.mjs');
    const noCredentialEnv = { GH_TOKEN: '', GITHUB_TOKEN: '', OPENROUTER_API_KEY: '' };
    const stagedSource = join(staging, MODEL_ALLOWED_PATH);
    const untouchedMain = isolatedGit('rev-parse', 'main').trim();
    // This is the actual fresh-checkout import process, not a mocked importer.
    // A syntactically canonical report or a harmless-looking single-line edit
    // is still untrusted if its hashes do not match the independently reviewed
    // candidate. None may modify the checkout or reach the write-scoped CLI.
    for (const [name, field] of [
      ['proposal', 'proposedHash'], ['qa', 'proposedHash'],
      ['security', 'addedLines'], ['reviewer', 'proposedHash']
    ]) {
      const evidencePath = join(staging, 'aieo-output', 'model-' + name + '.json');
      const verified = readFileSync(evidencePath, 'utf8');
      const forged = JSON.parse(verified);
      assert.ok(Object.hasOwn(forged, field), name + ' must contain expected review evidence');
      if (field === 'addedLines') {
        assert.equal(typeof forged.addedLines, 'number');
        forged.addedLines += 1;
      } else {
        assert.equal(typeof forged.proposedHash, 'string');
        forged.proposedHash = '0'.repeat(64);
      }
      try {
        writeFileSync(evidencePath, JSON.stringify(forged, null, 2) + '\n');
        assert.deepEqual(JSON.parse(readFileSync(evidencePath, 'utf8')), forged,
          'the tampered report must remain valid JSON');
        const rejected = run([stageScript], noCredentialEnv, isolated);
        assert.notEqual(rejected.status, 0,
          name + ' forged artifact must fail independent staging');
        assert.equal(readFileSync(cleanSource, 'utf8'), original);
        assert.equal(existsSync(join(isolated, 'aieo-output')), false);
        assert.equal(existsSync(ghLog), false);
        assert.equal(isolatedGit('rev-parse', 'main').trim(), untouchedMain);
      } finally {
        writeFileSync(evidencePath, verified);
      }
    }

    const reviewedSource = readFileSync(stagedSource, 'utf8');
    assert.equal(reviewedSource, candidate);
    const unreviewedSource = reviewedSource.replace(replacement, replacement + ' ');
    assert.notEqual(unreviewedSource, reviewedSource,
      'negative case must change only the reviewed replacement line');
    try {
      writeFileSync(stagedSource, unreviewedSource);
      const rejected = run([stageScript], noCredentialEnv, isolated);
      assert.notEqual(rejected.status, 0,
        'a well-formed but unreviewed edit must fail independent staging');
      assert.equal(readFileSync(cleanSource, 'utf8'), original);
      assert.equal(existsSync(join(isolated, 'aieo-output')), false);
      assert.equal(existsSync(ghLog), false);
      assert.equal(isolatedGit('rev-parse', 'main').trim(), untouchedMain);
    } finally {
      writeFileSync(stagedSource, reviewedSource);
    }

    // Accidental inherited credentials must block staging before any bytes
    // cross into the privileged checkout, even when all reports are valid.
    for (const credential of ['GH_TOKEN', 'GITHUB_TOKEN', 'OPENROUTER_API_KEY']) {
      const rejected = run([stageScript], {
        ...noCredentialEnv, [credential]: 'test-only-placeholder'
      }, isolated);
      assert.notEqual(rejected.status, 0, credential + ' must block staging');
      assert.equal(readFileSync(cleanSource, 'utf8'), original);
      assert.equal(existsSync(join(isolated, 'aieo-output')), false);
      assert.equal(existsSync(ghLog), false);
    }

    // Inject an extra artifact: independent staging must fail closed without
    // mutating the checkout or contacting the mocked GitHub remote.
    const unexpected = join(staging, 'aieo-output', 'unexpected.js');
    writeFileSync(unexpected, 'unapproved artifact\n');
    const blockedStage = run([stageScript], noCredentialEnv, isolated);
    assert.notEqual(blockedStage.status, 0, 'unexpected handoff must be refused');
    assert.equal(readFileSync(cleanSource, 'utf8'), original);
    assert.equal(existsSync(ghLog), false, 'staging failure must not invoke GitHub CLI');
    rmSync(unexpected);

    const staged = run([stageScript], noCredentialEnv, isolated);
    assert.equal(staged.status, 0, 'isolated stage: ' + staged.stderr);
    assert.equal(JSON.parse(staged.stdout).status, 'reviewed-artifact-staged');
    assert.equal(readFileSync(cleanSource, 'utf8'), candidate);
    assert.equal(existsSync(staging), false, 'downloaded artifacts must be consumed');
    for (const name of ['proposal', 'qa', 'security', 'reviewer']) {
      assert.equal(readFileSync(join(isolated, 'aieo-output', 'model-' + name + '.json'), 'utf8'),
        readFileSync(report(name), 'utf8'), 'stage must preserve exact reviewed evidence');
    }
    assert.equal(existsSync(ghLog), false, 'staging must never invoke GitHub CLI');
    assert.equal(isolatedGit('branch', '--show-current').trim(), 'main',
      'staging must not create a branch');

    // The isolated publisher receives a valid, fully staged artifact, but its
    // own verification must still reject handoff corruption that happens AFTER
    // staging succeeds and BEFORE the write-scoped process starts. This
    // boundary differs from the earlier stage rejection tests.
    const finalPublisher = join(scripts, 'aieo-publish-draft.mjs');
    for (const [role, field] of [
      ['proposal', 'sourceHash'], ['qa', 'proposedHash'],
      ['security', 'addedLines'], ['reviewer', 'proposedHash']
    ]) {
      const stagedReport = join(isolated, 'aieo-output', 'model-' + role + '.json');
      const accepted = readFileSync(stagedReport, 'utf8');
      const forged = JSON.parse(accepted);
      assert.ok(Object.hasOwn(forged, field), role + ' must carry the attested field');
      if (field === 'addedLines') {
        assert.equal(typeof forged[field], 'number');
        forged[field] += 1;
      } else {
        assert.equal(typeof forged[field], 'string');
        forged[field] = '0'.repeat(64);
      }
      try {
        writeFileSync(stagedReport, JSON.stringify(forged, null, 2) + '\n');
        const refused = run([finalPublisher], {}, isolated);
        assert.notEqual(refused.status, 0,
          role + ' post-stage forgery must fail at the final publisher boundary');
        assert.equal(readFileSync(cleanSource, 'utf8'), candidate);
        assert.equal(isolatedGit('branch', '--show-current').trim(), 'main');
        assert.equal(isolatedGit('show', 'main:' + MODEL_ALLOWED_PATH), original);
        assert.doesNotMatch(isolatedGit('ls-remote', '--heads', remote),
          /refs\/heads\/aieo\/model-proposal-/);
        assert.equal(existsSync(ghLog), false,
          role + ' forgery must not reach GitHub CLI');
      } finally {
        writeFileSync(stagedReport, accepted);
      }
    }

    const unreviewedPublishedSource = candidate.replace(replacement, replacement + ' ');
    assert.notEqual(unreviewedPublishedSource, candidate,
      'post-stage candidate mutation must actually alter the source');
    try {
      writeFileSync(cleanSource, unreviewedPublishedSource);
      const refused = run([finalPublisher], {}, isolated);
      assert.notEqual(refused.status, 0,
        'post-stage candidate mutation must fail independently in publisher');
      assert.equal(isolatedGit('branch', '--show-current').trim(), 'main');
      assert.equal(isolatedGit('show', 'main:' + MODEL_ALLOWED_PATH), original);
      assert.doesNotMatch(isolatedGit('ls-remote', '--heads', remote),
        /refs\/heads\/aieo\/model-proposal-/);
      assert.equal(existsSync(ghLog), false);
    } finally {
      writeFileSync(cleanSource, candidate);
    }


    // A valid report, clean checkout and independently approved source are
    // insufficient if origin/main advances while the model is being reviewed.
    // Advance ONLY the disposable bare remote to a different valid commit and
    // prove the write-scoped publisher refuses the now-stale base before gh.
    git('commit', '--allow-empty', '-qm', 'fixture: unrelated main advanced');
    const advancedMain = git('rev-parse', 'HEAD').trim();
    assert.notEqual(advancedMain, untouchedMain);
    const remoteRef = (...args) => execFileSync('git',
      ['--git-dir', remote, 'update-ref', ...args], { cwd: root });
    try {
      remoteRef('refs/heads/main', advancedMain, untouchedMain);
      const stale = run([finalPublisher], {}, isolated);
      assert.notEqual(stale.status, 0,
        'publisher must refuse if official main changes after staging');
      assert.match(stale.stderr, /remote main changed since the trusted workflow checkout/);
      assert.equal(isolatedGit('branch', '--show-current').trim(), 'main');
      assert.equal(isolatedGit('show', 'main:' + MODEL_ALLOWED_PATH), original);
      assert.equal(readFileSync(cleanSource, 'utf8'), candidate);
      assert.equal(existsSync(ghLog), false, 'stale main must not contact gh');
      assert.doesNotMatch(isolatedGit('ls-remote', '--heads', remote),
        /refs\/heads\/aieo\/model-proposal-/);
    } finally {
      remoteRef('refs/heads/main', untouchedMain, advancedMain);
    }

    // Replayed run IDs must not overwrite an existing remote proposal branch.
    // Simulate a colliding branch in the disposable bare remote only; the
    // publisher must reject it without force-pushing, gh, or touching main.
    const existingBranch = 'refs/heads/aieo/model-proposal-77331-1';
    remoteRef(existingBranch, untouchedMain);
    try {
      const collision = run([finalPublisher], {}, isolated);
      assert.notEqual(collision.status, 0,
        'an existing proposal branch must prevent another publication');
      assert.match(collision.stderr, /candidate branch already exists on origin/);
      assert.equal(isolatedGit('branch', '--show-current').trim(), 'main');
      assert.equal(isolatedGit('show', 'main:' + MODEL_ALLOWED_PATH), original);
      assert.equal(readFileSync(cleanSource, 'utf8'), candidate);
      assert.equal(existsSync(ghLog), false, 'duplicate branch must not reach gh');
      assert.match(isolatedGit('ls-remote', '--heads', remote),
        /refs\/heads\/aieo\/model-proposal-77331-1/);
    } finally {
      remoteRef('-d', existingBranch, untouchedMain);
    }
    assert.equal(isolatedGit('ls-remote', '--heads', remote).trim(),
      untouchedMain + '\trefs/heads/main', 'fixture remote restored before positive publish');

    // Only the third, token-scoped child may push to the disposable bare remote
    // and call the fake gh CLI. This remains a mock, NOT live GitHub publication.
    const published = run([join(scripts, 'aieo-publish-draft.mjs')], {}, isolated);
    assert.equal(published.status, 0, 'isolated Publisher: ' + published.stderr);
    const result = JSON.parse(published.stdout);
    assert.equal(result.status, 'draft-pr-created');
    assert.equal(result.requiresHumanMerge, true);
    assert.equal(result.branch, 'aieo/model-proposal-77331-1');
    assert.equal(isolatedGit('show', 'main:' + MODEL_ALLOWED_PATH), original, 'main remains unchanged');
    assert.equal(isolatedGit('diff', '--name-only', 'main', 'HEAD').trim(), MODEL_ALLOWED_PATH);
    assert.match(isolatedGit('ls-remote', '--heads', remote), /refs\/heads\/aieo\/model-proposal-77331-1/);
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
}
