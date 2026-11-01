// Conservative source-to-source attestation for the single approved FeedbackWidget.
// A UI-label suggestion must not rewrite imports, state, guards, network operations,
// or executable expressions embedded inside JSX. This is NOT a JSX/TS parser.
const COMPONENT = 'export default function FeedbackWidget(';
const RETURN = '\n  return <>';
const CLOSE = '\n  </>;'

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


function jsxTagShape(source, from, to) {
  const tags = [];
  for (let i = from; i < to; i++) {
    if (source[i] === '{') {
      // JSX may contain an entire nested component inside an expression.
      // Its bytes are separately frozen by jsxExpressions; skip it here.
      let depth = 1;
      let quote = null;
      for (i++; i < to; i++) {
        const ch = source[i];
        if (quote !== null) {
          if (ch === '\\') { i++; continue; }
          if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
        else if (ch === '{') depth++;
        else if (ch === '}' && --depth === 0) break;
      }
      if (depth !== 0) return null;
      continue;
    }
    if (source[i] !== '<') continue;
    let quote = null;
    let depth = 0;
    let end = i + 1;
    for (; end < to; end++) {
      const ch = source[end];
      if (quote !== null) {
        if (ch === '\\') { end++; continue; }
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if (ch === '{') depth++;
      else if (ch === '}' && depth > 0) depth--;
      else if (ch === '>' && depth === 0) break;
    }
    if (end >= to) return null;
    // Only literal class/copy attributes may change. Tag names, event owners,
    // form behavior, dynamic props and structural markup remain byte-identical.
    const tag = source.slice(i, end + 1).replace(
      /\b(className|aria-label|placeholder|title)\s*=\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,
      '$1="<literal>"'
    );
    tags.push(tag);
    i = end;
  }
  return tags;
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
  const oldClose = original.lastIndexOf(CLOSE);
  const newClose = actual.lastIndexOf(CLOSE);
  if (oldClose <= oldEnd || newClose <= newEnd ||
      original.slice(0, oldEnd) !== actual.slice(0, newEnd) ||
      original.slice(oldClose) !== actual.slice(newClose)) return false;
  const before = jsxExpressions(original, oldEnd);
  const after = jsxExpressions(actual, newEnd);
  const beforeTags = jsxTagShape(original, oldEnd, oldClose);
  const afterTags = jsxTagShape(actual, newEnd, newClose);
  return before !== null && after !== null &&
    beforeTags !== null && afterTags !== null &&
    JSON.stringify(before) === JSON.stringify(after) &&
    JSON.stringify(beforeTags) === JSON.stringify(afterTags);
}
