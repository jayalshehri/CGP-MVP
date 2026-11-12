// Remote attestation after a write-authorized, human-approved Draft PR publish.
// Local Git success and a printed gh URL alone do not prove what GitHub created.
// Never infer approval, merge readiness, deployment, or model correctness from this.
const REPO = 'jayalshehri/CGP-MVP';
const SHA = /^[a-f0-9]{40}$/;
const PR_URL = /^https:\/\/github\.com\/jayalshehri\/CGP-MVP\/pull\/([1-9][0-9]*)$/;

function reject() {
  throw new Error('AIEO: remote Draft PR attestation failed');
}
function parseRemote(value) {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* Fail closed; never surface untrusted API body in logs. */ }
  reject();
}

// The caller must pass only the exact, locally verified source and candidate commit OIDs.
// gh uses the GitHub REST/GraphQL API, not untrusted model output or local PR claims.
export function verifyRemoteDraft({ url, branch, baseSha, candidateSha, path, gh }) {
  const match = typeof url === 'string' && PR_URL.exec(url);
  if (!match || !/^aieo\/(?:model-proposal|repair-feedback)-[0-9]+-[1-9][0-9]*$/.test(branch) ||
      !SHA.test(baseSha) || !SHA.test(candidateSha) ||
      baseSha === candidateSha || path !== 'components/FeedbackWidget.tsx' ||
      typeof gh !== 'function') reject();

  const expected = Number(match[1]);
  if (!Number.isSafeInteger(expected)) reject();

  const jsonFields = 'url,state,isDraft,baseRefName,headRefName,baseRefOid,headRefOid,headRepository,headRepositoryOwner,files';
  const view = parseRemote(gh('gh', ['pr', 'view', url, '--json', jsonFields]));
  if (view.url !== url || view.state !== 'OPEN' || view.isDraft !== true ||
      view.baseRefName !== 'main' || view.headRefName !== branch ||
      view.baseRefOid !== baseSha || view.headRefOid !== candidateSha ||
      view.headRepository?.nameWithOwner !== REPO ||
      view.headRepositoryOwner?.login !== 'jayalshehri' ||
      !Array.isArray(view.files) || view.files.length !== 1 ||
      view.files[0]?.path !== path) reject();

  // A GraphQL PR result alone does not prove who opened the remote PR.
  const actor = parseRemote(gh('gh', ['api', 'repos/' + REPO + '/pulls/' + expected,
    '--jq', '{number: .number, url: .html_url, login: .user.login, id: .user.id, type: .user.type}']));
  if (actor.number !== expected || actor.url !== url ||
      actor.login !== 'github-actions[bot]' || actor.id !== 41898282 ||
      actor.type !== 'Bot') reject();

  return { url, number: expected, isDraft: true };
}
