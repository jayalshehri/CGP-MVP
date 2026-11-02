// Local model-output integration rehearsal: the transport and GitHub CLI are mocked,
// while the actual proposal, independent review processes, and Git publisher run unchanged.
// This test proves no real OpenRouter request or GitHub PR publication.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync, renameSync, symlinkSync, linkSync, statSync, readdirSync } from 'node:fs';
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
  // A valid U+FFFD marker makes malformed source bytes indistinguishable under lossy UTF-8.
  const original = ['function fixture() {', route, '  const statusLabel = "Old status";', '  // Synthetic Unicode marker: \uFFFD', '}', ''].join('\n');
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
    // Exercise canonical origin validation while all Git traffic remains local.
    git('config', 'remote.origin.url', 'https://github.com/jayalshehri/CGP-MVP.git');
    git('config', 'url.file://' + remote + '.insteadOf',
      'https://github.com/jayalshehri/CGP-MVP.git');

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
      '  if (process.env.AIEO_FIXTURE_CORRUPT_POST_REQUEST === "1") {',
      '    const { readFileSync, writeFileSync } = await import("node:fs");',
      '    const before = readFileSync(' + JSON.stringify(target) + ');',
      '    const marker = Buffer.from([0xef, 0xbf, 0xbd]);',
      '    const index = before.indexOf(marker);',
      '    if (index < 0) throw new Error("Synthetic UTF-8 marker is missing");',
      '    writeFileSync(' + JSON.stringify(target) + ', Buffer.concat([',
      '      before.subarray(0, index), Buffer.from([0xff]), before.subarray(index + marker.length)',
      '    ]));',
      '  }',
      '  if (process.env.AIEO_FIXTURE_REVOKE_REF_POST_REQUEST === "1") {',
      '    process.env.GITHUB_REF = "refs/heads/untrusted";',
      '  }',
      '  return { ok: true, text: async () => JSON.stringify({',
      '    choices: [{ finish_reason: "stop", message: { role: "assistant", content: ' + JSON.stringify(response) + ' } }]',
      '  }) };',
      '};',
      ''
    ].join('\n'));

    const gh = join(bin, 'gh');
    const view = JSON.stringify({
      number: 777, url: 'https://github.com/jayalshehri/CGP-MVP/pull/777',
      isDraft: true, state: 'OPEN', baseRefName: 'main',
      headRefName: 'aieo/model-proposal-77331-1',
      headRefOid: 'AIEO_HEAD_SHA_PLACEHOLDER',
      headRepositoryOwner: { login: 'jayalshehri' },
      isCrossRepository: false
    });
    writeFileSync(gh, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$AIEO_FAKE_GH_LOG"\n' +
      'if [ "$1" = "pr" ] && [ "$2" = "create" ]; then\n' +
      '  printf "https://github.com/jayalshehri/CGP-MVP/pull/777\\n"\nfi\n' +
      'if [ "$1" = "pr" ] && [ "$2" = "view" ]; then\n' +
      "  printf '%s\\n' '" + view + "' | sed \"s/AIEO_HEAD_SHA_PLACEHOLDER/$(git rev-parse HEAD)/g\"\nfi\n");
    chmodSync(gh, 0o755);
    // The published code must resolve a canonical GitHub push URL. This
    // fixture's Git transport uses a local bare remote, so a test-only shim
    // attests the canonical URL during the successful rehearsal.
    const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    const shim = join(bin, 'git');
    writeFileSync(shim, [
      '#!/bin/sh',
      'if [ "$1" = "remote" ] && [ "$2" = "get-url" ] && [ "$3" = "--push" ] && [ "$4" = "--all" ] && [ "$5" = "origin" ] && [ "$AIEO_FIXTURE_ATTEST_PUSH" = "true" ]; then',
      '  printf "%s\\n" "https://github.com/jayalshehri/CGP-MVP.git"',
      '  exit 0',
      'fi',
      'exec ' + JSON.stringify(realGit) + ' "$@"',
      ''
    ].join('\n'));
    chmodSync(shim, 0o755);
    const env = {
      ...process.env, PATH: bin + delimiter + process.env.PATH,
      AIEO_FAKE_GH_LOG: ghLog,
      AIEO_FIXTURE_ATTEST_PUSH: 'true',
      GITHUB_REPOSITORY: 'jayalshehri/CGP-MVP',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_RUN_ID: '77331', GITHUB_RUN_ATTEMPT: '1',
      GITHUB_SHA: git('rev-parse', 'HEAD').trim(),
      OPENROUTER_API_KEY: 'synthetic-only-do-not-use',
      OPENROUTER_MODEL_ID: 'provider/fixture',
      AIEO_MODEL_ENABLED: 'true',
      AIEO_SOURCE_SHARING_APPROVED: 'true',
      AIEO_APPROVED_SOURCE_SHA256: hash(original),
      AIEO_MODEL_TASK: 'Correct the stale status label in this temporary fixture.',
      AIEO_MODEL_APPLY: '1',
      AIEO_PUBLISH_MODE: 'model',
      GH_TOKEN: 'synthetic-only-do-not-use'
    };
    const run = (args, overrides = {}) => spawnSync(process.execPath, args, {
      cwd: workspace, env: { ...env, ...overrides }, encoding: 'utf8', timeout: 25000
    });

    const proposal = join(scripts, 'aieo-model-proposal.mjs');
    // The source-sharing CLI must not read a redirected source or let its
    // report write escape the checkout. The local provider stub records calls
    // so every rejection is proved to happen BEFORE sharing any source.
    const externalSource = join(root, 'external-source.tsx');
    renameSync(target, externalSource);
    symlinkSync(externalSource, target);
    const sourceRedirect = run(['--import', shimPath, proposal]);
    assert.notEqual(sourceRedirect.status, 0, 'Symlinked proposal source must fail closed');
    assert.match(sourceRedirect.stderr, /Unsafe model review workspace entry/);
    assert.equal(existsSync(transportCalls), false, 'Symlink must not reach external provider');
    rmSync(target);
    renameSync(externalSource, target);

    const externalSourceLink = join(root, 'external-source-hardlink.tsx');
    linkSync(target, externalSourceLink);
    const multiplyLinkedSource = run(['--import', shimPath, proposal]);
    assert.notEqual(multiplyLinkedSource.status, 0, 'Hardlinked source must fail closed');
    assert.equal(existsSync(transportCalls), false, 'Hardlink must not reach external provider');
    rmSync(externalSourceLink);

    // Node's default readFileSync('utf8') replaces invalid byte sequences with
    // U+FFFD. A fabricated approval hash of that decoded text must not permit
    // disclosure of a file whose original bytes were never approved.
    writeFileSync(target, Buffer.concat([Buffer.from(original, 'utf8'), Buffer.from([0xff])]));
    const lossySourceHash = hash(readFileSync(target, 'utf8'));
    const malformedSource = run(['--import', shimPath, proposal], {
      AIEO_APPROVED_SOURCE_SHA256: lossySourceHash
    });
    assert.notEqual(malformedSource.status, 0, 'Malformed source UTF-8 must fail before provider transport');
    assert.match(malformedSource.stderr, /Unsafe or oversized AIEO approved source/);
    assert.equal(existsSync(transportCalls), false, 'Invalid UTF-8 must never reach the provider');
    writeFileSync(target, original);

    const outputDir = join(workspace, 'aieo-output');
    const externalOutputDir = join(root, 'redirected-output');
    renameSync(outputDir, externalOutputDir);
    symlinkSync(externalOutputDir, outputDir, 'dir');
    const redirectedOutput = run(['--import', shimPath, proposal]);
    assert.notEqual(redirectedOutput.status, 0, 'Redirected report directory must fail closed');
    assert.match(redirectedOutput.stderr, /Unsafe model review workspace entry/);
    assert.equal(existsSync(transportCalls), false, 'Redirected report must not call provider');
    rmSync(outputDir);
    renameSync(externalOutputDir, outputDir);

    const externalReport = join(root, 'external-proposal.json');
    writeFileSync(externalReport, 'PRESERVE EXTERNAL REPORT\\n');
    symlinkSync(externalReport, report('proposal'));
    const redirectedReport = run(['--import', shimPath, proposal]);
    assert.notEqual(redirectedReport.status, 0, 'Symlinked proposal report must fail closed');
    assert.equal(readFileSync(externalReport, 'utf8'), 'PRESERVE EXTERNAL REPORT\\n');
    assert.equal(existsSync(transportCalls), false, 'Report link must not call provider');
    rmSync(report('proposal'));

    writeFileSync(report('proposal'), 'PRESERVE HARDLINKED REPORT\\n');
    const externalHardReport = join(root, 'external-proposal-hardlink.json');
    linkSync(report('proposal'), externalHardReport);
    const hardlinkedReport = run(['--import', shimPath, proposal]);
    assert.notEqual(hardlinkedReport.status, 0, 'Hardlinked proposal report must fail closed');
    assert.equal(readFileSync(externalHardReport, 'utf8'), 'PRESERVE HARDLINKED REPORT\\n');
    assert.equal(existsSync(transportCalls), false, 'Hardlinked report must not call provider');
    rmSync(report('proposal'));
    rmSync(externalHardReport);

    const denied = run(['--import', shimPath, proposal], {
      AIEO_SOURCE_SHARING_APPROVED: 'false'
    });
    assert.notEqual(denied.status, 0, 'Unapproved external source sharing must be blocked');
    assert.equal(existsSync(transportCalls), false, 'Transport must not be invoked without opt-in');
    assert.equal(readFileSync(target, 'utf8'), original);
    const deniedHash = run(['--import', shimPath, proposal], {
      AIEO_APPROVED_SOURCE_SHA256: '0'.repeat(64)
    });
    assert.notEqual(deniedHash.status, 0, 'Source mismatch must block the provider');
    assert.equal(existsSync(transportCalls), false, 'Mismatched source consent must not call the provider');
    assert.equal(JSON.parse(readFileSync(report('proposal'), 'utf8')).sourceShared, false,
      'Blocked consent must never be reported as a source-sharing attempt');
    assert.equal(readFileSync(target, 'utf8'), original);

    // Regression: a source initially containing a legitimate U+FFFD can be
    // changed after the provider request into INVALID UTF-8 bytes that decode
    // to the same JS string. The old readFileSync('utf8') equality check
    // silently accepted this, then applied a candidate to unapproved bytes.
    const approvedWithReplacementCharacter = original + '// benign marker: \uFFFD\\n';
    writeFileSync(target, approvedWithReplacementCharacter);
    const previouslyBlockedReport = readFileSync(report('proposal'), 'utf8');
    rmSync(transportCalls, { force: true });
    const corruptedAfterRequest = run(['--import', shimPath, proposal], {
      AIEO_APPROVED_SOURCE_SHA256: hash(approvedWithReplacementCharacter),
      AIEO_FIXTURE_CORRUPT_POST_REQUEST: '1'
    });
    assert.notEqual(corruptedAfterRequest.status, 0,
      'Post-request malformed bytes must block the model apply');
    assert.match(corruptedAfterRequest.stderr, /Unsafe or oversized AIEO approved source/);
    assert.equal(readFileSync(transportCalls, 'utf8').trim(), 'called',
      'The corruption fixture must execute after the mocked provider request');
    assert.equal(readFileSync(target, 'utf8'), approvedWithReplacementCharacter,
      'Lossy decoding must look identical despite changed source bytes');
    assert.notDeepEqual(readFileSync(target), Buffer.from(approvedWithReplacementCharacter),
      'Fixture must actually contain different, invalid source bytes');
    assert.equal(readFileSync(report('proposal'), 'utf8'), previouslyBlockedReport,
      'Failed post-request attestation must not overwrite evidence with a proposed result');
    writeFileSync(target, original);
    rmSync(transportCalls);

    // A proposal may be valid even if the apply trust gate fails AFTER the
    // asynchronous model call. Never overwrite a prior blocked report with a
    // false 'proposed' result when the candidate was not actually applied.
    const blockedEvidenceBefore = readFileSync(report('proposal'), 'utf8');
    const revokedDuringRequest = run(['--import', shimPath, proposal], {
      AIEO_FIXTURE_REVOKE_REF_POST_REQUEST: '1'
    });
    assert.notEqual(revokedDuringRequest.status, 0, 'Revoked trust gate must fail local apply');
    assert.match(revokedDuringRequest.stderr, /Untrusted invocation cannot apply model code/);
    assert.equal(readFileSync(transportCalls, 'utf8').trim(), 'called',
      'The gate was revoked after the mocked model transport');
    assert.equal(readFileSync(target, 'utf8'), original, 'Failed apply must keep original source');
    assert.equal(readFileSync(report('proposal'), 'utf8'), blockedEvidenceBefore,
      'Failed apply must not issue success-shaped proposal evidence');
    rmSync(transportCalls);
    const sourceBeforeAtomicApply = statSync(target);

    const proposed = run(['--import', shimPath, proposal]);
    assert.equal(proposed.status, 0, 'Proposal CLI: ' + proposed.stderr);
    assert.equal(readFileSync(transportCalls, 'utf8').trim(), 'called');
    assert.equal(readFileSync(target, 'utf8'), candidate);
    const sourceAfterAtomicApply = statSync(target);
    assert.notEqual(sourceAfterAtomicApply.ino, sourceBeforeAtomicApply.ino,
      'Atomic apply must replace the source inode rather than truncate it');
    assert.equal(sourceAfterAtomicApply.mode & 0o777, sourceBeforeAtomicApply.mode & 0o777,
      'Atomic apply must preserve the approved source file mode');
    assert.deepEqual(readdirSync(dirname(target)).filter((name) =>
      name.startsWith('.aieo-model-stage-')), [], 'No staged source file should remain');
    const attestation = JSON.parse(readFileSync(report('proposal'), 'utf8'));
    assert.equal(attestation.status, 'proposed');
    assert.equal(attestation.sourceHash, hash(original));
    assert.equal(attestation.proposedHash, hash(candidate));
    assert.equal(attestation.sourceShared, true);

    // The provider successfully applied a candidate containing a legitimate
    // U+FFFD byte sequence. Corrupt those bytes AFTER proposal evidence was
    // issued. A lossy UTF-8 reader returns the same candidate text, but each
    // independent gate and the token-bearing publisher must refuse the bytes.
    const approvedCandidateBytes = readFileSync(target);
    const utf8Replacement = Buffer.from([0xef, 0xbf, 0xbd]);
    const markerAt = approvedCandidateBytes.indexOf(utf8Replacement);
    assert.ok(markerAt >= 0, 'Valid candidate must contain the U+FFFD fixture');
    writeFileSync(target, Buffer.concat([
      approvedCandidateBytes.subarray(0, markerAt), Buffer.from([0xff]),
      approvedCandidateBytes.subarray(markerAt + utf8Replacement.length)
    ]));
    assert.equal(readFileSync(target, 'utf8'), candidate,
      'Lossy decoding disguises the post-proposal byte substitution');
    assert.notDeepEqual(readFileSync(target), approvedCandidateBytes);
    for (const [filename, role] of [
      ['aieo-model-gates.mjs', 'qa'],
      ['aieo-model-security.mjs', 'security'],
      ['aieo-model-gates.mjs', 'reviewer']
    ]) {
      const deniedReview = run([join(scripts, filename), ...(role === 'security' ? [] : [role])]);
      assert.notEqual(deniedReview.status, 0, role + ' must reject invalid source bytes');
      assert.match(deniedReview.stderr, /Unsafe or oversized AIEO approved source/);
      assert.equal(existsSync(report(role)), false,
        role + ' must not issue success-shaped evidence for corrupted source');
    }
    const deniedPublisher = run([join(scripts, 'aieo-publish-draft.mjs')]);
    assert.notEqual(deniedPublisher.status, 0,
      'Token-bearing publisher must independently reject post-review source corruption');
    assert.match(deniedPublisher.stderr, /Unsafe or oversized AIEO approved source/);
    assert.equal(existsSync(ghLog), false, 'No GitHub PR command may follow corrupted bytes');
    writeFileSync(target, approvedCandidateBytes);

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
    assert.match(ghCommands, /pr create --draft --repo jayalshehri\/CGP-MVP --base main --head aieo\/model-proposal-77331-1/);
    assert.match(ghCommands, /pr view https:\/\/github.com\/jayalshehri\/CGP-MVP\/pull\/777/);
    assert.match(ghCommands, /workflow run cgp-required-ci.yml --repo jayalshehri\/CGP-MVP --ref aieo\/model-proposal-77331-1/);
    assert.doesNotMatch(ghCommands, /^pr merge\b|^release create\b|^deploy\b|--auto-merge\b/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
