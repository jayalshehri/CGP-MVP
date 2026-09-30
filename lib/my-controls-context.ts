// Durable personal-list context, never an arbitrary URL/open redirect.
export function myControlsFilters(raw: string) {
  const source = new URLSearchParams(raw), safe = new URLSearchParams();
  const framework = source.get('framework')?.toUpperCase();
  if (framework && /^[A-Z0-9_-]{1,40}$/.test(framework) && framework !== 'QA_SYNTH') safe.set('framework', framework);
  const status = source.get('status');
  if (status && ['implemented', 'in_progress', 'not_started', 'not_applicable'].includes(status)) safe.set('status', status);
  for (const key of ['evidence', 'assessment', 'findings', 'overdue', 'attention']) if (source.get(key) === '1') safe.set(key, '1');
  const q = source.get('q')?.slice(0, 200);
  if (q?.trim()) safe.set('q', q);
  return safe;
}
export function myControlsHref(raw = '') {
  const context = myControlsFilters(raw);
  return `/my-controls${context.size ? `?${context}` : ''}`;
}
export function myControlsOrigin(raw = '') {
  return new URLSearchParams({ from: 'my-controls', my_context: myControlsFilters(raw).toString() }).toString();
}
export function myControlsReturn(params: URLSearchParams): string | null {
  return params.get('from') === 'my-controls' ? myControlsHref(params.get('my_context') ?? '') : null;
}
