import fs from 'node:fs/promises';

const source = process.env.AIEO_INPUT || 'scripts/aieo-developer-fixture.json';
const data = JSON.parse(await fs.readFile(source, 'utf8'));
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
