// Independent, read-only gates for a model-generated bounded candidate.
// These checks verify scope and known invariants; they cannot prove arbitrary task correctness.
import { createHash } from 'node:crypto';
import { MODEL_ALLOWED_PATH } from './model-provider.mjs';
import { inspectModelDiff } from '../../scripts/aieo-model-security.mjs';

const sha = (text) => createHash('sha256').update(text).digest('hex');
const routeLine = String.raw`  const controlId = useMemo(() => /^\/controls\/(\d+)(?:\/|$)/.exec(pagePath)?.[1] ?? null, [pagePath]);`;
const routeCases = [
  ['/controls/12', '12'], ['/controls/12/edit', '12'],
  ['/controls/12junk', null], ['/controls/123', '123'],
  ['/controls/', null]
];
const routeMatcher = /^\/controls\/(\d+)(?:\/|$)/;
const exactScope = (paths) => Array.isArray(paths) && paths.length === 1 && paths[0] === MODEL_ALLOWED_PATH;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// A full, standalone line may still be inert inside a block comment or template.
// This conservative lexical scan fails closed on ambiguous source (it is not a
// full TSX parser or semantic proof of arbitrary proposed changes).
function routeIsCode(source, offset) {
  let state = 'code';
  for (let i = 0; i < offset; i++) {
    const ch = source[i], next = source[i + 1];
    if (state === 'line-comment') { if (ch === '\n') state = 'code'; continue; }
    if (state === 'block-comment') {
      if (ch === '*' && next === '/') { state = 'code'; i++; }
      continue;
    }
    if (state === 'single' || state === 'double' || state === 'template') {
      if (ch === '\\') { i++; continue; }
      if ((state === 'single' && ch === "'") ||
          (state === 'double' && ch === '"') ||
          (state === 'template' && ch === '`')) state = 'code';
      continue;
    }
    if (ch === '/' && next === '/') { state = 'line-comment'; i++; }
    else if (ch === '/' && next === '*') { state = 'block-comment'; i++; }
    else if (ch === "'") state = 'single';
    else if (ch === '"') state = 'double';
    else if (ch === '`') state = 'template';
  }
  return state === 'code';
}
const hasLiveRouteLine = (source) => {
  if (typeof source !== 'string') return false;
  const normalized = source.replace(/\r\n?/g, '\n');
  const matches = [];
  let offset = 0;
  for (const line of normalized.split('\n')) {
    if (line === routeLine) matches.push(offset);
    offset += line.length + 1;
  }
  return matches.length === 1 && routeIsCode(normalized, matches[0]);
};

// Preserve the trusted component's setup, visibility condition, hook state and
// submission handler through the start of JSX render. Replacements in this
// executable pre-render region can silently disable the entire widget while
// leaving the route hook and form binding untouched. Synthetic route-only
// fixtures without a render boundary retain the narrower route-line check.
function guardedRoutePrefix(source) {
  const normalized = source.replace(/\r\n?/g, '\n');
  const position = normalized.indexOf(routeLine);
  if (position < 0) return null;
  const marker = '\n  return <>';
  const renderStart = normalized.indexOf(marker, position + routeLine.length);
  const end = renderStart < 0 ? position + routeLine.length : renderStart + marker.length;
  return normalized.slice(0, end);
}

// For a rendered TSX component, the model may change one inert, static text
// node inside a simple JSX element. Freeze tags, attributes, JSX expressions,
// state bindings and control flow byte-for-byte. This is a deliberately
// conservative source check, not a TSX parser or a functional proof.
function isOnlyRenderedTextEdit(original, actual) {
  const marker = '\n  return <>';
  const renderStart = original.indexOf(marker);
  if (renderStart < 0) {
    // Keep legacy route-only synthetic fixtures in tests, but fail closed if
    // the real widget's JSX entry point is refactored or disappears. Without
    // this boundary, a future trusted-source change could make every JSX
    // mutation appear to be an inert copy edit.
    return !/\bFeedbackWidget\b/.test(original) &&
      !/<\/?[A-Za-z][\w.-]*(?:\s|>)/.test(original);
  }
  const offset = renderStart + marker.length;
  // Element contents are not always harmless copy. CSS inside <style>,
  // JavaScript inside <script>, and implicit <option>/<textarea> values can
  // affect behavior even when the tags and attributes are unchanged.
  // Allow only explicitly reviewed display-text elements, never arbitrary tags.
  const literalTextTags = new Set([
    'span', 'strong', 'em', 'b', 'i', 'small', 'p', 'label', 'div',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'button', 'a'
  ]);
  const literalElement = /<([a-z][\w-]*)(?:\s+[^<>{}\r\n]*)?>([^<>{}\r\n]+)<\/\1>/gi;
  for (const match of original.slice(offset).matchAll(literalElement)) {
    if (!literalTextTags.has(match[1].toLowerCase())) continue;
    const previousText = match[2];
    if (!previousText.trim()) continue;
    const start = offset + match.index + match[0].indexOf('>') + 1;
    // A regex match is not proof of a JSX text node: JSX expressions can
    // contain quoted JS strings or templates with markup-like substrings.
    // Editing those can change executable URLs/conditions, not visible copy.
    // Reuse the conservative lexical guard and fail closed on such contexts.
    if (!routeIsCode(original, start)) continue;
    const end = start + previousText.length;
    const prefix = original.slice(0, start);
    const suffix = original.slice(end);
    if (!actual.startsWith(prefix) || !actual.endsWith(suffix)) continue;
    const replacement = actual.slice(start, actual.length - suffix.length);
    if (!replacement.trim() || replacement === previousText ||
        replacement.length > 240 ||
        // Fail closed on every Unicode Other category (format controls,
        // private-use, isolated surrogates, noncharacters), default-ignorables
        // (including combining marks), separators and *all* JSX entities.
        // Non-printing characters cannot be certified as inert display copy.
        /[\p{C}\p{Default_Ignorable_Code_Point}\p{Zl}\p{Zp}]/u.test(replacement) ||
        /&(?:#[xX][0-9a-f]+|#[0-9]+|[a-z][a-z0-9]+);/i.test(replacement) ||
        /[<>{}\r\n"'\x60\\\x00-\x1f]/.test(replacement)) continue;
    return true;
  }
  return false;
}

export function inspectModelQa({ original, actual, changedPaths, report }) {
  const findings = [];
  if (!exactScope(changedPaths)) findings.push('QA scope is not exactly the allowlisted file');
  if (typeof original !== 'string' || typeof actual !== 'string' || original === actual) {
    findings.push('QA candidate is not a valid source change');
  }
  const sourceHash = typeof original === 'string' ? sha(original) : null;
  const proposedHash = typeof actual === 'string' ? sha(actual) : null;
  if (report?.status !== 'proposed' || report.path !== MODEL_ALLOWED_PATH ||
      report.sourceHash !== sourceHash || report.proposedHash !== proposedHash) {
    findings.push('QA source or candidate attestation mismatch');
  }
  // Confirm the already-fixed route boundary survives any model edit.
  // Route cases use the known expected matcher, not untrusted model code.
  // Preserve the trusted pre-render source through the JSX entry point when
  // present. An unchanged route hook is insufficient if a model turns the
  // widget invisible, moves it into dead code, or rewrites subsequent hooks.
  const hasInvariant = hasLiveRouteLine(original) && hasLiveRouteLine(actual) &&
    guardedRoutePrefix(original) === guardedRoutePrefix(actual);
  // A preserved render entry alone does not protect JSX state and submit
  // bindings. Do not treat structural JSX edits as harmless copy changes.
  if (typeof original === 'string' && typeof actual === 'string' &&
      !isOnlyRenderedTextEdit(original, actual)) {
    findings.push('Rendered JSX edit is not one inert literal text node');
  }
  const regressions = routeCases.filter(([path, expected]) =>
    (routeMatcher.exec(path)?.[1] ?? null) === expected).length;
  if (!hasInvariant || regressions !== routeCases.length) {
    findings.push('Existing route-boundary invariant was removed or altered');
  }
  return {
    schemaVersion: 1, role: 'qa', status: findings.length ? 'failed' : 'passed',
    path: MODEL_ALLOWED_PATH, sourceHash, proposedHash,
    checks: ['one-allowlisted-file', 'candidate-hash-match', 'known-route-invariant'],
    routeCasesPassed: hasInvariant ? regressions : 0,
    routeCasesTotal: routeCases.length, findings
  };
}

export function inspectModelReviewer({ original, actual, changedPaths, diff, proposal, qa, security }) {
  const findings = [];
  const expectedQa = inspectModelQa({ original, actual, changedPaths, report: proposal });
  const expectedSecurity = inspectModelDiff({ original, actual, changedPaths, diff, report: proposal });
  if (expectedQa.status !== 'passed' || !same(qa, expectedQa)) {
    findings.push('QA verdict failed or differs from independent recomputation');
  }
  if (expectedSecurity.status !== 'passed' || !same(security, expectedSecurity)) {
    findings.push('Security verdict failed or differs from independent recomputation');
  }
  if (!exactScope(changedPaths)) findings.push('Reviewer detected an out-of-scope change');
  return {
    schemaVersion: 1, role: 'reviewer',
    status: findings.length ? 'blocked' : 'draft-pr-eligible',
    sourceHash: expectedQa.sourceHash, proposedHash: expectedQa.proposedHash,
    requiresHumanMerge: true, findings
  };
}
