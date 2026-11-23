// Synthetic, deliberately stale route-regex fixture for independent CI jobs.
// Never copy or modify repository application source and never call a provider.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APPROVED_TASK, developerAgent } from '../aieo/lib/engine.mjs';

const staleLine = String.raw`  const controlId = useMemo(() => /^\/controls\/(\d+)/.exec(pagePath)?.[1] ?? null, [pagePath]);`;
export const fixtureSource = ['function example() {', staleLine, '}', ''].join('\n');

export function prepareProposedFixture(root = 'aieo-fixture') {
  // Fail before writing if the deterministic Developer no longer proposes a fix.
  // This is deliberately a synthetic reproduction, not a production proof.
  const proposed = developerAgent({ task: APPROVED_TASK, source: fixtureSource });
  if (proposed.status !== 'proposed' || proposed.sourceHash === proposed.candidateHash) {
    throw new Error('AIEO CI fixture no longer exercises a proposed change');
  }
  mkdirSync(join(root, 'components'), { recursive: true, mode: 0o700 });
  mkdirSync(join(root, 'aieo-output'), { recursive: true, mode: 0o700 });
  writeFileSync(join(root, 'components', 'FeedbackWidget.tsx'), fixtureSource, {
    flag: 'wx', mode: 0o600
  });
  return { root, status: 'synthetic-proposed', productionChanges: false };
}

if (process.argv[1]?.endsWith('/aieo-fixture-source.mjs')) {
  const result = prepareProposedFixture();
  console.log(JSON.stringify(result));
}
