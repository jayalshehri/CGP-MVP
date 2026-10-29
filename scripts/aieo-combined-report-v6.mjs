// Combine actual ESLint JSON with strict proposal review. Read-only, no model call.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {correlate} from './aieo-live-eslint-v4.mjs';
import {reviewCandidates} from './aieo-review-gate-v5.mjs';
import {CATALOG} from './aieo-proposal-policy-v2.mjs';
export function combine(lintJson, candidates, root=process.cwd(), reader){
 const report=correlate(lintJson,root,reader);
 const review=reviewCandidates(candidates,root,reader);
 const supported=review.candidates.map(item=>{
   if(item.status!=='proposed'&&item.status!=='already-applied')return item;
   const related=report.diagnostics.some(d=>d.path===item.path && CATALOG.some(p=>p.id===item.id && (p.id==='remove-unused-mkdir-import'?d.rule==='@typescript-eslint/no-unused-vars':false)));
   return {...item,action:related?'review':'hold',diagnosticMatch:related};
 });
 return {schema:6,readOnly:true,requiresHumanApproval:true,
   diagnostics:report.diagnostics,proposals:supported,
   summary:{diagnostics:report.diagnostics.length,review:supported.filter(p=>p.action==='review').length,held:supported.filter(p=>p.action==='hold').length,rejected:supported.filter(p=>p.status==='rejected').length}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const lint=JSON.parse(readFileSync('aieo-output/eslint.json','utf8'));
 const candidates=JSON.parse(readFileSync('scripts/fixtures/aieo-review-candidates.json','utf8'));
 const output=combine(lint,candidates);
 mkdirSync('aieo-output',{recursive:true});
 writeFileSync('aieo-output/combined-report-v6.json',JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify(output.summary));
}
