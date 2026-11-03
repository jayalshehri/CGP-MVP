// Hard cost gate for AIEO. Only OpenRouter's free router or explicitly
// free-suffixed variants are eligible. Never silently route to a paid model.
// This guards configured model IDs, not third-party provider data retention.
export const DEFAULT_FREE_MODEL = 'openrouter/free';
export function isFreeOnlyModel(model) {
  if (typeof model !== 'string' || model !== model.trim() || model.length > 160) return false;
  if (model === DEFAULT_FREE_MODEL) return true;
  return /^[a-z0-9_.-]+\/[a-z0-9_.:-]+:free$/i.test(model);
}
export function requireFreeModel(model) {
  if (!isFreeOnlyModel(model)) throw new Error('AIEO requires an explicitly free OpenRouter model');
  return model;
}
