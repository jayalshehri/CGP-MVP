// Separate CLI processes perform candidate QA and reviewer recomputation.
import { readVerifiedModelCandidate } from './aieo-model-candidate-read.mjs';
import { readBoundedModelReport, writeExclusiveModelRoleReport } from './aieo-role-artifact-io.mjs';
import { modelGit, preflightModelGit } from './aieo-model-git.mjs';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';
import { inspectModelQa, inspectModelReviewer } from '../aieo/lib/model-gates.mjs';

const role = process.argv[2];
if (!['qa', 'reviewer'].includes(role)) throw new Error('Expected qa or reviewer');
preflightModelGit();
const original = modelGit(['show', 'HEAD:' + MODEL_ALLOWED_PATH]);
const actual = readVerifiedModelCandidate();
const changedPaths = modelGit(['diff', '--name-only']).trim().split('\n').filter(Boolean);
const diff = modelGit(['diff', '--unified=0', '--', MODEL_ALLOWED_PATH]);
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
