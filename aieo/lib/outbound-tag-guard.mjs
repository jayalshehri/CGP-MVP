// Detect newly introduced outbound JSX capabilities even when an edit changes
// an attribute AFTER an existing src/href. This deliberately conservative,
// bounded scan is not a general-purpose JSX or HTML parser.
// Include SVG referencing elements and capitalized React components: both can
// carry href/src URLs even when no native <a>, <img>, or <form> is present.
// Do not use the i flag: it would make the capitalized component alternative
// match arbitrary lower-case identifiers after '<' in ordinary comparisons.
// Lower-case custom elements (web components) and namespaced JSX/SVG tags
// can also bind src/href or spread props. SVG container elements can change
// the resolution of existing relative URLs via xmlBase / xml:base, even if
// no href/src is added. Do not let those opening tags evade
// full-source comparison merely because they are not native HTML tag names.
const tagStart = /<\s*(?:(?:a|area|svg|g|defs|symbol|foreignObject|path|rect|circle|ellipse|line|polyline|polygon|text|tspan|stop|img|image|feImage|use|iframe|script|link|meta|base|form|input|button|video|audio|source|track|embed|object|animate|animateMotion|animateTransform|set|textPath|mpath|pattern|linearGradient|radialGradient|filter|mask|clipPath|marker|cursor|fontFaceUri|font-face-uri)\b|[A-Z][\w.:-]*(?=[\s/>])|[a-z][\w.]*[-:][\w.:-]+(?=[\s/>]))/g;
// Anchor ping URLs send network requests on activation; attributionSrc can
// trigger attribution-reporting requests. They are outbound capabilities too,
// even if existing href/src values stay unchanged.
const outboundAttribute = /\b(?:href|xlinkHref|xmlBase|xml:base|src|srcSet|imageSrcSet|action|formAction|ping|attributionSrc|data|poster|content)\s*=/gi;
const jsxSpread = /\{\s*\.\.\./g;

// Quoted '>' and JSX comparisons must not terminate an opening tag early.
// Malformed or >4096-character opening tags are rejected, not silently ignored.
function scanEnd(text, begin, opener, limit) {
  let quote = null;
  let nested = 0;
  for (let i = begin; i < limit; i++) {
    const char = text[i];
    if (quote !== null) {
      if (char === '\\') { i++; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') { nested++; continue; }
    if (char === '}') {
      if (nested === 0) return -1;
      nested--;
      if (opener === '{' && nested === 0) return i + 1;
      continue;
    }
    if (opener === '>' && char === '>' && nested === 0) return i + 1;
  }
  return -1;
}

function readValue(text, begin) {
  let start = begin;
  while (start < text.length && /\s/.test(text[start])) start++;
  if (text[start] === '{') return scanEnd(text, start, '{', text.length);
  if (text[start] === '"' || text[start] === "'" || text[start] === '`') {
    const quote = text[start];
    let i = start + 1;
    while (i < text.length) {
      if (text[i] === '\\') { i += 2; continue; }
      if (text[i] === quote) return i + 1;
      i++;
    }
    return -1;
  }
  let end = start;
  while (end < text.length && !/[\s>]/.test(text[end])) end++;
  return end > start ? end : -1;
}

// Attribute *values* and multiplicities are part of the signature. Merely
// counting tags would miss a new srcSet after an unchanged src, or a value
// change inside the same existing opening tag. Unrelated alt text may change.
function outboundTagSignatures(source) {
  const signatures = [];
  for (const match of source.matchAll(tagStart)) {
    const end = scanEnd(source, match.index + match[0].length, '>',
      Math.min(source.length, match.index + 4096));
    if (end < 0) return null;
    const tag = source.slice(match.index, end);
    const outgoing = [];
    for (const attribute of tag.matchAll(outboundAttribute)) {
      const valStart = attribute.index + attribute[0].length;
      const valEnd = readValue(tag, valStart);
      if (valEnd < 0) return null;
      outgoing.push(attribute[0].replace(/\s+/g, '').toLowerCase() +
        tag.slice(valStart, valEnd).trim());
    }
    for (const spread of tag.matchAll(jsxSpread)) {
      const valEnd = scanEnd(tag, spread.index, '{', tag.length);
      if (valEnd < 0) return null;
      outgoing.push('spread:' + tag.slice(spread.index, valEnd));
    }
    if (outgoing.length) {
      signatures.push(match[0].replace(/\s+/g, '').toLowerCase() +
        ':' + JSON.stringify(outgoing.sort()));
    }
  }
  return signatures;
}

export function introducesOutboundTagAttribute(original, candidate) {
  if (typeof original !== 'string' || typeof candidate !== 'string') return true;
  const before = outboundTagSignatures(original);
  const after = outboundTagSignatures(candidate);
  if (!before || !after) return true; // malformed or ambiguous markup: fail closed
  const counts = new Map();
  for (const entry of before) counts.set(entry, (counts.get(entry) || 0) + 1);
  for (const entry of after) {
    const remaining = counts.get(entry) || 0;
    if (!remaining) return true;
    counts.set(entry, remaining - 1);
  }
  return false;
}
