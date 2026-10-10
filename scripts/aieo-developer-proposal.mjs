import fs from 'node:fs/promises';

const source = process.env.AIEO_INPUT || 'scripts/aieo-developer-fixture.json';
let data;
if (process.env.AIEO_SOURCE === 'github') {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!token || !/^[-\w]+\/[-\w.]+$/.test(repo || '')) throw new Error('Missing GitHub read-only context');
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const url = new URL('https://api.github.com/repos/' + repo + '/actions/runs');
  url.searchParams.set('branch', process.env.AIEO_TARGET_BRANCH || 'aieo/phase3-openai-integration');
  url.searchParams.set('per_page', '10');
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error('GitHub runs HTTP ' + response.status);
  const runs = (await response.json()).workflow_runs || [];
  const run = runs.find(x => x.name === 'AIEO CI Foundation' && x.status === 'completed');
  if (!run) throw new Error('No completed CI Foundation run found');
  const jobsResponse = await fetch('https://api.github.com/repos/' + repo + '/actions/runs/' + run.id + '/jobs?per_page=30', { headers });
  if (!jobsResponse.ok) throw new Error('GitHub jobs HTTP ' + jobsResponse.status);
  data = { jobs: (await jobsResponse.json()).jobs || [] };
  console.log('Analyzed completed CI run ' + run.id + ' (job conclusions only).');
} else {
  data = JSON.parse(await fs.readFile(source, 'utf8'));
}
if (!Array.isArray(data.jobs) || data.jobs.length > 30) throw new Error('Invalid job summary');
const jobs = data.jobs.map(job => ({
  name: String(job.name || 'unknown').replace(/[^a-zA-Z0-9 _./-]/g, '').slice(0, 80),
  conclusion: ['success','failure','cancelled','skipped','neutral','timed_out'].includes(job.conclusion) ? job.conclusion : 'unknown'
}));
const failures = jobs.filter(job => !['success','neutral','skipped'].includes(job.conclusion));
const report = [
  '# AIEO Developer Agent — remediation proposal',
  '',
  'Mode: read-only, deterministic prototype. No source code or logs inspected.',
  'No root cause or patch can be verified from job conclusions alone.',
  '',
  '## CI observations',
  ...jobs.map(job => '- ' + job.name + ': ' + job.conclusion),
  '',
  '## Proposed next steps',
  ...(failures.length ? failures.map(job => '- Inspect sanitized failure details for ' + job.name + ', reproduce in QA, write a regression test, then prepare a scoped patch for human review.') : ['- No failed jobs detected; do not propose a code change.']),
  '',
  '## Mandatory gates',
  '- Verify QA environment and test data isolation.',
  '- Do not access production secrets or execute database migrations.',
  '- Run lint, typecheck, build and targeted regression tests before any draft PR.',
  '- Human approval required for merge or deployment.',
  ''
];
await fs.mkdir('aieo-reports', {recursive:true});
await fs.writeFile('aieo-reports/developer-proposal.md', report.join('\n'));
console.log('Read-only developer proposal created.');
