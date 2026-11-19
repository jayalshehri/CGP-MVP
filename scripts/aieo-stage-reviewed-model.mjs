// Import a bounded model candidate into a FRESH, credential-free publisher job.
// Build/provider code runs on a different runner; do not execute its artifact.
import { existsSync, lstatSync, readdirSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = 'FeedbackWidget.tsx';
const REPORTS = ['model-proposal.json', 'model-qa.json',
  'model-security.json', 'model-reviewer.json'];
function block() { throw new Error('AIEO model artifact stage blocked: unexpected or unsafe input'); }
function checkDirectory(path, uid, names) {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== uid ||
      (stat.mode & 0o0022)) block();
  const actual = readdirSync(path).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...names].sort())) block();
}
function checkedBytes(path, uid, maxBytes, json = false) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 ||
      stat.uid !== uid || (stat.mode & 0o0022) ||
      stat.size < 1 || stat.size > maxBytes) block();
  const bytes = readFileSync(path);
  if (bytes.length !== stat.size) block();
  const decoded = bytes.toString('utf8');
  if (!Buffer.from(decoded, 'utf8').equals(bytes)) block();
  if (json) {
    const parsed = JSON.parse(decoded);
    if (decoded !== JSON.stringify(parsed, null, 2) + '\n') block();
  }
  return bytes;
}

export function stageReviewedModelArtifact({ cwd = process.cwd(), env = process.env } = {}) {
  // A downloaded candidate is never read while either GitHub write credentials
  // or the external model credential is present in this process.
  if (['GH_TOKEN', 'GITHUB_TOKEN', 'OPENROUTER_API_KEY'].some((key) =>
    env[key] || process.env[key])) block();
  const uid = process.getuid?.();
  if (!Number.isSafeInteger(uid)) block();
  const staging = join(cwd, 'aieo-staging');
  const sourceDir = join(staging, 'components');
  const reportDir = join(staging, 'aieo-output');
  const source = join(cwd, 'components', SOURCE);
  const targetDir = join(cwd, 'aieo-output');
  // Reject any unexpected payload or path BEFORE modifying the clean checkout.
  checkDirectory(staging, uid, ['components', 'aieo-output']);
  checkDirectory(sourceDir, uid, [SOURCE]);
  checkDirectory(reportDir, uid, REPORTS);
  const candidate = checkedBytes(join(sourceDir, SOURCE), uid, 48000);
  const reports = REPORTS.map((name) =>
    [name, checkedBytes(join(reportDir, name), uid, 65536, true)]);
  const original = lstatSync(source);
  if (!original.isFile() || original.isSymbolicLink() ||
      original.nlink !== 1 || original.uid !== uid ||
      (original.mode & 0o0022) || existsSync(targetDir)) block();
  // No untrusted candidate is executed, installed as a dependency or loaded as
  // an import. The privileged publisher independently rechecks Git and reports.
  writeFileSync(source, candidate);
  mkdirSync(targetDir, { mode: 0o700 });
  for (const [name, bytes] of reports) {
    writeFileSync(join(targetDir, name), bytes, { flag: 'wx', mode: 0o600 });
  }
  // The publisher rejects every untracked input outside aieo-output.
  rmSync(staging, { recursive: true });
  return { status: 'reviewed-artifact-staged', fileCount: 1 + reports.length };
}

if (process.argv[1]?.endsWith('/aieo-stage-reviewed-model.mjs')) {
  console.log(JSON.stringify(stageReviewedModelArtifact()));
}
