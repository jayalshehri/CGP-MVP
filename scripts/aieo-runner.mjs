// Safe orchestrator CLI: defaults to read-only. Applying requires trusted manual workflow.
import { writeFileSync, mkdirSync, lstatSync, fstatSync, openSync, closeSync, realpathSync, constants } from 'node:fs';
import { resolve } from 'node:path';
import { APPROVED_PATH, APPROVED_TASK, orchestrate, publicReport } from '../aieo/lib/engine.mjs';
import { readApprovedSource } from '../aieo/lib/safe-source.mjs';

const task = process.env.AIEO_TASK || APPROVED_TASK;
const source = readApprovedSource();
const results = orchestrate({ task, source });
const report = publicReport(results);

// The read-only orchestrator runs before the isolated agents. Its diagnostic
// report must never follow a checked-out/downloaded link or overwrite a file.
// Use the same exclusive and no-follow destination policy as role verdicts.
function writeReportExclusive(result) {
  const folder = 'aieo-output';
  mkdirSync(folder, { recursive: true });
  const directory = lstatSync(folder);
  if (!directory.isDirectory() || directory.isSymbolicLink() ||
      realpathSync(folder) !== resolve(folder)) {
    throw new Error('Unsafe AIEO orchestrator output directory');
  }
  let fd;
  try {
    fd = openSync(folder + '/multi-agent-report.json',
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600);
  } catch {
    throw new Error('AIEO orchestrator report already exists or destination is unsafe');
  }
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1) {
      throw new Error('Unsafe opened AIEO orchestrator report');
    }
    writeFileSync(fd, JSON.stringify(result, null, 2) + '\n');
  } finally {
    closeSync(fd);
  }
}
writeReportExclusive(report);
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
