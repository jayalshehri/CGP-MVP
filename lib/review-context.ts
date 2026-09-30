// URL-only context, independent of any workflow/authorization projection.
export function reviewQueueContext(raw: string) {
  const source = new URLSearchParams(raw), safe = new URLSearchParams();
  for (const key of ['type', 'framework', 'responsibility', 'state', 'due', 'page']) {
    const value = source.get(key);
    if (value && value.length <= 100 && (key !== 'page' || (/^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0))) safe.set(key, value);
  }
  return safe.toString();
}
export function reviewContextReturn(params: URLSearchParams) {
  if (params.get('from') !== 'review') return null;
  const context = reviewQueueContext(params.get('review_context') ?? '');
  return '/review' + (context ? '?' + context : '');
}
