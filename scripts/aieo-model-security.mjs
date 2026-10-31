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
// Scan the full JSX opening tag. An early '>' inside quoted attributes or a
// JSX expression is not the end of the tag; regexes stopping at '>' miss sinks.
const outboundTagNames = /^(?:a|area|img|image|use|feImage|iframe|script|link|form|button|input|video|audio|source|track|embed|object|base|meta)$/i;
// URL-bearing attributes are also dangerous on custom React components (e.g. Link/Image).
// Keep native-only attributes separate to avoid rejecting ordinary custom `data` props.
const urlAttributes = /\b(?:href|xlink:href|src|srcSet|srcDoc|ping|poster|action|formAction)\s*=/i;
const nativeOnlyAttributes = /\b(?:data|httpEquiv|http-equiv)\s*=/i;
function unsafeJsxMarkup(text) {
  const openings = /<\s*([A-Za-z][\w.:-]*)\b/g;
  let opening;
  while ((opening = openings.exec(text)) !== null) {
    let quote = null;
    let braces = 0;
    let end = openings.lastIndex;
    for (; end < text.length; end++) {
      const ch = text[end];
      if (quote !== null) {
        if (ch === '\\') { end++; continue; }
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'" || ch.charCodeAt(0) === 96) {
        quote = ch;
      } else if (ch === '{') {
        braces++;
      } else if (ch === '}' && braces > 0) {
        braces--;
      } else if (ch === '>' && braces === 0) {
        break;
      }
    }
    const attributes = text.slice(openings.lastIndex, end);
    // Also inspect nested JSX: an outer expression can contain a network tag.
    if (/\{\s*\.\.\./.test(attributes) ||
        urlAttributes.test(attributes) ||
        (outboundTagNames.test(opening[1]) && nativeOnlyAttributes.test(attributes))) return true;
  }
  return false;
}
const outboundCss = /\burl\s*\(|\bimage-set\s*\(|@import\b|\bbackgroundImage\s*:/i;
// Reject optional chaining, computed property access and aliases for browser/network APIs.
// This deliberately errs on the side of refusing a model-generated UI change.
const indirectBrowserAccess = /\b(?:window|globalThis|self|navigator|document|location|history)\s*(?:\.|\?\.|\[)|\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|WebTransport|sendBeacon|postMessage|Worker|SharedWorker|Image|eval|Function|require|import)\s*(?:\(|\?\.|\[)|(?:=\s*|\breturn\s+)(?:fetch|navigator|window|globalThis|document|location)\b/i;

// The source-bearing submit handler is security-critical. Preserve its complete body,
// not only snippets that could survive inside comments or unreachable branches.
const submitStart = '  async function submit(event: FormEvent<HTMLFormElement>) {';
const submitEnd = String.fromCharCode(10) + '  return <>';
function protectedSubmit(source) {
  const start = source.indexOf(submitStart);
  if (start < 0 || source.indexOf(submitStart, start + 1) !== -1) return null;
  const end = source.indexOf(submitEnd, start);
  return end < 0 ? null : source.slice(start, end);
}

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
  if (additions.some((line) => suspect.test(line) || browserExfil.test(line) || indirectBrowserAccess.test(line)) ||
      unsafeJsxMarkup(additions.join('\n')) ||
      (typeof actual === 'string' && unsafeJsxMarkup(actual)) ||
      outboundCss.test(additions.join('\n'))) {
    findings.push('Potentially unsafe new code');
  }
  if (typeof original === 'string' && typeof actual === 'string') {
    if (protectedFeedbackInvariants.some((line) => original.includes(line) && !actual.includes(line))) {
      findings.push('Existing feedback authentication or ownership guard was removed');
    }
    if (original.includes(submitStart) &&
        (!protectedSubmit(original) || protectedSubmit(actual) !== protectedSubmit(original))) {
      findings.push('Security-critical feedback submit handler was altered');
    }
    if (original.includes('<form onSubmit={submit}>') &&
        (actual.split('<form onSubmit={submit}>').length !== original.split('<form onSubmit={submit}>').length)) {
      findings.push('Feedback form submit binding was changed');
    }
  }
  // Added block comments can disable code while leaving protected strings intact.
  if (additions.some((line) => line.includes('/*') || line.includes('*/'))) {
    findings.push('New block-comment delimiters are not allowed in model changes');
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
