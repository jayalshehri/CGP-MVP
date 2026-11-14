// Separate CLI processes perform candidate QA and reviewer recomputation.
import { readFileSync } from 'node:fs';
import { readBoundedModelReport, writeExclusiveModelRoleReport } from './aieo-role-artifact-io.mjs';
import { execFileSync } from 'node:child_process';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';
import { inspectModelQa, inspectModelReviewer } from '../aieo/lib/model-gates.mjs';

const role = process.argv[2];
if (!['qa', 'reviewer'].includes(role)) throw new Error('Expected qa or reviewer');
const original = execFileSync('git', ['show', 'HEAD:' + MODEL_ALLOWED_PATH], { encoding: 'utf8' });
const actual = readFileSync(MODEL_ALLOWED_PATH, 'utf8');
const changedPaths = execFileSync('git', ['diff', '--name-only'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const diff = execFileSync('git', ['diff', '--unified=0', '--', MODEL_ALLOWED_PATH], { encoding: 'utf8' });
const proposal = readBoundedModelReport('proposal');

const result = role === 'qa'
  ? inspectModelQa({ original, actual, changedPaths, report: proposal })
  : inspectModelReviewer({
      original, actual, changedPaths, diff, proposal,
      qa: readBoundedModelReport('qa'),
      security: readBoundedModelReport('security')
    });
writeExclusiveModelRoleReport(role, result);
console.log(JSON.stringify({ role, status: result.status, findings: result.findings.length, humanMergeOnly: true }));
if (result.status !== (role === 'qa' ? 'passed' : 'draft-pr-eligible')) process.exitCode = 1;
