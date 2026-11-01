// Reject obvious encoded/composed executable syntax in model-written code.
// The model proposal scope is presentation-only; these constructs have no
// legitimate need in a one-file bounded UI copy/class adjustment.
// Defense in depth only: lexical screening is not an AST/semantic proof.
export function introducesObfuscatedExecution(text) {
  if (typeof text !== 'string') return true;
  // JavaScript interprets Unicode/hex escapes inside identifiers and property
  // names, so literal token checks for globalThis, fetch, constructor, etc.
  // can otherwise miss a harmful symbol.
  const encodedIdentifier = /\\(?:u(?:\{[0-9a-f]{1,6}\}|[0-9a-f]{4})|x[0-9a-f]{2})/i;
  // Composed quoted property names bypass checks for plain constructor etc.
  // Reject computed concatenation conservatively, including JSX expressions.
  const composedComputedProperty = /\[\s*['"`][^\]\r\n]{1,90}\+\s*['"`]/;
  return encodedIdentifier.test(text) || composedComputedProperty.test(text);
}
