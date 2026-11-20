// Freeze JSX behavior-bearing attributes on both sides of a bounded UI-copy
// edit. Adding/changing props and removing existing restrictions (e.g.
// sandbox/disabled) are unsafe even when no new code is introduced. This deliberately conservative,
// bounded scan is not a general-purpose JSX or HTML parser.
// Include SVG referencing elements and capitalized React components: both can
// carry href/src URLs even when no native <a>, <img>, or <form> is present.
// Do not use the i flag: it would make the capitalized component alternative
// match arbitrary lower-case identifiers after '<' in ordinary comparisons.
// Lower-case custom elements (web components) and namespaced JSX/SVG tags
// can also bind src/href or spread props. Lowercase dotted JSX member names
// (ui.Button) are components too, even if the leading namespace is lowercase.
// Match native HTML names only when the *entire tag name* ends, so <a-custom>
// is not accidentally parsed as an invalid <a> opening tag.
// SVG container elements can change
// the resolution of existing relative URLs via xmlBase / xml:base, even if
// no href/src is added. Do not let those opening tags evade
// full-source comparison merely because they are not native HTML tag names.
const tagStart = /<\s*(?:(?:p|pre|nav|details|summary|dialog|textarea|select|option|optgroup|fieldset|legend|figure|figcaption|output|progress|meter|time|code|kbd|samp|b|i|u|s|mark|abbr|address|cite|dfn|sub|sup|hr|wbr|br|dl|dt|dd|thead|tbody|tfoot|col|colgroup|caption|menu|template|slot|map|param|hgroup|ruby|rt|rp|bdi|bdo|div|span|section|article|main|header|footer|aside|label|strong|em|small|h[1-6]|ul|ol|li|table|tr|td|th|blockquote|q|del|ins|body|html|picture|canvas|a|area|svg|g|defs|symbol|foreignObject|path|rect|circle|ellipse|line|polyline|polygon|text|tspan|stop|img|image|feImage|use|iframe|script|link|meta|base|form|input|button|video|audio|source|track|embed|object|animate|animateMotion|animateTransform|set|textPath|mpath|pattern|linearGradient|radialGradient|filter|mask|clipPath|marker|cursor|fontFaceUri|font-face-uri)(?=[\s/>])|[A-Z][\w.:-]*(?=[\s/>])|[a-z][\w$]*(?:\.[A-Za-z_$][\w$]*)+(?=[\s/>])|[a-z][\w.]*[-:][\w.:-]+(?=[\s/>]))/g;
// JSX event handlers and callback refs can invoke pre-existing side-effecting
// callbacks without adding fetch or navigation tokens; style can activate an
// existing background URL. Expand native element coverage beyond layout tags
// to interactive controls and text/semantic HTML elements. Protect changes to these effect-bearing props on native presentation
// elements too, while leaving unrelated labels and text edits possible.
// Anchor ping URLs send network requests on activation; attributionSrc can
// trigger attribution-reporting requests. They are outbound capabilities too,
// even if existing href/src values stay unchanged.
// This bounded model task is UI copy only. A denylist of dangerous JSX
// props misses behaviour-changing attributes such as type, formMethod, target
// and custom component props. Freeze every assigned prop except plain quoted
// text-only copy props; expressions can invoke existing side-effecting callbacks.
const inertLiteralCopyProps = new Set(['alt', 'title', 'placeholder', 'aria-label', 'aria-description']);
// Parse attributes sequentially instead of regex-matching arbitrary text in
// quoted values or JSX expressions. All bare boolean props are behavior-bearing
// by default, not just an incomplete list of known HTML booleans. An ambiguous
// opening tag fails closed for both model preflight and independent Security.

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
// counting tags would miss new props after unchanged src or href. Sequential
// parsing also prevents an apparent "prop=" embedded inside an inert title
// string from being mistaken for an actual JSX attribute.
function parseTagAttributes(tag, prefixLength) {
  const outgoing = [];
  let cursor = prefixLength;
  while (cursor < tag.length) {
    while (/\s/.test(tag[cursor] || '')) cursor++;
    if (tag[cursor] === '>' ||
        (tag[cursor] === '/' && tag[cursor + 1] === '>')) return outgoing;
    if (tag[cursor] === '{') {
      const end = scanEnd(tag, cursor, '{', tag.length);
      const expression = end > 0 ? tag.slice(cursor, end) : '';
      if (!/^\{\s*\.\.\./.test(expression)) return null;
      outgoing.push('spread:' + expression);
      cursor = end;
      continue;
    }
    const name = /^[A-Za-z_][A-Za-z0-9_:.-]*/.exec(tag.slice(cursor))?.[0];
    if (!name) return null;
    cursor += name.length;
    while (/\s/.test(tag[cursor] || '')) cursor++;
    if (tag[cursor] !== '=') {
      // Every unassigned JSX prop can have an effect, including unknown props
      // on React components and web components. Do not maintain a denylist.
      outgoing.push('boolean:' + name.toLowerCase());
      continue;
    }
    cursor++;
    const end = readValue(tag, cursor);
    if (end < 0) return null;
    const value = tag.slice(cursor, end).trim();
    const literal = (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (!inertLiteralCopyProps.has(name.toLowerCase()) || !literal) {
      outgoing.push(name.toLowerCase() + '=' + value);
    }
    cursor = end;
  }
  return null; // malformed opening tag
}

function outboundTagSignatures(source) {
  const signatures = [];
  for (const match of source.matchAll(tagStart)) {
    const end = scanEnd(source, match.index + match[0].length, '>',
      Math.min(source.length, match.index + 4096));
    if (end < 0) return null;
    const tag = source.slice(match.index, end);
    const outgoing = parseTagAttributes(tag, match[0].length);
    if (!outgoing) return null;
    // Freeze the identity and count of protected JSX opening tags even when
    // there are no behavior-bearing attributes. A bare <form>, <button> or
    // <iframe> can alter behavior by its presence alone; a UI-copy-only model
    // patch must not add, remove or swap such elements. Literal descriptive
    // attribute values may still change because they are excluded above.
    signatures.push(match[0].replace(/\s+/g, '').toLowerCase() +
      ':' + JSON.stringify(outgoing.sort()));
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
  // This is a UI-copy-only model task. Removing a pre-existing capability
  // can itself enable unsafe behavior (for example, dropping an iframe sandbox,
  // a disabled state or a restrictive form attribute). Reject missing signed
  // tags as well as newly introduced/changed ones. Literal descriptive copy
  // attributes are excluded above and may still be edited.
  return [...counts.values()].some((remaining) => remaining !== 0);
}
