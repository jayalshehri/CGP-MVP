// AIEO bounded multi-agent foundation: deterministic, no provider calls or production writes.
import { createHash } from 'node:crypto';

export const APPROVED_PATH = 'components/FeedbackWidget.tsx';
export const APPROVED_TASK = 'feedback-control-route-boundary';
const ORIGINAL = '  const controlId = useMemo(() => /^\\/controls\\/(\\d+)/.exec(pagePath)?.[1] ?? null, [pagePath]);';
const CORRECTED = '  const controlId = useMemo(() => /^\\/controls\\/(\\d+)(?:\\/|$)/.exec(pagePath)?.[1] ?? null, [pagePath]);';
const count = (source, text) => source.split(text).length - 1;

// A second *synthetic* regression class for independent four-role rehearsals.
// It is already fixed in the real FeedbackWidget: never apply it to production.
// Neither task permits general-purpose edits or bypasses human approval.
export const MESSAGE_TRIM_TASK = 'feedback-trim-whitespace';
const TRIM_ORIGINAL = '    const cleanMessage = message;';
const TRIM_CORRECTED = '    const cleanMessage = message.trim();';
function editFor(task) {
  if (task === APPROVED_TASK) return { before: ORIGINAL, after: CORRECTED, reason: 'One bounded route-boundary fix' };
  if (task === MESSAGE_TRIM_TASK) return { before: TRIM_ORIGINAL, after: TRIM_CORRECTED, reason: 'One bounded whitespace validation fix' };
  return null;
}

export function developerAgent({ task, source, path = APPROVED_PATH }) {
  const edit = editFor(task);
  if (!edit || path !== APPROVED_PATH || typeof source !== 'string') {
    return { status: 'blocked', reason: 'Task or target path is not approved' };
  }
  const sourceHash = createHash('sha256').update(source).digest('hex');
  if (count(source, edit.after) === 1 && count(source, edit.before) === 0) {
    return { status: 'no-change', task, reason: 'Approved fix is already present', path, sourceHash, candidateHash: sourceHash };
  }
  if (count(source, edit.before) !== 1 || count(source, edit.after) !== 0) {
    return { status: 'blocked', reason: 'Unexpected source or multiple replacement candidates', path, sourceHash };
  }
  const patchedSource = source.replace(edit.before, edit.after);
  return { status: 'proposed', task, reason: edit.reason, path, sourceHash,
    candidateHash: createHash('sha256').update(patchedSource).digest('hex'), patchedSource, addedLines: [edit.after] };
}

export function qaAgent({ developer, source }) {
  const edit = editFor(developer?.task);
  if (!edit || typeof source !== 'string' || !['proposed', 'no-change'].includes(developer?.status)) {
    return { status: 'failed', checks: [], reason: 'No valid developer candidate' };
  }
  const candidate = developer.status === 'proposed' ? developer.patchedSource : source;
  if (typeof candidate !== 'string') return { status: 'failed', checks: [], reason: 'Missing candidate source' };
  // Route and blank-message fixtures execute independent behavioral examples.
  // The source attestation below binds those examples to the exact approved line.
  const routeMatcher = /^\/controls\/(\d+)(?:\/|$)/;
  const routeCases = [
    ['/controls/12', '12'], ['/controls/12/edit', '12'],
    ['/controls/12junk', null], ['/controls/123', '123'],
    ['/controls/', null]
  ];
  const trimCases = [
    ['', ''], ['  ', ''], ['\t\n', ''],
    ['  useful message  ', 'useful message'], ['ready', 'ready']
  ];
  const caseResults = developer.task === APPROVED_TASK
    ? routeCases.map(([path, expected]) => (routeMatcher.exec(path)?.[1] ?? null) === expected)
    : trimCases.map(([input, expected]) => input.trim() === expected);
  const expectedCandidate = developer.status === 'proposed' ? source.replace(edit.before, edit.after) : source;
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const passed = count(candidate, edit.after) === 1 && count(candidate, edit.before) === 0 &&
    candidate === expectedCandidate && developer.sourceHash === hash(source) &&
    developer.candidateHash === hash(candidate) && caseResults.every(Boolean);
  return { status: passed ? 'passed' : 'failed',
    checks: ['single-corrected-source-line', developer.task === APPROVED_TASK ? 'five-route-boundary-regressions' : 'five-message-trim-regressions'],
    casesPassed: caseResults.filter(Boolean).length, casesTotal: caseResults.length };
}

export function securityAgent({ developer, source }) {
  const findings = [];
  const edit = editFor(developer?.task);
  if (!edit) findings.push('Unapproved or missing deterministic task');
  if (typeof source !== 'string') {
    findings.push('Trusted source is missing');
  } else {
    const hash = (value) => createHash('sha256').update(value).digest('hex');
    if (developer?.sourceHash !== hash(source)) findings.push('Candidate is based on different source');
    if (edit && developer?.status === 'proposed' &&
        (count(source, edit.before) !== 1 || count(source, edit.after) !== 0 ||
         developer.patchedSource !== source.replace(edit.before, edit.after) ||
         developer.candidateHash !== hash(developer.patchedSource))) {
      findings.push('Patch changes more than the approved one-line replacement');
    }
    if (edit && developer?.status === 'no-change' &&
        (count(source, edit.after) !== 1 || count(source, edit.before) !== 0 ||
         developer.candidateHash !== hash(source))) {
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
      if (!edit || line !== edit.after) findings.push('Unapproved replacement content');
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
