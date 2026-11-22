// Manual, provider-backed proposal. Never sends source without explicit opt-in.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MODEL_ALLOWED_PATH, requestModelPatch } from '../aieo/lib/model-provider.mjs';

const source = readFileSync(MODEL_ALLOWED_PATH, 'utf8');
const task = process.env.AIEO_MODEL_TASK || '';
const result = await requestModelPatch({ source, task, env: process.env });

// Publish metadata only; never provider response, source, replacement or access token.
const redacted = {
  schemaVersion: 1,
  status: result.status,
  path: result.path || MODEL_ALLOWED_PATH,
  reason: result.reason || null,
  sourceHash: createHash('sha256').update(source).digest('hex'),
  proposedHash: result.proposedHash || null,
  changedBytes: result.changedBytes ?? null,
  sourceShared: process.env.AIEO_SOURCE_SHARING_APPROVED === 'true'
};
mkdirSync('aieo-output', { recursive: true });
writeFileSync('aieo-output/model-proposal.json', JSON.stringify(redacted, null, 2) + '\n');
console.log(JSON.stringify({ status: redacted.status, path: redacted.path, reason: redacted.reason, sourceShared: redacted.sourceShared }));

if (result.status !== 'proposed') process.exitCode = 1;
if (process.env.AIEO_MODEL_APPLY === '1') {
  if (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      process.env.GITHUB_REF !== 'refs/heads/main' ||
      process.env.AIEO_MODEL_ENABLED !== 'true' ||
      process.env.AIEO_SOURCE_SHARING_APPROVED !== 'true') {
    throw new Error('Untrusted invocation cannot apply model code');
  }
  if (result.status !== 'proposed') throw new Error('No valid model patch to apply');
  writeFileSync(MODEL_ALLOWED_PATH, result.patchedSource);
  console.log('Applied validated proposal to local workspace only; no commit or merge');
}
