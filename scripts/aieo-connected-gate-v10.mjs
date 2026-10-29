// AIEO v10: readiness must pass before any live transport is invoked.
import {modelReview} from './aieo-gateway-v8.mjs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export function checkLiveGate(env,ref,event){
 const issues=[];
 if(ref!=='refs/heads/aieo/qa-connected-gate-v10')issues.push('unapproved branch');
 if(event!=='workflow_dispatch')issues.push('manual event required');
 if(env.AIEO_ENABLE_LIVE_AI!=='true')issues.push('explicit opt-in required');
 if(!env.AI_GATEWAY_API_KEY)issues.push('missing key');
 if(!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i.test(env.AIEO_MODEL_ID||''))issues.push('invalid model');
 return {ready:issues.length===0,issues};
}
export async function runGated({env={},ref='',event='',diagnostics=[],transport,reader,root}){
 const gate=checkLiveGate(env,ref,event);
 if(!gate.ready)return {status:'blocked',reasons:gate.issues};
 const result=await modelReview({diagnostics,apiKey:env.AI_GATEWAY_API_KEY,model:env.AIEO_MODEL_ID,enabled:true,transport,reader,root});
 return {status:'review-only',result};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 // Explicit manual opt-in only; never print the model's response (potentially untrusted).
 const outcome=await runGated({env:process.env,ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME,
   diagnostics:[{path:'scripts/aieo-autonomous-v1.mjs',rule:'@typescript-eslint/no-unused-vars',message:'Unused mkdirSync import'}]});
 console.log(JSON.stringify({status:outcome.status,approvedForHumanReview:outcome.status==='review-only'}));
 if(outcome.status!=='review-only')process.exitCode=1;
}
