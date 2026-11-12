// Read-only policy checks for the synthetic-only GitHub Actions Draft PR pilot.
// These assertions do NOT claim a real bot PR was created; the protected manual
// workflow still requires independent human activation and a live run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(
  new URL('../.github/workflows/aieo-synthetic-draft-pr-pilot.yml', import.meta.url),
  'utf8'
);
const preflight = workflow.split('\n  synthetic-preflight:\n')[1]?.split('\n  publish-draft:\n')[0];
const publisher = workflow.split('\n  publish-draft:\n')[1];

test('only a deliberate main-branch manual opt-in enables the pilot', () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|pull_request_target|schedule):/m);
  assert.match(workflow, /approve_synthetic_pr:[\s\S]*?default: false/);
  assert.match(workflow, /\npermissions:\n  contents: read\n/);
  assert.ok(preflight && publisher, 'both preflight and protected publisher jobs must exist');
  assert.match(preflight, /if: github\.ref == 'refs\/heads\/main' && inputs\.approve_synthetic_pr == true/);
  assert.match(preflight, /GITHUB_EVENT_NAME.*workflow_dispatch/);
  assert.match(preflight, /GITHUB_REPOSITORY.*jayalshehri\/CGP-MVP/);
});

test('only the approved, environment-protected job receives write permission', () => {
  assert.doesNotMatch(preflight, /(?:contents|pull-requests|actions|id-token): write/);
  assert.match(publisher, /needs: synthetic-preflight/);
  assert.match(publisher, /environment: aieo-ai/);
  assert.match(publisher, /permissions:\n      contents: write\n      pull-requests: write/);
  assert.match(publisher, /persist-credentials: false/);
  assert.match(publisher, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(publisher, /test "\$GITHUB_REF" = 'refs\/heads\/main'/);
  assert.match(publisher, /GITHUB_EVENT_NAME.*workflow_dispatch/);
  assert.match(publisher, /GITHUB_REPOSITORY.*jayalshehri\/CGP-MVP/);
  assert.doesNotMatch(workflow, /secrets\.|OPENROUTER_API_KEY|approve_external_source_sharing/);
});

test('a re-run gets its own bounded synthetic evidence branch and no app file changes', () => {
  assert.match(publisher, /GITHUB_RUN_ID.*\^\[0-9\]\+\$/);
  assert.match(publisher, /GITHUB_RUN_ATTEMPT.*\^\[0-9\]\+\$/);
  assert.match(publisher, /branch="aieo\/synthetic-draft-proof-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/);
  assert.match(publisher, /evidence="docs\/aieo-evidence\/synthetic-pr-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}\.md"/);
  assert.match(publisher, /test "\$\(git diff --cached --name-only\)" = "\$evidence"/);
  assert.match(publisher, /git diff --cached --check/);
  assert.match(publisher, /gh pr create --repo "\$GITHUB_REPOSITORY" --draft --base main --head "\$branch"/);
  assert.doesNotMatch(publisher, /^\s*(?:gh pr merge|git push origin main|vercel deploy|npm run deploy)\b/m);
});

test('the publisher fails closed until GitHub confirms draft state and exact remote scope', () => {
  assert.match(publisher, /pr_url="\$\(gh pr create/);
  assert.match(publisher, /gh pr view "\$pr_url" --repo "\$GITHUB_REPOSITORY" --json isDraft,baseRefName,headRefName,files/);
  assert.match(publisher, /jq -e --arg branch "\$branch" --arg evidence "\$evidence"/);
  for (const clause of [
    '.isDraft == true',
    '.baseRefName == "main"',
    '.headRefName == $branch',
    '(.files | length) == 1',
    '.files[0].path == $evidence'
  ]) assert.ok(publisher.includes(clause), 'missing remote attestation: ' + clause);
});
