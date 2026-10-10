// AIEO patch inspection: fail closed on unsafe patch metadata.
// This is a read-only preflight, not authorization to apply a patch.
import { readFileSync } from 'node:fs';
const patch = readFileSync(0, 'utf8');
if (!patch.trim() || patch.length > 100_000) throw Error('Empty or oversized patch');
const lines = patch.split('\n');
const files = [];
for (const line of lines) {
  if (line.startsWith('diff --git ')) {
    const match = /^diff --git a\/(\S+) b\/(\S+)$/.exec(line);
    if (!match || match[1] !== match[2]) throw Error('Renames or malformed diff headers denied');
    files.push(match[1]);
  }
  if (/^(GIT binary patch|Binary files |new file mode |deleted file mode |rename from |rename to |copy from |copy to |old mode |new mode |Submodule )/.test(line)) throw Error('Binary, new/deleted, renamed or mode-changing files denied');
}
if (!files.length || files.length > 3 || new Set(files).size !== files.length) throw Error('Invalid file count');
const allowed = /^((app\/(?!api\/)|components\/)[a-zA-Z0-9_./-]+\.(tsx|css))$/;
const denied = /(^|\/)(auth|security|permissions|middleware|rls)(\/|\.)|\.\.|(^|\/)\.env|(^|\/)\.github\//i;
for (const f of files) if (!allowed.test(f) || denied.test(f)) throw Error('Unsafe path: ' + f);
for (const line of lines) {
  if (/^(---|\+\+\+) /.test(line) && !files.some(f => line === '--- a/' + f || line === '+++ b/' + f)) throw Error('Mismatched patch file path');
}
console.log('Read-only patch metadata preflight passed; content review and sandbox still required.');
