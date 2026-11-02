// Manual, provider-backed proposal. Never sends source without explicit opt-in.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MODEL_ALLOWED_PATH, requestModelPatch } from '../aieo/lib/model-provider.mjs';
import { attestModelProposalWorkspace } from '../aieo/lib/model-workspace-attestation.mjs';
import { readApprovedSource } from '../aieo/lib/safe-source.mjs';

// Fail closed before any approved source leaves this checkout. In particular,
// never follow a redirected source or write a redirected proposal artifact.
attestModelProposalWorkspace(MODEL_ALLOWED_PATH);
// Read approved bytes from an inode-checked descriptor; do not let UTF-8
// replacement characters silently alter the source before consent matching.
const source = readApprovedSource();
const task = process.env.AIEO_MODEL_TASK || '';
const result = await requestModelPatch({ source, task, env: process.env });

// If an approved model result will be applied, verify the original approved
// source bytes AGAIN before emitting a success-shaped report. A provider request
// is an asynchronous boundary: a post-request file can decode to the same UTF-8
// string despite containing newly invalid bytes. The strict descriptor reader
// must reject that ambiguity, rather than reporting a proposed fix as applied.
if (result.status === 'proposed' && process.env.AIEO_MODEL_APPLY === '1') {
  attestModelProposalWorkspace(MODEL_ALLOWED_PATH);
  if (readApprovedSource() !== source) {
    throw new Error('Approved model source changed before local apply');
  }
}

// Publish metadata only; never provider response, source, replacement or access token.
const redacted = {
  schemaVersion: 1,
  status: result.status,
  path: result.path || MODEL_ALLOWED_PATH,
  reason: result.reason || null,
  sourceHash: createHash('sha256').update(source).digest('hex'),
  proposedHash: result.proposedHash || null,
  changedBytes: result.changedBytes ?? null,
  sourceShared: result.status !== 'blocked' // transport attempted, not merely user opt-in
};
// The provider request is a separate await boundary: attest again before
// writing reports, including an existing report replaced by a hard/symlink.
attestModelProposalWorkspace(MODEL_ALLOWED_PATH);
mkdirSync('aieo-output', { recursive: true });
attestModelProposalWorkspace(MODEL_ALLOWED_PATH);
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
  // Do not overwrite source bytes that changed after consent/remote review.
  attestModelProposalWorkspace(MODEL_ALLOWED_PATH);
  if (readApprovedSource() !== source) {
    throw new Error('Approved model source changed before local apply');
  }
  writeFileSync(MODEL_ALLOWED_PATH, result.patchedSource);
  console.log('Applied validated proposal to local workspace only; no commit or merge');
}
