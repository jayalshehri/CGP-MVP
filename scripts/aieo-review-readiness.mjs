// Read-only preflight BEFORE any external model source sharing or Draft PR write.
// Both workflow registration and independent role implementations must exist on
// the exact trusted main commit. A stacked Draft branch is NOT a deployable
// workflow_dispatch target. No application source or secrets are read here.
import { execFileSync } from 'node:child_process';

const REPO = 'jayalshehri/CGP-MVP';
const WORKFLOW = '.github/workflows/aieo-model-candidate-roles.yml';
const REQUIRED = [
  WORKFLOW,
  'scripts/aieo-candidate-role.mjs',
  'scripts/aieo-candidate-finalize.mjs',
  'scripts/aieo-candidate-replay.mjs',
  'scripts/aieo-role-artifact-io.mjs',
  'scripts/aieo-model-security.mjs',
  'aieo/lib/model-gates.mjs',
  'aieo/lib/model-provider.mjs'
];
const SHA = /^[a-f0-9]{40}$/;
const failure = () => { throw Error('AIEO blocked: trusted main reviewer workflow is not ready'); };
function parseJson(value) {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* Fail closed without logging remote output. */ }
  failure();
}
function liveGithub(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: 'pipe', maxBuffer: 32000 });
}

export function verifyTrustedReviewReadiness({ env = process.env, gh = liveGithub } = {}) {
  const sha = env.GITHUB_SHA;
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_REPOSITORY !== REPO ||
      !SHA.test(sha || '') || !env.GH_TOKEN ||
      typeof gh !== 'function') failure();
  try {
    const ref = parseJson(gh(['api', 'repos/' + REPO + '/git/ref/heads/main',
      '--jq', '{sha:.object.sha,type:.object.type}']));
    if (ref.sha !== sha || ref.type !== 'commit') failure();

    // A file checked into a Draft branch is insufficient: Actions must know
    // this workflow as an ACTIVE workflow on the default branch.
    const registered = parseJson(gh(['api', 'repos/' + REPO +
      '/actions/workflows/aieo-model-candidate-roles.yml',
      '--jq', '{path:.path,state:.state}']));
    if (registered.path !== WORKFLOW || registered.state !== 'active') failure();

    // Pin every required role implementation to the very same main commit.
    // Query metadata only: neither file contents nor model prompts are emitted.
    for (const path of REQUIRED) {
      const item = parseJson(gh(['api', 'repos/' + REPO + '/contents/' +
        path + '?ref=' + sha, '--jq', '{path:.path,type:.type}']));
      if (item.path !== path || item.type !== 'file') failure();
    }
  } catch { failure(); }
  return { status: 'ready', verifiedMainCommit: sha, roleFiles: REQUIRED.length };
}

if (process.argv[1]?.endsWith('/aieo-review-readiness.mjs')) {
  const result = verifyTrustedReviewReadiness();
  console.log('AIEO trusted reviewer preflight: ' + result.status);
}
