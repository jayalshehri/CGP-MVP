// Conservative source-to-source attestation for the single approved FeedbackWidget.
// A UI-label suggestion must not rewrite imports, state, guards, network operations,
// or executable expressions embedded inside JSX. This is NOT a JSX/TS parser.
const COMPONENT = 'export default function FeedbackWidget(';
const RETURN = '\n  return <>';

function jsxExpressions(source, from) {
  const expressions = [];
  let start = -1;
  let depth = 0;
  let quote = null;
  for (let i = from; i < source.length; i++) {
    const ch = source[i];
    if (start < 0) {
      if (ch === '{') { start = i; depth = 1; }
      continue;
    }
    if (quote !== null) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) {
      expressions.push(source.slice(start, i + 1));
      start = -1;
    }
  }
  return start === -1 ? expressions : null;
}

export function preservesFeedbackExecutableSurface(original, actual) {
  if (typeof original !== 'string' || typeof actual !== 'string') return false;
  // Generic synthetic fixtures have no approved FeedbackWidget component;
  // the stricter immutable executable boundary applies to that real component.
  if (!original.includes(COMPONENT)) return true;
  const oldAt = original.indexOf(RETURN);
  const newAt = actual.indexOf(RETURN);
  if (oldAt < 0 || newAt < 0 ||
      original.indexOf(RETURN, oldAt + RETURN.length) !== -1 ||
      actual.indexOf(RETURN, newAt + RETURN.length) !== -1) return false;
  const oldEnd = oldAt + RETURN.length;
  const newEnd = newAt + RETURN.length;
  if (original.slice(0, oldEnd) !== actual.slice(0, newEnd)) return false;
  const before = jsxExpressions(original, oldEnd);
  const after = jsxExpressions(actual, newEnd);
  return before !== null && after !== null && JSON.stringify(before) === JSON.stringify(after);
}
