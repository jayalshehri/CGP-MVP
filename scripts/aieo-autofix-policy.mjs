// AIEO Auto-Fix policy gate. Fail closed on unsafe targets and unreviewed execution.
import fs from 'node:fs/promises';
const paths = process.argv.slice(2);
if (!paths.length) { console.error('No proposed file changes supplied'); process.exit(2); }
const allowed = [/^app\/(?!api\/)[\w./-]+\.(tsx?|css)$/, /^components\/[\w./-]+\.(tsx?|css)$/, /^lib\/[\w./-]+\.tsx?$/];
const denied = [
  /(^|\/)\.env/, /^\.github\//, /^supabase\//, /migration/i,
  /(^|\/)(auth|permissions|rls|security)(\/|\.)/i,
  /(^|\/)(package(-lock)?\.json|next\.config\.[^/]+|middleware\.[^/]+)$/,
  /(^|\/)\.git\//
];
let invalid = false;
for (const path of paths) {
  const ok = !path.includes('..') && !path.startsWith('/') && allowed.some(re => re.test(path)) && !denied.some(re => re.test(path));
  console.log((ok ? 'ALLOW ' : 'DENY ') + path);
  if (!ok) invalid = true;
}
if (invalid) process.exit(1);
console.log('File path policy passed; this does not certify the content of a patch.');
