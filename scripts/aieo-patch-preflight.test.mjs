// Regression tests for the read-only AIEO patch preflight.
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const script = new URL('./aieo-patch-preflight.mjs', import.meta.url).pathname;
const patch = (file, extra='') => `diff --git a/${file} b/${file}
index 1111111..2222222 100644
--- a/${file}
+++ b/${file}
@@ -1 +1 @@
-old
+new
${extra}`;
const cases = [
  ['allow UI', patch('components/Button.tsx'), true],
  ['deny auth', patch('app/auth/page.tsx'), false],
  ['deny API', patch('app/api/route.ts'), false],
  ['deny migration', patch('supabase/migrations/1.sql'), false],
  ['deny binary', patch('components/Button.tsx', 'GIT binary patch'), false],
  ['deny deletion', patch('components/Button.tsx', 'deleted file mode 100644'), false],
  ['deny empty', '', false],
  ['deny multiple files', Array.from({length:4}, (_,i)=>patch(`components/C${i}.tsx`)).join('\n'), false],
  ['deny mismatched path', patch('components/Button.tsx').replace('+++ b/components/Button.tsx','+++ b/app/other.tsx'), false],
];
for (const [name, input, expected] of cases) {
  const r=spawnSync(process.execPath,[script],{input,encoding:'utf8'});
  assert.equal(r.status===0,expected,`${name}: ${r.stderr}`);
  console.log('PASS',name);
}
