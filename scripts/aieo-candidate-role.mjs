// Read-only, independent review of an already-created model Draft PR.
// This runs trusted base-branch scripts against Git objects, never untrusted PR code.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';
import { inspectModelQa, inspectModelReviewer } from '../aieo/lib/model-gates.mjs';
import { inspectModelDiff } from './aieo-model-security.mjs';

const SHA = /^[a-f0-9]{40}$/;
const BRANCH = /^aieo\/model-proposal-[0-9]+-[1-9][0-9]*$/;
const REPO = 'jayalshehri/CGP-MVP';
const ROLES = ['developer', 'qa', 'security', 'reviewer'];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function block() {
  throw new Error('AIEO candidate role blocked: unverified Draft PR or candidate evidence');
}
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: 'pipe' });
}
function readReport(role) {
  try {
    return JSON.parse(readFileSync('aieo-output/candidate-' + role + '.json', 'utf8'));
  } catch { block(); }
}
function verifyEvent(env) {
  const { AIEO_BASE_SHA: base, AIEO_HEAD_SHA: head } = env;
  if (env.GITHUB_EVENT_NAME !== 'pull_request' ||
      env.AIEO_REPOSITORY !== REPO || env.AIEO_HEAD_REPOSITORY !== REPO ||
      env.AIEO_PR_AUTHOR !== 'github-actions[bot]' ||
      env.AIEO_PR_AUTHOR_ID !== '41898282' ||
      env.AIEO_PR_STATE !== 'open' || env.AIEO_PR_DRAFT !== 'true' ||
      !BRANCH.test(env.AIEO_HEAD_REF || '') ||
      !SHA.test(base || '') || !SHA.test(head || '') || base === head) block();
  // The candidate must descend from the exact PR base commit. No automatic merges.
  try { git(['merge-base', '--is-ancestor', base, head]); }
  catch { block(); }
  return { base, head };
}

export function runCandidateRole(role, env = process.env) {
  if (!ROLES.includes(role)) block();
  const { base, head } = verifyEvent(env);
  let original, actual, changedPaths, diff;
  try {
    original = git(['show', base + ':' + MODEL_ALLOWED_PATH]);
    actual = git(['show', head + ':' + MODEL_ALLOWED_PATH]);
    changedPaths = git(['diff', '--no-ext-diff', '--name-only', base, head])
      .trim().split('\n').filter(Boolean);
    diff = git(['diff', '--no-ext-diff', '--unified=0', base, head, '--', MODEL_ALLOWED_PATH]);
  } catch { block(); }
  if (changedPaths.length !== 1 || changedPaths[0] !== MODEL_ALLOWED_PATH ||
      original === actual || !diff || diff.length > 20000) block();

  const developer = {
    schemaVersion: 1, role: 'developer', status: 'proposed', path: MODEL_ALLOWED_PATH,
    baseSha: base, headSha: head, sourceHash: hash(original),
    proposedHash: hash(actual), diffHash: hash(diff),
    changedPaths
  };
  let report;
  if (role === 'developer') {
    report = developer;
  } else {
    if (!equal(readReport('developer'), developer)) block();
    if (role === 'qa') {
      report = inspectModelQa({ original, actual, changedPaths, report: developer });
      if (report.status !== 'passed') block();
    } else if (role === 'security') {
      report = inspectModelDiff({ original, actual, changedPaths, diff, report: developer });
      if (report.status !== 'passed') block();
    } else {
      const qa = readReport('qa');
      const security = readReport('security');
      report = inspectModelReviewer({
        original, actual, changedPaths, diff, proposal: developer, qa, security
      });
      if (report.status !== 'draft-pr-eligible') block();
    }
  }
  mkdirSync('aieo-output', { recursive: true });
  writeFileSync('aieo-output/candidate-' + role + '.json', JSON.stringify(report, null, 2) + '\n');
  return { role, status: report.status, baseSha: base, headSha: head };
}

if (process.argv[1]?.endsWith('/aieo-candidate-role.mjs')) {
  const outcome = runCandidateRole(process.argv[2]);
  // No source, provider response, environment variables or secrets in logs.
  console.log(JSON.stringify(outcome));
}
