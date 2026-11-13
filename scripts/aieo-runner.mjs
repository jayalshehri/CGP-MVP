// Safe orchestrator CLI: defaults to read-only. Applying requires trusted manual workflow.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { APPROVED_PATH, APPROVED_TASK, orchestrate, publicReport } from '../aieo/lib/engine.mjs';

const task = process.env.AIEO_TASK || APPROVED_TASK;
const source = readFileSync(APPROVED_PATH, 'utf8');
const results = orchestrate({ task, source });
const report = publicReport(results);

mkdirSync('aieo-output', { recursive: true });
writeFileSync('aieo-output/multi-agent-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({
  developer: report.developer.status, qa: report.qa.status,
  security: report.security.status, reviewer: report.reviewer.status,
  readOnly: process.env.AIEO_APPLY !== '1'
}));

if (report.reviewer.status === 'blocked') process.exitCode = 1;
if (process.env.AIEO_APPLY === '1') {
  if (process.env.AIEO_TRUSTED_WORKFLOW !== '1' ||
      process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      process.env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('Applying requires trusted manual main-branch workflow');
  }
  if (report.reviewer.status === 'draft-pr-eligible') {
    writeFileSync(APPROVED_PATH, results.developer.patchedSource);
    console.log('Bounded patch written to workspace; not committed, merged, or deployed');
  } else {
    console.log('No approved source changes to apply');
  }
}
