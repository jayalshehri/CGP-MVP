// AIEO v12: one synthetic live AI smoke test, no repo data or source-code transmission.
// Only invokes a gateway when explicitly authorized in a manual QA context.
import {qaReadiness} from './aieo-qa-readiness-v9.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const URL='https://ai-gateway.vercel.sh/v1/chat/completions';
export async function smoke({env,ref,event,transport=fetch}){
 const gate=qaReadiness(env,'refs/heads/aieo/qa-live-gate-v9'===ref?ref:'',event);
 // v12 branch is purpose-built, still require manual opt-in, no broad bypass.
 if(ref!=='refs/heads/aieo/live-smoke-v12'||event!=='workflow_dispatch'||!env?.AI_GATEWAY_API_KEY||env.AIEO_ENABLE_LIVE_AI!=='true'||!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i.test(env.AIEO_MODEL_ID||'')){
  return {status:'blocked',reason:'QA manual authorization or configuration missing'};
 }
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),10000);
 let response;
 try{response=await transport(URL,{method:'POST',signal:ac.signal,headers:{Authorization:'Bearer '+env.AI_GATEWAY_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:env.AIEO_MODEL_ID,max_tokens:120,temperature:0,stream:false,messages:[{role:'system',content:'Answer ONLY JSON of shape {"ok":true,"answer":42}. No other text.'},{role:'user',content:'Synthetic test: What is six multiplied by seven?'}]})});}finally{clearTimeout(timer)}
 if(!response?.ok)return {status:'failed',reason:'Gateway HTTP error'};
 const wire=await response.text();
 if(wire.length>16000)return {status:'failed',reason:'Oversize response'};
 let parsed;try{parsed=JSON.parse(wire)}catch{return {status:'failed',reason:'Invalid provider response'}}
 const content=parsed?.choices?.[0]?.message?.content;
 let result;try{result=JSON.parse(content)}catch{return {status:'failed',reason:'Non-JSON model response'}}
 return {status:result?.ok===true&&result?.answer===42?'passed':'failed',syntheticOnly:true,requestLimit:1};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await smoke({env:process.env,ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME});
 mkdirSync('aieo-output',{recursive:true});
 writeFileSync('aieo-output/smoke-v12.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
 if(result.status!=='passed')process.exitCode=1;
}
