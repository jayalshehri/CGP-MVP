// Model chooses a bounded synthetic edit; no repository writes or patch application.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const fixture='components/AIEOFixture.tsx';
const expectedBefore='export const value = "broken";';
const expectedAfter='export const value = "fixed";';
const validate=(obj)=>{
 if(!obj || Object.keys(obj).sort().join(',')!=='after,before,path') throw Error('Unexpected model fields');
 if(obj.path!==fixture || obj.before!==expectedBefore || obj.after!==expectedAfter) throw Error('Proposal denied by exact fixture policy');
 return obj;
};
let proposed;
if(process.env.AIEO_TEST_MODE==='1'){
 proposed=JSON.parse(readFileSync('scripts/aieo-phase12-test-response.json','utf8'));
}else{
 const key=process.env.AIEO_OPENAI_API_KEY;
 if(!key) throw Error('Protected API key missing');
 const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),20000);
 try{
  const res=await fetch('https://api.openai.com/v1/responses',{
   method:'POST',signal:abort.signal,
   headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
   body:JSON.stringify({
    model:'gpt-4.1-mini',store:false,max_output_tokens:150,
    instructions:'Respond with JSON only: keys path, before, after. This is a synthetic fixture; propose only changing broken to fixed. No other fields or prose.',
    input:'File components/AIEOFixture.tsx contains: '+expectedBefore+' Suggest the exact single-line replacement.'
   })
  });
  if(!res.ok) throw Error('OpenAI HTTP '+res.status);
  const data=await res.json();
  const output=(data.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text||'').join('');
  proposed=JSON.parse(output);
 }finally{clearTimeout(timer)}
}
validate(proposed);
const patch=['diff --git a/'+fixture+' b/'+fixture,'index 1111111..2222222 100644','--- a/'+fixture,'+++ b/'+fixture,'@@ -1 +1 @@','-'+proposed.before,'+'+proposed.after,''].join('\n');
mkdirSync('aieo-reports',{recursive:true});
writeFileSync('aieo-reports/phase12-model-proposal.patch',patch,{mode:0o600});
console.log('PASS: bounded synthetic proposal serialized, NOT applied');
