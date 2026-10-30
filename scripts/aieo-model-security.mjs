// Independent review of a model-generated working tree against the prior HEAD.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';

const hash = (content) => createHash('sha256').update(content).digest('hex');
// Scan only new lines; a bounded UI repair must not introduce active browser exfiltration,
// dynamic code execution, credentials or raw HTML rendering.
const suspect = /\b(?:eval|Function)\s*\(|\b(?:child_process|process\.env|document\.cookie|localStorage|sessionStorage|dangerouslySetInnerHTML)\b|\b(?:XMLHttpRequest|fetch|WebSocket|EventSource|postMessage|sendBeacon|require|import)\s*\(|\bimport\s+(?:[\w{*]|["'])|\b(?:innerHTML|outerHTML)\s*=|gh[pousr]_[a-z0-9]{20,}|github_pat_[a-z0-9_]{30,}|sk-or-v1-[a-z0-9]{20,}|(?:sk-proj-|sk-live-|sb_secret_)[a-z0-9_-]{20,}|\bBearer\s+[a-z0-9._~+/-]{16,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i;
// Screen newly added browser navigation, beacon and image-based exfiltration paths.
const browserExfil = /\b(?:window|globalThis)\s*(?:\.\s*open|\[\s*["'](?:open|fetch|WebSocket)["']\s*\])\s*\(|\bnavigator\s*(?:\.\s*sendBeacon|\[\s*["']sendBeacon["']\s*\])\s*\(|\b(?:window\s*\.\s*)?location\s*(?:\.\s*(?:assign|replace)\s*\(|\.\s*href\b|\[\s*["'](?:href|assign|replace)["']\s*\])|\bnew\s+(?:Image|Worker|SharedWorker)\s*\(|\bdocument\s*\.\s*createElement\s*\(\s*["'](?:iframe|script|img)["']/i;

// Browser data can also leave through markup attributes and CSS, without an explicit fetch().
const outboundMarkup = /<\s*(?:a|area|img|iframe|script|link|form|video|audio|source|embed|object)\b(?:(?!>).){0,350}?\b(?:href|src|srcSet|action|formAction|data)\s*=/is;
const outboundCss = /\burl\s*\(|\bbackgroundImage\s*:/i;

const protectedFeedbackInvariants = [
  'await supabase.auth.getUser()',
  'if (!auth.user)',
  'created_by: auth.user.id',
  'supabase.from("feedback").insert('
];

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
  if (additions.some((line) => suspect.test(line) || browserExfil.test(line)) ||\n      outboundMarkup.test(additions.join('\n')) || outboundCss.test(additions.join('\\n'))) {\n    findings.push('Potentially unsafe new code');\n  }
  if (typeof original === 'string' && typeof actual === 'string' &&
      protectedFeedbackInvariants.some((line) => original.includes(line) && !actual.includes(line))) {
    findings.push('Existing feedback authentication or ownership guard was removed');
  }
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
