// Phase 7: structural validation of the entire unified diff.
// Read-only. This is NOT a sandbox, semantic security review, or authorization to apply.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const patch = readFileSync(0, 'utf8');
const policy = spawnSync(process.execPath, ['scripts/aieo-patch-preflight.mjs'], {
  input: patch, encoding: 'utf8', maxBuffer: 256_000
});
if (policy.status !== 0) throw Error('Metadata policy denied patch: ' + policy.stderr.trim());
const fail = (reason) => { throw Error('Invalid unified diff: ' + reason); };
if (patch.includes('\r') || patch.includes('\0')) fail('CR or NUL denied');
const lines = patch.split('\n');
let i = 0, totalAdded = 0, files = 0, hunks = 0;
while (i < lines.length && lines[i] !== '') {
  const header = /^diff --git a\/(\S+) b\/\1$/.exec(lines[i]);
  if (!header) fail('expected diff --git at line ' + (i + 1));
  const path = header[1]; files++; i++;
  if (i < lines.length && /^index [0-9a-f]{7,64}\.\.[0-9a-f]{7,64} 100644$/.test(lines[i])) i++;
  if (lines[i++] !== '--- a/' + path || lines[i++] !== '+++ b/' + path) fail('file marker mismatch');
  let fileHunks = 0;
  while (i < lines.length && lines[i].startsWith('@@ ')) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/.exec(lines[i++]);
    if (!m) fail('malformed hunk header');
    let oldLeft = m[2] === undefined ? 1 : Number(m[2]);
    let newLeft = m[4] === undefined ? 1 : Number(m[4]);
    if (oldLeft > 300 || newLeft > 300 || ++hunks > 12) fail('hunk size/count limit');
    fileHunks++;
    let seenLine = false, previousContent = false;
    while (i < lines.length && (oldLeft > 0 || newLeft > 0)) {
      const line = lines[i++];
      if (line.startsWith('\\ No newline at end of file')) {
        if (!previousContent) fail('orphan missing-newline marker');
        previousContent = false; continue;
      }
      if (line === undefined || !/^[ +\-]/.test(line)) fail('unexpected content or truncated hunk');
      if (line.startsWith(' ')) { oldLeft--; newLeft--; }
      else if (line.startsWith('-')) oldLeft--;
      else { newLeft--; totalAdded++; }
      if (oldLeft < 0 || newLeft < 0 || totalAdded > 200) fail('hunk line-count / addition limit');
      seenLine = true; previousContent = true;
    }
    if (!seenLine) fail('empty hunk');
  }
  if (!fileHunks) fail('missing hunk');
  if (lines[i] === '') break;
  if (i < lines.length && !lines[i].startsWith('diff --git ')) fail('unrecognized content outside hunk');
}
if (i !== lines.length - 1 || lines[i] !== '' || files < 1) fail('trailing content or missing final newline');
console.log('PASS: full unified-diff structure and bounds; sandbox and semantic review still required.');
