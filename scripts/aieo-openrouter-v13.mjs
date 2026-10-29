// One synthetic, manual-only OpenRouter free-model probe. Never reads CGP source or writes GitHub.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const URL='https://openrouter.ai/api/v1/chat/completions';
export async function probe({env={},ref='',event='',transport=fetch}={}){
 if(ref!=='refs/heads/aieo/openrouter-free-v13'||event!=='workflow_dispatch'||env.AIEO_FREE_LIVE_ENABLED!=='true'||!env.OPENROUTER_API_KEY||typeof env.AIEO_FREE_MODEL_ID!=='string'||!/^[-a-z0-9_.]+\/[-a-z0-9_.]+:free$/i.test(env.AIEO_FREE_MODEL_ID))
   return {status:'blocked',reason:'Manual QA authorization or free model configuration missing'};
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),12000);
 let response;
 try{response=await transport(URL,{method:'POST',signal:ac.signal,headers:{Authorization:'Bearer '+env.OPENROUTER_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:env.AIEO_FREE_MODEL_ID,max_tokens:100,temperature:0,stream:false,messages:[{role:'system',content:'Respond with only the integer 42.'},{role:'user',content:'Synthetic math test: 6 times 7?'}]})});}finally{clearTimeout(timer)}
 if(!response?.ok)return {status:'failed',reason:'Model API HTTP error'};
 const wire=await response.text();
 if(wire.length>12000)return {status:'failed',reason:'Oversized output'};
 let obj;try{obj=JSON.parse(wire)}catch{return {status:'failed',reason:'Invalid response JSON'}}
 const answer=obj?.choices?.[0]?.message?.content;
 return {status:typeof answer==='string'&&answer.trim()==='42'?'passed':'failed',syntheticOnly:true,requests:1};
}
if(process.argv[1]?.endsWith('/aieo-openrouter-v13.mjs')){
 const result=await probe({env:process.env,ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME});
 mkdirSync('aieo-output',{recursive:true});
 writeFileSync('aieo-output/openrouter-smoke-v13.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
 if(result.status!=='passed')process.exitCode=1;
}
