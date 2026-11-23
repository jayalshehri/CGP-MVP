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
// JSX identifiers may also begin with $ or _ or contain $ (e.g. <$Widget />,
// <_widget /> and <UI.$Panel />). They are component references, not inert text.
// Non-ASCII JSX identifiers are legal in JavaScript (e.g. <ÉWidget /> or
// <组件 />). Treat them as opaque components even when their name starts with
// a lowercase letter; a UI-copy patch must not mount existing side effects.
// The Unicode branch requires a non-ASCII code point *in the tag name* so
// ordinary lowercase text/comparisons do not become JSX tags.
// Match native HTML names only when the *entire tag name* ends, so <a-custom>
// is not accidentally parsed as an invalid <a> opening tag.
// SVG container elements can change
// the resolution of existing relative URLs via xmlBase / xml:base, even if
// no href/src is added. Do not let those opening tags evade
// full-source comparison merely because they are not native HTML tag names.
const tagStart = /<\s*(?:(?:p|pre|nav|details|summary|dialog|textarea|select|option|optgroup|fieldset|legend|figure|figcaption|output|progress|meter|time|code|kbd|samp|b|i|u|s|mark|abbr|address|cite|dfn|sub|sup|hr|wbr|br|dl|dt|dd|thead|tbody|tfoot|col|colgroup|caption|menu|template|slot|map|param|hgroup|ruby|rt|rp|bdi|bdo|div|span|section|article|main|header|footer|aside|label|strong|em|small|h[1-6]|ul|ol|li|table|tr|td|th|blockquote|q|del|ins|body|html|picture|canvas|a|area|svg|g|defs|symbol|foreignObject|path|rect|circle|ellipse|line|polyline|polygon|text|tspan|stop|img|image|feImage|use|iframe|script|link|meta|base|form|input|button|video|audio|source|track|embed|object|animate|animateMotion|animateTransform|set|textPath|mpath|pattern|linearGradient|radialGradient|filter|mask|clipPath|marker|cursor|fontFaceUri|font-face-uri|style)(?=[\s/>])|[A-Z_$][\w$.:-]*(?=[\s/>])|[a-z][\w$]*(?:\.[A-Za-z_$][\w$]*)+(?=[\s/>])|[a-z][\w.]*[-:][\w.:-]+(?=[\s/>])|(?=[^\s/>]*[^\x00-\x7F])[\p{ID_Start}$_][\p{ID_Continue}$_.:-]*(?=[\s/>]))/gu;
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
// text-only copy props on recognized intrinsic elements; expressions can invoke existing side-effecting callbacks.
const inertLiteralCopyProps = new Set(['alt', 'title', 'placeholder', 'aria-label', 'aria-description']);
// An interactive or navigation-capable element can change browser behavior
// even without src, href or callback props. Freeze these element types by
// their identity and count; inert presentation markup and illustrative
// markup-shaped text are not new capabilities by themselves.
// React's intrinsic SVG elements include camelCase names; these are not
// opaque user-defined components, so their static label copy stays editable.
const intrinsicSvgNames = new Set([
  'foreignObject', 'feImage', 'animateMotion', 'animateTransform',
  'textPath', 'linearGradient', 'radialGradient', 'clipPath', 'fontFaceUri',
  'font-face-uri'
]);
// JSX <style> can run CSS imports and other behavior even without props;
// its presence/count is not an inert text edit.
const structuralEffectTags = new Set([
  'a', 'area', 'audio', 'base', 'button', 'details', 'dialog', 'embed',
  'form', 'iframe', 'input', 'link', 'meta', 'object', 'option', 'script',
  'select', 'source', 'style', 'summary', 'textarea', 'track', 'video'
]);
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
function parseTagAttributes(tag, prefixLength, opaqueComponent) {
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
      outgoing.push('boolean:' + name);
      continue;
    }
    cursor++;
    const end = readValue(tag, cursor);
    if (end < 0) return null;
    const value = tag.slice(cursor, end).trim();
    const literal = (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    // Component props are opaque to this guard: even a quoted title or aria-label
    // may trigger custom rendering, navigation, or side effects in user code.
    if (opaqueComponent || !inertLiteralCopyProps.has(name.toLowerCase()) || !literal) {
      outgoing.push(name + '=' + value);
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
    const tagName = match[0].slice(1).trim();
    // Uppercase React components, dotted members, namespaced JSX and web
    // components execute arbitrary existing code when mounted. Their presence
    // and *every* prop value must remain unchanged in a copy-only patch.
    // Unknown plain lowercase HTML tags are not recognized by this scanner.
    const opaqueComponent = (/[A-Z.$:-]/.test(tagName) || tagName.startsWith('_') ||
      /[^\x00-\x7F]/.test(tagName)) &&
      !intrinsicSvgNames.has(tagName);
    const outgoing = parseTagAttributes(tag, match[0].length, opaqueComponent);
    if (!outgoing) return null;
    // Even attribute-free <form>, <button> and <iframe> have browser
    // semantics. Do not let a UI-copy-only patch add, remove or replace them.
    // Keep the earlier behavior-prop signatures for all recognized JSX tags.
    if (outgoing.length || structuralEffectTags.has(tagName.toLowerCase()) || opaqueComponent) {
      // Preserve prop order: JSX spreads and explicit props apply left-to-right,
      // so sorting would hide callback/URL precedence changes.
      // Preserve casing: React component names and prop keys are case-sensitive.
      // Lowercasing the signature could hide an effectful component swap.
      signatures.push(match[0].replace(/\s+/g, '') +
        ':' + JSON.stringify(outgoing));
    }
  }
  return signatures;
}

// Comparing only behavior-bearing *opening* tags misses moving a closing
// boundary across an existing interactive child. That can reparent an unchanged
// handler, form or button without editing a single event prop. In this bounded
// copy-only workflow, preserve the entire JSX tag timeline (including inert
// wrappers and closing tags) while still allowing their descriptive text and
// literal labels to change. This deliberately does not claim to parse TSX.
function jsxStructureTimeline(source) {
  const events = [];
  for (const match of source.matchAll(tagStart)) {
    const end = scanEnd(source, match.index + match[0].length, '>',
      Math.min(source.length, match.index + 4096));
    if (end < 0) return null;
    const tag = source.slice(match.index, end);
    events.push([match.index, 'open:' + match[0].slice(1).trim() +
      (/\\/\\s*>$/.test(tag) ? ':self' : '')]);
  }
  // Closing tags are behaviorally significant even with no attributes:
  // </div><button ...> and <button ...></div> have different ancestry.
  for (const match of source.matchAll(/<\\s*\\/\\s*([\\p{ID_Start}$_][\\p{ID_Continue}$_.:-]*)\\s*>/gu)) {
    events.push([match.index, 'close:' + match[1]]);
  }
  // JSX fragments also change tree boundaries despite carrying no props.
  for (const match of source.matchAll(/<\\s*\\/?>/g)) {
    events.push([match.index, match[0].includes('/') ? 'fragment-close' : 'fragment-open']);
  }
  events.sort((a, b) => a[0] - b[0]);
  return events.map((event) => event[1]);
}

export function introducesOutboundTagAttribute(original, candidate) {
  if (typeof original !== 'string' || typeof candidate !== 'string') return true;
  const before = outboundTagSignatures(original);
  const after = outboundTagSignatures(candidate);
  if (!before || !after) return true; // malformed or ambiguous markup: fail closed
  const originalShape = jsxStructureTimeline(original);
  const candidateShape = jsxStructureTimeline(candidate);
  if (!originalShape || !candidateShape || originalShape.length !== candidateShape.length ||
      originalShape.some((entry, index) => entry !== candidateShape[index])) return true;
  // Ordered signatures are necessary: a multiset would accept moving the
  // same two buttons/links/components past each other, changing which action
  // the user reaches first while preserving each tag's individual props.
  // Bounded copy edits must not reorder any behavior-bearing tag. Descriptive
  // text and inert literal copy attributes remain outside these signatures.
  if (before.length !== after.length) return true;
  return before.some((entry, index) => entry !== after[index]);
}
