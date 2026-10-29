// Offline model-output admission gate: model data is untrusted and never executed.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {reviewCandidates} from './aieo-review-gate-v5.mjs';
const allowedKeys=new Set(['schema','candidates']);
export function admit(input,root=process.cwd(),read){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowedKeys.has(k))||input.schema!==1)throw Error('invalid model envelope');
 if(!Array.isArray(input.candidates)||input.candidates.length>5)throw Error('candidate count exceeded');
 for(const candidate of input.candidates){
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))throw Error('invalid candidate object');
  if(Object.values(candidate).some(v=>typeof v!=='string'))throw Error('non-string field rejected');
 }
 const result=reviewCandidates({candidates:input.candidates},root,read);
 return {schema:7,mode:'offline-model-output-review',modelInvoked:false,sourceWriteAllowed:false,reviewRequired:true,items:result.candidates};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const file=process.argv[2]||'scripts/fixtures/aieo-model-response-v7.json';
 const envelope=JSON.parse(readFileSync(file,'utf8'));
 const report=admit(envelope);
 mkdirSync('aieo-output',{recursive:true});
 writeFileSync('aieo-output/model-review-v7.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({items:report.items.length,accepted:report.items.filter(x=>x.status==='proposed').length}));
}
