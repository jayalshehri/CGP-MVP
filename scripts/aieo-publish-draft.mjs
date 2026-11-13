// Trusted, fail-closed publisher. It cannot merge, approve, or deploy.
// Call only after a manual main-branch dispatch and successful application gates.
import { readFileSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';
import { inspectModelReviewer } from '../aieo/lib/model-gates.mjs';
import { APPROVED_TASK, orchestrate } from '../aieo/lib/engine.mjs';
import { verifyRemoteDraft } from '../aieo/lib/remote-draft.mjs';

function command(binary, args) {
  return execFileSync(binary, args, { encoding: 'utf8', stdio: 'pipe' });
}
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
function identical(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function fail(message) {
  throw new Error('AIEO draft publisher blocked: ' + message);
}

export function validateDispatch(env) {
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_REPOSITORY !== 'jayalshehri/CGP-MVP' ||
      !env.GH_TOKEN ||
      !/^[0-9]+$/.test(env.GITHUB_RUN_ID || '') ||
      !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT || '')) {
    fail('requires a trusted manual dispatch on main and a repository-scoped token');
  }
  if (!['model', 'deterministic'].includes(env.AIEO_PUBLISH_MODE)) fail('invalid publishing mode');
  if (env.AIEO_PUBLISH_MODE === 'model' &&
      (env.AIEO_MODEL_ENABLED !== 'true' || env.AIEO_SOURCE_SHARING_APPROVED !== 'true')) {
    fail('model source sharing was not approved');
  }
  return env.AIEO_PUBLISH_MODE;
}

export function verifyCandidate({ mode, original, actual, changedPaths, diff, reports }) {
  if (!Array.isArray(changedPaths) || changedPaths.length !== 1 ||
      changedPaths[0] !== MODEL_ALLOWED_PATH || original === actual) {
    fail('candidate changes must affect exactly one allowlisted tracked file');
  }
  if (mode === 'model') {
    const { proposal, qa, security, reviewer } = reports;
    const recomputed = inspectModelReviewer({
      original, actual, changedPaths, diff, proposal, qa, security
    });
    if (recomputed.status !== 'draft-pr-eligible' ||
        recomputed.requiresHumanMerge !== true || !identical(reviewer, recomputed)) {
      fail('independent model reviewer verdict does not match candidate evidence');
    }
  } else if (mode === 'deterministic') {
    const observed = orchestrate({ task: APPROVED_TASK, source: original });
    if (observed.developer.status !== 'proposed' ||
        observed.developer.patchedSource !== actual ||
        observed.qa.status !== 'passed' || observed.security.status !== 'passed' ||
        observed.reviewer.status !== 'draft-pr-eligible' ||
        observed.reviewer.requiresHumanMerge !== true) {
      fail('deterministic source patch does not match the independently reproduced fix');
    }
  } else fail('unknown candidate mode');
  return true;
}

// GitHub's event ref alone does not establish the checked-out source commit.
// Reject a stale/mismatched checkout, concealed index flags, or a file mode/type
// change before creating a branch, pushing code, or contacting the GitHub CLI.
function assertTrustedCheckout(env, path) {
  const expectedSha = env.GITHUB_SHA || '';
  const checkedOutSha = command('git', ['rev-parse', '--verify', 'HEAD']).trim();
  if (!/^[a-f0-9]{40}$/.test(expectedSha) || checkedOutSha !== expectedSha) {
    fail('candidate checkout differs from the trusted workflow commit');
  }
  const entries = command('git', ['ls-files', '-v', '-z']).split('\0').filter(Boolean);
  if (!entries.length || entries.some((entry) => !entry.startsWith('H '))) {
    fail('hidden or special Git index flags in the trusted checkout');
  }
  const indexEntry = command('git', ['ls-files', '-s', '--', path]).trim();
  if (!/^100644 [a-f0-9]{40} 0\tcomponents\/FeedbackWidget\.tsx$/.test(indexEntry)) {
    fail('candidate must start from a regular, non-executable tracked file');
  }
  const file = lstatSync(path);
  // Reject hardlinked source aliases before any branch, push, or remote PR.
  if (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1 ||
      (file.mode & 0o111)) {
    fail('candidate must remain a regular, non-executable file');
  }
}

export function publishDraft({ env = process.env } = {}) {
  const mode = validateDispatch(env);
  const path = MODEL_ALLOWED_PATH;
  assertTrustedCheckout(env, path);
  // Refuse pre-staged changes, untracked files and whitespace errors before any write.
  if (command('git', ['diff', '--cached', '--name-only']).trim()) fail('unexpected staged files');
  if (command('git', ['ls-files', '--others', '--exclude-standard'])
      .split('\n').filter(Boolean).some((p) => p !== 'aieo-output' && !p.startsWith('aieo-output/'))) {
    fail('unexpected untracked repository files');
  }
  command('git', ['diff', '--check']);
  const original = command('git', ['show', 'HEAD:' + path]);
  const actual = readFileSync(path, 'utf8');
  const changedPaths = command('git', ['diff', '--name-only']).trim().split('\n').filter(Boolean);
  const diff = command('git', ['diff', '--unified=0', '--', path]);
  const reports = mode === 'model' ? {
    proposal: readJson('aieo-output/model-proposal.json'),
    qa: readJson('aieo-output/model-qa.json'),
    security: readJson('aieo-output/model-security.json'),
    reviewer: readJson('aieo-output/model-reviewer.json')
  } : {};
  verifyCandidate({ mode, original, actual, changedPaths, diff, reports });
  const baseSha = command('git', ['rev-parse', 'HEAD']).trim();
  const branch = 'aieo/' + (mode === 'model' ? 'model-proposal-' : 'repair-feedback-') +
    env.GITHUB_RUN_ID + '-' + env.GITHUB_RUN_ATTEMPT;
  command('git', ['config', 'user.name', 'github-actions[bot]']);
  command('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
  command('git', ['switch', '-c', branch]);
  command('git', ['add', '--', path]);
  if (command('git', ['diff', '--cached', '--name-only']).trim() !== path) fail('unexpected staged scope');
  command('git', ['commit', '-m', 'feat(aieo): bounded candidate for human review']);
  const candidateSha = command('git', ['rev-parse', 'HEAD']).trim();
  command('gh', ['auth', 'setup-git']);
  command('git', ['push', 'origin', 'HEAD:refs/heads/' + branch]);
  const body = 'Candidate scope, independent checks and build were verified before publishing. ' +
    'DRAFT only. No automatic approval, merge or production deployment.';
  const pr = command('gh', ['pr', 'create', '--draft', '--base', 'main', '--head', branch,
    '--title', 'AIEO: bounded ' + mode + ' proposal for review', '--body', body]).trim();
  // A printed URL is not proof: independently read back GitHub's exact Draft,
  // source/candidate commit OIDs, one-file scope, repository and official bot actor.
  // Failure stops downstream CI dispatch and success reporting; no auto-delete/merge.
  const attested = verifyRemoteDraft({ url: pr, branch, baseSha, candidateSha,
    path, gh: command });
  if (mode === 'model') {
    command('gh', ['workflow', 'run', 'cgp-required-ci.yml', '--ref', branch]);
    // GITHUB_TOKEN-created PRs do not fire pull_request workflows. Explicitly
    // dispatch four read-only independent jobs using trusted main-branch code.
    // Dispatch is NOT evidence of successful review, merge or production readiness.
    command('gh', ['workflow', 'run', 'aieo-model-candidate-roles.yml',
      '--ref', 'main', '-f', 'pr_number=' + attested.number]);
  }
  return { status: 'draft-pr-created', branch, pr: attested.url,
    independentRoles: mode === 'model' ? 'dispatched-not-proven' : 'not-applicable',
    requiresHumanMerge: true };
}

if (process.argv[1]?.endsWith('/aieo-publish-draft.mjs')) {
  // Never print source, model proposals, prompts or credentials.
  const result = publishDraft();
  console.log(JSON.stringify(result));
}
