// Read-only preflight BEFORE any external model source sharing or Draft PR write.
// Both workflow registration and independent role implementations must exist on
// the exact trusted main commit. A stacked Draft branch is NOT a deployable
// workflow_dispatch target. No application source or secrets are read here.
import { execFileSync } from 'node:child_process';
import { hasUnsafeGitEnvironment, pinReadOnlyGitHubCli, readOnlyGitHubCliEnvironment } from './aieo-git-process-guard.mjs';
import { verifyCandidateActionsContext, verifyOfficialGitHubCliContext } from './aieo-candidate-role.mjs';

const REPO = 'jayalshehri/CGP-MVP';
const WORKFLOW = '.github/workflows/aieo-model-candidate-roles.yml';
// The file path alone cannot attest that trusted main contains the reviewed
// independent-role implementation. Pin the exact Git blob identities of the
// candidate review bundle. Any intentional update must explicitly refresh
// these identities in a reviewed change before source disclosure is enabled.
export const EXPECTED_ROLE_BLOBS = Object.freeze({
  ".github/workflows/aieo-model-candidate-roles.yml": "c9091860f10bffaa4d9b1ca34dd860c4bc260f7d",
  "scripts/aieo-candidate-role.mjs": "7d4d200593f3c711c15723d57088de563b2e990f",
  "scripts/aieo-candidate-finalize.mjs": "75d0e44ceaa69aa67dac234c467b098c2b9895d5",
  "scripts/aieo-candidate-replay.mjs": "c8cba0182a0c7395708aa36b86033e48b3389e24",
  "scripts/aieo-role-artifact-io.mjs": "ae3576d971ded1bb30ace51f3f9e28e940a66c9f",
  "scripts/aieo-model-security.mjs": "e7b2f5c2b81d9afd2b4655f083d5134c12a97709",
  "aieo/lib/model-gates.mjs": "fbd42c7552a2cec523b68edd6005cd531640ff65",
  "aieo/lib/model-provider.mjs": "0e0347d1ba9017dfd58cb14dab27f9662d72a579",
  "scripts/aieo-import-handoffs.mjs": "dc6bb2930e2d4651e513d8ae948dfcefe4c7ff5a",
  "scripts/aieo-git-process-guard.mjs": "998149ab4b0abf033ef1998e9371eb7e26ebb91d",
  "scripts/aieo-model-candidate-read.mjs": "a242c018428877a99fc7595ac5cc1a02027815df",
  "scripts/aieo-model-git.mjs": "32c6b73ae1c111524b6df8397f409c7198a0c1d6",
  "aieo/lib/outbound-tag-guard.mjs": "27518bbbc4a15abe21f54cda7f6cf806d9d98ccc"
});
const REQUIRED = Object.keys(EXPECTED_ROLE_BLOBS);
const SHA = /^[a-f0-9]{40}$/;
const failure = () => { throw Error('AIEO blocked: trusted main reviewer workflow is not ready'); };
function parseJson(value) {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* Fail closed without logging remote output. */ }
  failure();
}
// The readiness check holds GH_TOKEN before external source disclosure. Pin the
// real CLI once for the entire preflight and pass only the read-only GitHub
// credential and minimal OS environment to its subprocesses.
function liveGithub(args, executable) {
  return execFileSync(executable, args, {
    encoding: 'utf8', stdio: 'pipe', maxBuffer: 32000,
    env: readOnlyGitHubCliEnvironment(process.env)
  });
}

export function verifyTrustedReviewReadiness({ env = process.env, gh = liveGithub } = {}) {
  const sha = env.GITHUB_SHA;
  // This preflight runs while GH_TOKEN is available and BEFORE model source
  // disclosure. Check both the real process environment and any supplied
  // context before the FIRST gh subprocess. An injected fixture must not
  // conceal live credentials or redirect the CLI to another host/repository.
  try {
    if (hasUnsafeGitEnvironment(process.env) ||
        hasUnsafeGitEnvironment(env)) failure();
    verifyOfficialGitHubCliContext(process.env);
    verifyOfficialGitHubCliContext(env);
    const offlineFixture = verifyCandidateActionsContext(env);
    if (offlineFixture ? gh === liveGithub :
        process.env.GITHUB_ACTIONS !== 'true') failure();
  } catch { failure(); }
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_REPOSITORY !== REPO ||
      !SHA.test(sha || '') || !env.GH_TOKEN ||
      typeof gh !== 'function') failure();
  let query = gh;
  try {
    if (gh === liveGithub) {
      const executable = pinReadOnlyGitHubCli(process.env);
      query = (args) => liveGithub(args, executable);
    }
  } catch { failure(); }
  try {
    const ref = parseJson(query(['api', 'repos/' + REPO + '/git/ref/heads/main',
      '--jq', '{sha:.object.sha,type:.object.type}']));
    if (ref.sha !== sha || ref.type !== 'commit') failure();

    // A file checked into a Draft branch is insufficient: Actions must know
    // this workflow as an ACTIVE workflow on the default branch.
    const registered = parseJson(query(['api', 'repos/' + REPO +
      '/actions/workflows/aieo-model-candidate-roles.yml',
      '--jq', '{path:.path,state:.state}']));
    if (registered.path !== WORKFLOW || registered.state !== 'active') failure();

    // Pin every required role implementation to the very same main commit AND
    // expected reviewed blob. A different implementation at the same path
    // must not borrow external-source disclosure approval.
    // Query metadata only: neither file contents nor model prompts are emitted.
    for (const path of REQUIRED) {
      const item = parseJson(query(['api', 'repos/' + REPO + '/contents/' +
        path + '?ref=' + sha, '--jq', '{path:.path,type:.type,sha:.sha}']));
      if (item.path !== path || item.type !== 'file' ||
          item.sha !== EXPECTED_ROLE_BLOBS[path]) failure();
    }

    // Recheck main after all remote metadata reads. Otherwise main can advance
    // between the first ref read and source disclosure, leaving the provider
    // using a workflow commit that is no longer the trusted default-branch tip.
    // The same pinned CLI and scoped token are used for this final read.
    const finalRef = parseJson(query(['api', 'repos/' + REPO + '/git/ref/heads/main',
      '--jq', '{sha:.object.sha,type:.object.type}']));
    if (finalRef.sha !== sha || finalRef.type !== 'commit') failure();
  } catch { failure(); }
  // This proves only the registered reviewer workflow and its exact trusted
  // blobs. It is NOT evidence of a live provider proposal, a bot-created
  // model Draft PR, or an independently reviewed real model candidate.
  return {
    status: 'ready',
    scope: 'trusted-reviewer-registration-and-blobs-only',
    endToEndProven: false,
    verifiedMainCommit: sha,
    roleFiles: REQUIRED.length
  };
}

if (process.argv[1]?.endsWith('/aieo-review-readiness.mjs')) {
  const result = verifyTrustedReviewReadiness();
  console.log('AIEO trusted reviewer preflight: ' + result.status);
}
