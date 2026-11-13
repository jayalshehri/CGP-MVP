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
