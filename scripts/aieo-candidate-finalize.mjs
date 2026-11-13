// Read-only final checkpoint AFTER the independent Reviewer and candidate build.
// An earlier approved PR head is not proof that the remote Draft stayed unchanged
// throughout npm install, lint, typecheck and build. No merge/publish/approval.
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';
import { inspectModelQa, inspectModelReviewer } from '../aieo/lib/model-gates.mjs';
import { inspectModelDiff } from './aieo-model-security.mjs';

const REPO = 'jayalshehri/CGP-MVP';
const SHA = /^[a-f0-9]{40}$/;
const BRANCH = /^aieo\/model-proposal-[0-9]+-[1-9][0-9]*$/;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const fail = () => { throw new Error('AIEO post-build check blocked: candidate or remote Draft changed'); };
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: 'pipe', maxBuffer: 256000 });
const gitTrim = (...args) => git(...args).trim();

function report(role) {
  try { return JSON.parse(readFileSync('aieo-output/candidate-' + role + '.json', 'utf8')); }
  catch { fail(); }
}

export function verifyPostBuild(env = process.env) {
  const number = env.AIEO_PR_NUMBER;
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_REPOSITORY !== REPO ||
      !SHA.test(env.GITHUB_SHA || '') ||
      !/^[1-9][0-9]*$/.test(number || '') || !env.GH_TOKEN) fail();

  const path = MODEL_ALLOWED_PATH;
  const developer = report('developer');
  const qa = report('qa');
  const security = report('security');
  const reviewer = report('reviewer');
  const base = env.GITHUB_SHA;
  const head = developer.headSha;

  if (!SHA.test(head || '') || head === base ||
      gitTrim('rev-parse', 'HEAD') !== base ||
      gitTrim('diff', '--cached', '--name-only') !== '' ||
      gitTrim('diff', '--name-only') !== path ||
      developer.baseSha !== base || developer.prNumber !== Number(number)) fail();

  // Re-check the trusted index AFTER dependency installation and build. Git
  // diff/status can hide modified tracked files behind assume-unchanged or
  // skip-worktree flags, including files other than the approved candidate.
  // A normal non-sparse Actions checkout must keep every entry visible.
  const indexEntries = git('ls-files', '-v', '-z').split('\0').filter(Boolean);
  if (!indexEntries.length || indexEntries.some((entry) => !entry.startsWith('H '))) fail();
  // The build must compile exactly the previously reviewed immutable blob.
  const file = lstatSync(path);
  if (!file.isFile() || file.isSymbolicLink() || (file.mode & 0o111)) fail();
  const original = git('show', base + ':' + path);
  const actual = git('show', head + ':' + path);
  const worktree = readFileSync(path, 'utf8');
  const changedPaths = gitTrim('diff', '--no-ext-diff', '--name-only', base, head)
    .split('\n').filter(Boolean);
  const diff = git('diff', '--no-ext-diff', '--unified=0', base, head, '--', path);
  if (changedPaths.length !== 1 || changedPaths[0] !== path ||
      worktree !== actual || original === actual || diff.length > 20000 ||
      gitTrim('rev-list', '--parents', '-n', '1', head) !== head + ' ' + base) fail();

  const expectedDeveloper = {
    schemaVersion: 1, role: 'developer', status: 'proposed', path,
    prNumber: Number(number), baseSha: base, headSha: head,
    sourceHash: hash(original), proposedHash: hash(actual),
    diffHash: hash(diff), changedPaths
  };
  if (!equal(developer, expectedDeveloper)) fail();
  const expectedQa = inspectModelQa({
    original, actual, changedPaths, report: expectedDeveloper
  });
  const expectedSecurity = inspectModelDiff({
    original, actual, changedPaths, diff, report: expectedDeveloper
  });
  const expectedReviewer = inspectModelReviewer({
    original, actual, changedPaths, diff, proposal: expectedDeveloper,
    qa: expectedQa, security: expectedSecurity
  });
  if (expectedQa.status !== 'passed' || expectedSecurity.status !== 'passed' ||
      expectedReviewer.status !== 'draft-pr-eligible' ||
      expectedReviewer.requiresHumanMerge !== true ||
      !equal(qa, expectedQa) || !equal(security, expectedSecurity) ||
      !equal(reviewer, expectedReviewer)) fail();

  // Re-read GitHub LAST: a force-pushed, closed, merged or un-drafted PR must
  // invalidate earlier artifacts even when the local reviewed commit still exists.
  let pr;
  try {
    pr = JSON.parse(execFileSync('gh', ['api', 'repos/' + REPO + '/pulls/' + number],
      { encoding: 'utf8', stdio: 'pipe', maxBuffer: 256000 }));
  } catch { fail(); }
  if (pr.number !== Number(number) ||
      pr.html_url !== 'https://github.com/' + REPO + '/pull/' + number ||
      pr.state !== 'open' || pr.draft !== true || pr.merged_at != null ||
      pr.user?.login !== 'github-actions[bot]' || pr.user?.id !== 41898282 ||
      pr.user?.type !== 'Bot' ||
      pr.base?.ref !== 'main' || pr.base?.sha !== base ||
      pr.base?.repo?.full_name !== REPO ||
      pr.head?.repo?.full_name !== REPO ||
      !BRANCH.test(pr.head?.ref || '') || pr.head?.sha !== head) fail();

  return { status: 'post-build-draft-reverified', prNumber: Number(number),
    baseSha: base, headSha: head, requiresHumanMerge: true };
}

if (process.argv[1]?.endsWith('/aieo-candidate-finalize.mjs')) {
  console.log(JSON.stringify(verifyPostBuild()));
}
