import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const source='components/AIEOFixture.tsx';
const before='export const value = "broken";\n';
const after='export const value = "fixed";\n';
const patch=['diff --git a/'+source+' b/'+source,'index 1111111..2222222 100644','--- a/'+source,'+++ b/'+source,'@@ -1 +1 @@','-'+before.trimEnd(),'+'+after.trimEnd(),''].join('\n');
const test=spawnSync(process.execPath,['scripts/aieo-patch-preflight.mjs'],{input:patch,encoding:'utf8'});
if(test.status!==0) throw Error('Patch policy rejected fixture: '+test.stderr);
if(before.replace('"broken"','"fixed"')!==after) throw Error('Deterministic repair did not match expected fixture');
mkdirSync('aieo-reports',{recursive:true});
writeFileSync('aieo-reports/autofix-dry-run.md',[
'# AIEO Auto-Fix dry run',
'',
'Mode: deterministic fixture; no model invocation and no repository source edits.',
'Patch metadata policy: PASS',
'Fixture expected output: PASS',
'Draft PR creation by an autonomous agent: NOT ENABLED',
'',
'Next gates: untrusted patch content inspection, sandbox isolation, bounded OpenAI request, lint/typecheck/build, and limited GitHub write credentials.'
].join('\n'));
console.log('PASS: isolated dry-run fixture and read-only patch preflight');
