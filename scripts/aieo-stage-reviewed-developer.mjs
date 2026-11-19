// Bound a deterministic developer patch to a FRESH, credential-free publishing runner.
// Neither untrusted dependencies nor candidate code runs in this privileged job.
import {
  lstatSync, readdirSync, readFileSync, writeFileSync, rmSync
} from 'node:fs';
import { join } from 'node:path';

const FILE = 'FeedbackWidget.tsx';
const MAX_BYTES = 48000;
function block() {
  throw new Error('AIEO developer artifact stage blocked: untrusted input');
}
function safeDirectory(path, uid, expectedEntries) {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() ||
      stat.uid !== uid || (stat.mode & 0o0022)) block();
  if (expectedEntries &&
      JSON.stringify(readdirSync(path).sort()) !==
      JSON.stringify([...expectedEntries].sort())) block();
}
function safeFile(path, uid) {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 ||
      before.uid !== uid || (before.mode & 0o0022) ||
      before.size < 1 || before.size > MAX_BYTES) block();
  const bytes = readFileSync(path);
  const after = lstatSync(path);
  if (bytes.length !== before.size || !after.isFile() ||
      after.isSymbolicLink() || after.nlink !== 1 || after.uid !== uid ||
      (after.mode & 0o0022) || after.dev !== before.dev ||
      after.ino !== before.ino || after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) block();
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) block();
  return bytes;
}

export function stageReviewedDeveloperArtifact({
  cwd = process.cwd(), env = process.env
} = {}) {
  // A supplied test environment cannot conceal credentials in the live process.
  // The publisher receives GH_TOKEN ONLY in the subsequent, separate step.
  if (['GH_TOKEN', 'GITHUB_TOKEN', 'OPENROUTER_API_KEY'].some(
    (name) => env[name] || process.env[name])) block();
  const uid = process.getuid?.();
  if (!Number.isSafeInteger(uid)) block();
  const staging = join(cwd, 'aieo-staging');
  const stagedComponents = join(staging, 'components');
  const trustedComponents = join(cwd, 'components');
  const target = join(trustedComponents, FILE);
  // Reject every extra artifact file, symlink, and unsafe directory before write.
  safeDirectory(staging, uid, ['components']);
  safeDirectory(stagedComponents, uid, [FILE]);
  safeDirectory(trustedComponents, uid);
  safeFile(target, uid);
  const candidate = safeFile(join(stagedComponents, FILE), uid);
  writeFileSync(target, candidate);
  rmSync(staging, { recursive: true });
  // The credentialed publisher independently reproduces the patch from HEAD
  // and re-attests the single-file Git diff before any remote write.
  return { status: 'developer-artifact-staged', files: 1 };
}

if (process.argv[1]?.endsWith('/aieo-stage-reviewed-developer.mjs')) {
  console.log(JSON.stringify(stageReviewedDeveloperArtifact()));
}
