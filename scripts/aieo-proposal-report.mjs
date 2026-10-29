// Read-only, deterministic patch proposal. No source writes and no credentials.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const proposals = [
  {
    id: 'feedback-control-route-boundary',
    path: 'components/FeedbackWidget.tsx',
    before: 'const controlId = useMemo(() => /^\\/controls\\/(\\d+)/.exec(pagePath)?.[1] ?? null, [pagePath]);',
    after: 'const controlId = useMemo(() => /^\\/controls\\/(\\d+)(?:\\/|$)/.exec(pagePath)?.[1] ?? null, [pagePath]);',
    rationale: 'Avoid partial matching of control IDs such as /controls/123garbage.'
  }
];
const output = [];
for (const p of proposals) {
  const source = readFileSync(p.path, 'utf8');
  const occurrences = source.split(p.before).length - 1;
  const applied = source.includes(p.after);
  if (occurrences !== 1 && !applied) throw Error('Source drift detected: ' + p.id);
  if (occurrences > 1) throw Error('Ambiguous replacement: ' + p.id);
  const next = occurrences === 1 ? source.replace(p.before, p.after) : source;
  output.push({
    id: p.id, path: p.path,
    status: occurrences === 1 ? 'proposed' : 'already-applied',
    sha256: createHash('sha256').update(source).digest('hex'),
    rationale: p.rationale,
    before: p.before, after: p.after,
    changed: next !== source
  });
}
mkdirSync('aieo-output', { recursive: true });
writeFileSync('aieo-output/proposals.json', JSON.stringify({ schema: 1, proposals: output }, null, 2) + '\n');
console.log(JSON.stringify({ proposals: output.map(({ id, status, path }) => ({ id, status, path })) }));
