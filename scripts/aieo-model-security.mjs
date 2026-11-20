// Independent review of a model-generated working tree against the prior HEAD.
import { readVerifiedModelCandidate } from './aieo-model-candidate-read.mjs';
import { readBoundedModelReport, writeExclusiveModelRoleReport } from './aieo-role-artifact-io.mjs';
import { modelGit, preflightModelGit } from './aieo-model-git.mjs';
import { createHash } from 'node:crypto';
import { MODEL_ALLOWED_PATH } from '../aieo/lib/model-provider.mjs';

const hash = (content) => createHash('sha256').update(content).digest('hex');
// Scan only new lines; a bounded UI repair must not introduce active browser exfiltration,
// dynamic code execution, credentials or raw HTML rendering.
// JWT-shaped tokens and unquoted key assignments are credentials even without
// a Bearer prefix or surrounding quotes.
const suspect = /\b(?:eval|Function)\s*\(|\b(?:child_process|process\.env|document\.cookie|localStorage|sessionStorage|dangerouslySetInnerHTML)\b|\b(?:XMLHttpRequest|fetch|WebSocket|EventSource|postMessage|sendBeacon|require|import)\s*\(|\bimport\s+(?:[\w{*]|["'])|\b(?:innerHTML|outerHTML)\s*=|gh[pousr]_[a-z0-9]{20,}|github_pat_[a-z0-9_]{30,}|sk-or-v1-[a-z0-9]{20,}|(?:sk-proj-|sk-live-|sb_secret_)[a-z0-9_-]{20,}|\bBearer\s+[a-z0-9._~+/-]{16,}|(?:AKIA|ASIA)[0-9A-Z]{16}|\b(?:service_role|password|api[_-]?key|client_secret|aws_secret_access_key|accountkey)\s*[:=]\s*(?:["'][^"'\r\n]{8,}|[a-z0-9_+/=-]{12,})|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:[?&](?:x-amz-(?:signature|credential|security-token)|sig)=)[a-z0-9%+/_=-]{20,}|\bxox[baprs]-[a-z0-9-]{20,}|\bAIza[a-z0-9_-]{35}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}/i;
// Screen newly added browser navigation, beacon and image-based exfiltration paths.
const browserExfil = /\b(?:window|globalThis)\s*(?:\.\s*open|\[\s*["'](?:open|fetch|WebSocket)["']\s*\])\s*\(|\bnavigator\s*(?:\.\s*sendBeacon|\[\s*["']sendBeacon["']\s*\])\s*\(|\b(?:window\s*\.\s*)?location\s*(?:\.\s*(?:assign|replace)\s*\(|\.\s*href\b|\[\s*["'](?:href|assign|replace)["']\s*\])|\bnew\s+(?:Image|Worker|SharedWorker)\s*\(|\bdocument\s*\.\s*createElement\s*\(\s*["'](?:iframe|script|img)["']/i;

// Direct or computed browser location redirects can exfiltrate without fetch().
const browserLocation = /\b(?:window|globalThis|document|self|top|parent)\s*(?:(?:\?\.|\.)\s*location\b|(?:\?\.)?\s*\[\s*['"]location['"]\s*\])|\blocation\s*=(?!=)/i;

// Conservatively catch long JSX attributes and quoted '>' before an outbound sink.
// Optional chaining and computed calls can invoke browser transports without
// matching direct call syntax (fetch?.(), navigator?.sendBeacon?.(), etc.).
const optionalNetworkCall = /\b(?:fetch|sendBeacon|postMessage|WebSocket|EventSource|XMLHttpRequest)\s*\?\.\s*\(|\b(?:window|globalThis|self|navigator|document)\s*(?:\?\.|\.)\s*(?:fetch|open|sendBeacon|postMessage|WebSocket|EventSource|createElement)\s*(?:\?\.)?\s*\(|\b(?:window|globalThis|self|navigator|document)\s*(?:\?\.)?\s*\[\s*['"](?:fetch|open|sendBeacon|postMessage|WebSocket|EventSource|createElement)['"]\s*\]\s*(?:\?\.)?\s*\(|\bnew\s+(?:EventSource|XMLHttpRequest)\s*\(/i;

// Detect indirect outbound API calls even when the modified code uses a function
// reference, Reflect, or a constructor instead of invoking the API directly.
const indirectNetworkCall = /\b(?:fetch|WebSocket|EventSource|XMLHttpRequest|sendBeacon|postMessage|importScripts)\b[\s\S]{0,48}?(?:(?:\?\.|\.)\s*(?:call|apply|bind)\s*\(|\[\s*['"](?:call|apply|bind)['"]\s*\]\s*\()|\bReflect\s*(?:\?\.|\.)\s*(?:apply|construct)\s*\(|\bimportScripts\s*(?:\?\.)?\s*\(|\bnew\s+WebSocket\s*\(/i;

// Reject network-capable API references before they can be aliased, destructured,
// or passed to indirect invokers. Restricted model patches are UI-only; this is
// intentionally conservative and is not a general-purpose JavaScript analysis.
const networkCapabilityReference = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|postMessage|importScripts|Image|Worker|SharedWorker|import|require|eval|Function)\b|\b(?:window|globalThis|self|navigator|document)\s*(?:\?\.|\.)\s*(?:open|createElement)\b|\b(?:window|globalThis|self|navigator|document)\s*(?:\?\.)?\s*\[\s*['"](?:open|createElement)['"]\s*\]/;

// Deny computed access to powerful browser globals: concatenated keys can
// reconstruct fetch/open/location without spelling any blocked API name.
// Reflect.get can obtain the same capability without bracket syntax.
const dynamicGlobalMember = /\b(?:globalThis|window|self|top|parent|document|navigator)\s*(?:\?\.)?\s*\[|\bReflect\s*(?:\.|\?\.)\s*(?:get|apply|construct)\s*\(/i;

// A bare ambient global can be aliased and accessed later through a computed
// key (const root = globalThis; root['fe' + 'tch'](...)), evading member-only
// network guards. Bounded one-file UI edits do not need ambient globals.
// Conservatively reject these identifiers, including 'this', before review.
// Text screening is not a general JavaScript proof of side-effect freedom.
const ambientGlobalReference = /\b(?:globalThis|window|self|top|parent|document|navigator|location|global|frames|opener|this)\b/;


// A JavaScript identifier such as \u0066etch can execute the same API without
// exposing its literal name to source scanners. The bounded UI change does not
// require JS Unicode/hex escapes, even inside strings: fail closed on these
// spellings rather than silently approving an obfuscated capability.
const encodedJavaScriptEscape = /\\(?:u(?:[0-9a-f]{4}|\{[0-9a-f]{1,6}\})|x[0-9a-f]{2})/i;

// Model preflight denies default-ignorable Unicode. Independent Security must
// repeat this check on the *actual remote candidate diff* rather than trusting
// a model proposal report, which is not an attestation of the committed bytes.
const unsafeInvisible = /\p{Default_Ignorable_Code_Point}/u;
// Independently reject JS line separators and non-printing controls in the
// *actual diff*, even if upstream proposal validation was bypassed.
const unsafeLineControl = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/u;
// Independently reject private-use, unassigned and noncharacter code points
// in the candidate's actual added lines, not merely in provider metadata.
const unsafeNonstandardUnicode = /[\p{Co}\p{Cn}]/u;

// Reflective constructor/prototype chains can obtain dynamic code execution
// without literal eval/Function. Fail closed on these names in added lines.
const dynamicCodeReflection = /\b(?:constructor|__proto__|prototype|setPrototypeOf|getPrototypeOf|defineProperty|defineProperties)\b/i;

const outboundMarkup = /<\s*(?:a|area|img|image|feImage|use|iframe|script|link|meta|base|form|input|button|video|audio|source|track|embed|object)\b[\s\S]{0,4096}?(?:\b(?:href|xlinkHref|src|srcSet|imageSrcSet|action|formAction|data|poster|content)\s*=|\{\s*\.\.\.)/i;
const outboundCss = /\b(?:url|image-set)\s*\(|\bbackgroundImage\s*:/i;
// Model-created HTML parse/assignment sinks can execute attacker-controlled
// markup without a fetch() call. The FeedbackWidget text-only patch scope
// has no reason to introduce these APIs or React's srcDoc property.
const rawHtmlSink = /\b(?:dangerouslySetInnerHTML|srcDoc|insertAdjacentHTML|DOMParser|innerHTML|outerHTML)\b/i;

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

// Do not rely only on an externally supplied diff for the security verdict.
// Independently inspect the full candidate lines covering every changed byte.
// Expanding to line boundaries catches dangerous identifiers assembled by a
// one-character replacement (e.g. changing feXch to fetch).
function changedCandidateLines(original, actual) {
  if (typeof original !== 'string' || typeof actual !== 'string' || original === actual) return [];
  let prefix = 0;
  while (prefix < Math.min(original.length, actual.length) && original[prefix] === actual[prefix]) prefix++;
  let suffix = 0;
  while (suffix < original.length - prefix && suffix < actual.length - prefix &&
         original[original.length - suffix - 1] === actual[actual.length - suffix - 1]) suffix++;
  const start = actual.lastIndexOf('\n', prefix - 1) + 1;
  const changedEnd = actual.length - suffix;
  const nextNewline = actual.indexOf('\n', changedEnd);
  const end = nextNewline === -1 ? actual.length : nextNewline;
  return actual.slice(start, end).split('\n');
}

export function inspectModelDiff({ original, actual, changedPaths, diff, report }) {
  const findings = [];
  if (changedPaths.length !== 1 || changedPaths[0] !== MODEL_ALLOWED_PATH) findings.push('Unapproved file changes');
  if (typeof original !== 'string' || typeof actual !== 'string' || original === actual) findings.push('No reviewable source change');
  if (report?.status !== 'proposed' || report.sourceHash !== hash(original) || report.proposedHash !== hash(actual)) {
    findings.push('Model hash or proposal status mismatch');
  }
  if (typeof diff !== 'string' || diff.length > 20000) findings.push('Invalid or oversized source delta');
  const additions = typeof diff === 'string' ? diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).map((line) => line.slice(1)) : [];
  const actualDeltaLines = changedCandidateLines(original, actual);
  // Retain checks on the Git diff as defense in depth, but independently
  // verify the actual candidate code even if diff input is incomplete/forged.
  const reviewedLines = [...additions, ...actualDeltaLines];
  const reviewedText = reviewedLines.join('\n');
  if (additions.length > 20 || actualDeltaLines.length > 20) findings.push('Too many new code lines');
  if (reviewedLines.some((line) => suspect.test(line) || browserExfil.test(line) || browserLocation.test(line) || optionalNetworkCall.test(line)) ||
      indirectNetworkCall.test(reviewedText) ||
      networkCapabilityReference.test(reviewedText) ||
      dynamicGlobalMember.test(reviewedText) || ambientGlobalReference.test(reviewedText) ||
      encodedJavaScriptEscape.test(reviewedText) ||
      unsafeInvisible.test(reviewedText) || unsafeLineControl.test(reviewedText) ||
      unsafeNonstandardUnicode.test(reviewedText) ||
      dynamicCodeReflection.test(reviewedText) ||
      outboundMarkup.test(reviewedText) || outboundCss.test(reviewedText) ||
      rawHtmlSink.test(reviewedText)) {
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
  preflightModelGit();
  const original = modelGit(['show', 'HEAD:' + MODEL_ALLOWED_PATH]);
  const actual = readVerifiedModelCandidate();
  const changedPaths = modelGit(['diff', '--name-only']).trim().split('\n').filter(Boolean);
  const diff = modelGit(['diff', '--unified=0', '--', MODEL_ALLOWED_PATH]);
  const report = readBoundedModelReport('proposal');
  const result = inspectModelDiff({ original, actual, changedPaths, diff, report });
  writeExclusiveModelRoleReport('security', result);
  console.log(JSON.stringify({ status: result.status, findings: result.findings.length }));
  if (result.status !== 'passed') process.exitCode = 1;
}
