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
// Independent scope attestation must cover unstaged, staged AND non-ignored
// untracked files. Plain "git diff --name-only" silently omits the latter two.
// Only aieo-output is an allowed untracked artifact directory, never source.
const gitPaths = (args) => safeGit(args).split('\0').filter(Boolean);
const tracked = gitPaths(['diff', '--no-ext-diff', '--no-textconv', '--name-only', '-z']);
const staged = gitPaths(['diff', '--no-ext-diff', '--no-textconv', '--cached', '--name-only', '-z']);
const untracked = gitPaths(['ls-files', '--others', '--exclude-standard', '-z'])
  .filter((path) => !path.startsWith('aieo-output/'));
const changedPaths = [...new Set([...tracked, ...staged, ...untracked])].sort();
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
