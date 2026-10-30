// Trusted, fail-closed publisher. It cannot merge, approve, or deploy.
// Call only after a manual main-branch dispatch and successful application gates.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';
import { inspectModelReviewer } from '../aieo/lib/model-gates.mjs';
import { APPROVED_TASK, orchestrate } from '../aieo/lib/engine.mjs';

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

// The PR URL alone cannot attest to the actual branch owner or exact code.
export function verifyRemoteDraft({ remote, url, branch, commitSha }) {
  const canonical = /^https:\/\/github\.com\/jayalshehri\/CGP-MVP\/pull\/([1-9]\d*)$/.exec(url);
  if (!canonical) fail('Draft PR creation did not return a canonical repository URL');
  if (!remote || !Number.isSafeInteger(remote.number) ||
      remote.number !== Number(canonical[1]) || remote.url !== url ||
      remote.isDraft !== true || remote.state !== 'OPEN' ||
      remote.baseRefName !== 'main' || remote.headRefName !== branch ||
      remote.headRefOid !== commitSha ||
      remote.headRepositoryOwner?.login !== 'jayalshehri' ||
      remote.isCrossRepository !== false) {
    fail('Remote PR is not a matching open Draft at the pushed commit');
  }
  return true;
}

// The event name and ref alone do not prove which code was checked out.
// Attest the runner's exact trusted event commit and the actual Git-resolved push target.
// A canonical remote.origin.url alone is insufficient: pushurl and url.* rewrites can redirect pushes.
// Git can push to multiple configured pushurls: require exactly one resolved destination.
// Do not echo origin URLs: a misconfigured origin can contain credentials.
export function verifyTrustedCheckout({ env, checkedOutSha, originUrl, effectivePushUrls }) {
  const trustedOrigins = new Set([
    'https://github.com/jayalshehri/CGP-MVP',
    'https://github.com/jayalshehri/CGP-MVP.git',
    'git@github.com:jayalshehri/CGP-MVP',
    'git@github.com:jayalshehri/CGP-MVP.git',
    'ssh://git@github.com/jayalshehri/CGP-MVP.git'
  ]);
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') ||
      checkedOutSha !== env.GITHUB_SHA || !trustedOrigins.has(originUrl) ||
      !Array.isArray(effectivePushUrls) || effectivePushUrls.length !== 1 ||
      !trustedOrigins.has(effectivePushUrls[0])) {
    fail('untrusted source checkout or Git push destination');
  }
  return true;
}

export function publishDraft({ env = process.env } = {}) {
  const mode = validateDispatch(env);
  verifyTrustedCheckout({
    env,
    checkedOutSha: command('git', ['rev-parse', 'HEAD']).trim(),
    originUrl: command('git', ['config', '--get', 'remote.origin.url']).trim(),
    effectivePushUrls: command('git', ['remote', 'get-url', '--push', '--all', 'origin'])
      .trim().split('\n').filter(Boolean)
  });
  const path = MODEL_ALLOWED_PATH;
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
  const branch = 'aieo/' + (mode === 'model' ? 'model-proposal-' : 'repair-feedback-') +
    env.GITHUB_RUN_ID + '-' + env.GITHUB_RUN_ATTEMPT;
  command('git', ['config', 'user.name', 'github-actions[bot]']);
  command('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
  command('git', ['switch', '-c', branch]);
  command('git', ['add', '--', path]);
  if (command('git', ['diff', '--cached', '--name-only']).trim() !== path) fail('unexpected staged scope');
  command('git', ['commit', '-m', 'feat(aieo): bounded candidate for human review']);
  command('gh', ['auth', 'setup-git']);
  command('git', ['push', 'origin', 'HEAD:refs/heads/' + branch]);
  const committedSha = command('git', ['rev-parse', 'HEAD']).trim();
  const pushedRef = command('git', ['ls-remote', 'origin', 'refs/heads/' + branch]).trim();
  if (pushedRef !== committedSha + '\trefs/heads/' + branch) {
    fail('Remote branch does not point to the reviewed commit');
  }
  const body = 'Candidate scope, independent checks and build were verified before publishing. ' +
    'DRAFT only. No automatic approval, merge or production deployment.';
  const pr = command('gh', ['pr', 'create', '--draft', '--base', 'main', '--head', branch,
    '--title', 'AIEO: bounded ' + mode + ' proposal for review', '--body', body]).trim();
  // A zero exit from gh is not proof that a new PR is actually Draft. Verify
  // the remote PR's identity and protection-relevant fields before reporting
  // success or dispatching any follow-up CI. Never fall back to a ready PR.
  let remote;
  try {
    remote = JSON.parse(command('gh', [
      'pr', 'view', pr, '--repo', env.GITHUB_REPOSITORY,
      '--json', 'number,url,isDraft,state,baseRefName,headRefName,headRefOid,headRepositoryOwner,isCrossRepository'
    ]));
  } catch {
    fail('Created PR could not be independently verified');
  }
  verifyRemoteDraft({ remote, url: pr, branch, commitSha: committedSha });
  if (mode === 'model') command('gh', ['workflow', 'run', 'cgp-required-ci.yml', '--ref', branch]);
  return { status: 'draft-pr-created', branch, pr, requiresHumanMerge: true };
}

if (process.argv[1]?.endsWith('/aieo-publish-draft.mjs')) {
  // Never print source, model proposals, prompts or credentials.
  const result = publishDraft();
  console.log(JSON.stringify(result));
}
