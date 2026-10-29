// Review-only intake gate for external/model candidate proposals.
// No model is called, no source files are edited, and no commands are executed.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CATALOG,checkProposal} from './aieo-proposal-policy-v2.mjs';
const MAX_BYTES=50000;
export function reviewCandidates(input,root=process.cwd(),read=(p)=>readFileSync(p,'utf8')){
 if(!input||!Array.isArray(input.candidates)||input.candidates.length>10)throw Error('Invalid candidate collection');
 const results=[];
 for(const candidate of input.candidates){
  const fail=(reason)=>({id:String(candidate?.id||'unknown').slice(0,70),status:'rejected',reason});
  if(!candidate||typeof candidate!=='object'||Object.keys(candidate).some(k=>!['id','path','before','after','rationale'].includes(k))){results.push(fail('invalid schema'));continue}
  if(!['id','path','before','after','rationale'].every(k=>typeof candidate[k]==='string')){results.push(fail('invalid field type'));continue}
  if(JSON.stringify(candidate).length>MAX_BYTES||candidate.rationale.length>400){results.push(fail('oversized candidate'));continue}
  const p=CATALOG.find(p=>p.id===candidate.id&&p.path===candidate.path&&p.before===candidate.before&&p.after===candidate.after);
  if(!p){results.push(fail('candidate not in approved catalog'));continue}
  const abs=resolve(root,p.path),rel=relative(root,abs);
  if(rel.startsWith('..')||isAbsolute(rel)){results.push(fail('unsafe path'));continue}
  try{
   const report=checkProposal(p,read(abs));
   results.push({id:p.id,path:p.path,status:report.status,sha256:report.sha256,rationale:candidate.rationale.slice(0,400),requiresHumanReview:true});
  }catch(e){results.push(fail('source drift or unsafe proposed change'))}
 }
 return {schema:5,mode:'review-only',noSourceWrites:true,candidates:results};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const file=process.argv[2]||'scripts/fixtures/aieo-review-candidates.json';
 const input=JSON.parse(readFileSync(file,'utf8'));
 const report=reviewCandidates(input);
 mkdirSync('aieo-output',{recursive:true});
 writeFileSync('aieo-output/review-v5.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({accepted:report.candidates.filter(x=>x.status==='proposed'||x.status==='already-applied').length,rejected:report.candidates.filter(x=>x.status==='rejected').length}));
}
