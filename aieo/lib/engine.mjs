// AIEO bounded multi-agent foundation: deterministic, no provider calls or production writes.
import { createHash } from 'node:crypto';

export const APPROVED_PATH = 'components/FeedbackWidget.tsx';
export const APPROVED_TASK = 'feedback-control-route-boundary';
const ORIGINAL = '  const controlId = useMemo(() => /^\\/controls\\/(\\d+)/.exec(pagePath)?.[1] ?? null, [pagePath]);';
const CORRECTED = '  const controlId = useMemo(() => /^\\/controls\\/(\\d+)(?:\\/|$)/.exec(pagePath)?.[1] ?? null, [pagePath]);';
const count = (source, text) => source.split(text).length - 1;

export function developerAgent({ task, source, path = APPROVED_PATH }) {
  if (task !== APPROVED_TASK || path !== APPROVED_PATH || typeof source !== 'string') {
    return { status: 'blocked', reason: 'Task or target path is not approved' };
  }
  const sourceHash = createHash('sha256').update(source).digest('hex');
  if (count(source, CORRECTED) === 1 && count(source, ORIGINAL) === 0) {
    return { status: 'no-change', reason: 'Approved fix is already present', path, sourceHash };
  }
  if (count(source, ORIGINAL) !== 1 || count(source, CORRECTED) !== 0) {
    return { status: 'blocked', reason: 'Unexpected source or multiple replacement candidates', path, sourceHash };
  }
  const patchedSource = source.replace(ORIGINAL, CORRECTED);
  return { status: 'proposed', reason: 'One bounded route-boundary fix', path, sourceHash, patchedSource, addedLines: [CORRECTED] };
}

export function qaAgent({ developer, source }) {
  if (!developer || !['proposed', 'no-change'].includes(developer.status)) {
    return { status: 'failed', checks: [], reason: 'No valid developer candidate' };
  }
  const candidate = developer.status === 'proposed' ? developer.patchedSource : source;
  const routeMatcher = /^\/controls\/(\d+)(?:\/|$)/;
  const cases = [
    ['/controls/12', '12'], ['/controls/12/edit', '12'],
    ['/controls/12junk', null], ['/controls/123', '123'],
    ['/controls/', null]
  ];
  const caseResults = cases.map(([path, expected]) => (routeMatcher.exec(path)?.[1] ?? null) === expected);
  const passed = count(candidate, CORRECTED) === 1 && count(candidate, ORIGINAL) === 0 && caseResults.every(Boolean);
  return { status: passed ? 'passed' : 'failed', checks: ['single-corrected-source-line', 'five-route-boundary-regressions'], casesPassed: caseResults.filter(Boolean).length, casesTotal: cases.length };
}

export function securityAgent({ developer, source }) {
  const findings = [];
  if (typeof source !== 'string') {
    findings.push('Trusted source is missing');
  } else {
    const hash = createHash('sha256').update(source).digest('hex');
    if (developer?.sourceHash !== hash) findings.push('Candidate is based on different source');
    if (developer?.status === 'proposed' &&
        (count(source, ORIGINAL) !== 1 || developer.patchedSource !== source.replace(ORIGINAL, CORRECTED))) {
      findings.push('Patch changes more than the approved one-line replacement');
    }
    if (developer?.status === 'no-change' &&
        (count(source, CORRECTED) !== 1 || count(source, ORIGINAL) !== 0)) {
      findings.push('No-change claim is not supported by actual source');
    }
  }
  if (!developer || !['proposed', 'no-change'].includes(developer.status)) {
    findings.push('No approved candidate');
  } else if (developer.path !== APPROVED_PATH) {
    findings.push('Attempt to change a non-allowlisted file');
  }
  if (developer?.status === 'proposed') {
    if (typeof developer.patchedSource !== 'string' || !Array.isArray(developer.addedLines) || developer.addedLines.length !== 1) {
      findings.push('Unexpected patch structure');
    } else {
      const line = developer.addedLines[0];
      if (line !== CORRECTED) findings.push('Unapproved replacement content');
      if (/gh[pousr]_[a-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(line)) {
        findings.push('Possible credential in patch');
      }
    }
  }
  return { status: findings.length === 0 ? 'passed' : 'failed', findings };
}

export function reviewerAgent({ developer, qa, security }) {
  if (!developer || !qa || !security || qa.status !== 'passed' || security.status !== 'passed') {
    return { status: 'blocked', reason: 'QA or security gate failed', requiresHumanMerge: true };
  }
  if (developer.status === 'no-change') {
    return { status: 'verified-no-change', reason: 'Existing fix passed agent checks', requiresHumanMerge: true };
  }
  if (developer.status === 'proposed') {
    return { status: 'draft-pr-eligible', reason: 'Bounded change can be offered for human review', requiresHumanMerge: true };
  }
  return { status: 'blocked', reason: 'Developer verdict not accepted', requiresHumanMerge: true };
}

export function orchestrate({ task = APPROVED_TASK, source, path = APPROVED_PATH }) {
  const developer = developerAgent({ task, source, path });
  const qa = qaAgent({ developer, source });
  const security = securityAgent({ developer, source });
  const reviewer = reviewerAgent({ developer, qa, security });
  return { developer, qa, security, reviewer };
}

export function publicReport(result) {
  // Do not publish full source, patches, model prompts or credentials in workflow artifacts.
  const { patchedSource, addedLines, ...developer } = result.developer;
  return { schemaVersion: 1, agents: ['developer', 'qa', 'security', 'reviewer'], developer, qa: result.qa, security: result.security, reviewer: result.reviewer, productionChanges: false, mergePerformed: false };
}
