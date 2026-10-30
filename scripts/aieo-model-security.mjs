// Independent review of a model-generated working tree against the prior HEAD.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';

const hash = (content) => createHash('sha256').update(content).digest('hex');
const suspect = /\b(?:eval|Function|child_process|process\.env|XMLHttpRequest|fetch)\s*(?:\(|\.)|gh[pousr]_[a-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i;

export function inspectModelDiff({ original, actual, changedPaths, diff, report }) {
  const findings = [];
  if (changedPaths.length !== 1 || changedPaths[0] !== MODEL_ALLOWED_PATH) findings.push('Unapproved file changes');
  if (typeof original !== 'string' || typeof actual !== 'string' || original === actual) findings.push('No reviewable source change');
  if (report?.status !== 'proposed' || report.sourceHash !== hash(original) || report.proposedHash !== hash(actual)) {
    findings.push('Model hash or proposal status mismatch');
  }
  if (typeof diff !== 'string' || diff.length > 20000) findings.push('Invalid or oversized source delta');
  const additions = typeof diff === 'string' ? diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).map((line) => line.slice(1)) : [];
  if (additions.length > 20) findings.push('Too many new code lines');
  if (additions.some((line) => suspect.test(line))) findings.push('Potentially unsafe new code');
  return { status: findings.length ? 'failed' : 'passed', findings, addedLines: additions.length };
}

if (process.argv[1]?.endsWith('/aieo-model-security.mjs')) {
  const original = execFileSync('git', ['show', 'HEAD:' + MODEL_ALLOWED_PATH], { encoding: 'utf8' });
  const actual = readFileSync(MODEL_ALLOWED_PATH, 'utf8');
  const changedPaths = execFileSync('git', ['diff', '--name-only'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const diff = execFileSync('git', ['diff', '--unified=0', '--', MODEL_ALLOWED_PATH], { encoding: 'utf8' });
  const report = JSON.parse(readFileSync('aieo-output/model-proposal.json', 'utf8'));
  const result = inspectModelDiff({ original, actual, changedPaths, diff, report });
  mkdirSync('aieo-output', { recursive: true });
  writeFileSync('aieo-output/model-security.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ status: result.status, findings: result.findings.length }));
  if (result.status !== 'passed') process.exitCode = 1;
}
