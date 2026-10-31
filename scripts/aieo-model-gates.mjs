// Separate CLI processes perform candidate QA and reviewer recomputation.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';
import { inspectModelQa, inspectModelReviewer } from '../aieo/lib/model-gates.mjs';

// A repository/runner fsmonitor executable is independent of diff drivers and
// can run during index reads while this job carries the model provider secret.
// Force the built-in index scanner for every agent Git read.
const safeGit = (args) => execFileSync('git', ['-c', 'core.fsmonitor=false', ...args], { encoding: 'utf8' });

const role = process.argv[2];
if (!['qa', 'reviewer'].includes(role)) throw new Error('Expected qa or reviewer');
const original = safeGit(['show', 'HEAD:' + MODEL_ALLOWED_PATH]);
const actual = readFileSync(MODEL_ALLOWED_PATH, 'utf8');
// Independently calculate candidate scope and patch without executing any
// configured external diff/textconv command from the checkout or runner.
const changedPaths = safeGit(['diff', '--no-ext-diff', '--no-textconv', '--name-only']).trim().split('\n').filter(Boolean);
const diff = safeGit(['diff', '--no-ext-diff', '--no-textconv', '--unified=0', '--', MODEL_ALLOWED_PATH]);
const proposal = JSON.parse(readFileSync('aieo-output/model-proposal.json', 'utf8'));

const result = role === 'qa'
  ? inspectModelQa({ original, actual, changedPaths, report: proposal })
  : inspectModelReviewer({
      original, actual, changedPaths, diff, proposal,
      qa: JSON.parse(readFileSync('aieo-output/model-qa.json', 'utf8')),
      security: JSON.parse(readFileSync('aieo-output/model-security.json', 'utf8'))
    });
mkdirSync('aieo-output', { recursive: true });
writeFileSync('aieo-output/model-' + role + '.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ role, status: result.status, findings: result.findings.length, humanMergeOnly: true }));
if (result.status !== (role === 'qa' ? 'passed' : 'draft-pr-eligible')) process.exitCode = 1;
