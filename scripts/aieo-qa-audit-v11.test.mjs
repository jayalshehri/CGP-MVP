import test from 'node:test';
import assert from 'node:assert/strict';
import {runGated} from './aieo-connected-gate-v10.mjs';
import {CATALOG} from './aieo-proposal-policy-v2.mjs';
const p=CATALOG[1];
const ref='refs/heads/aieo/qa-connected-gate-v10';
const env={AI_GATEWAY_API_KEY:'synthetic-test-only',AIEO_MODEL_ID:'test/mock',AIEO_ENABLE_LIVE_AI:'true'};
const response=(candidate)=>async()=>({ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({schema:1,candidates:[candidate]})}}]})});
test('end-to-end mock produces review-only proposal without repository writes',async()=>{
 const result=await runGated({env,ref,event:'workflow_dispatch',diagnostics:[{path:p.path,rule:'@typescript-eslint/no-unused-vars',message:'unused import'}],transport:response({...p}),root:'/work',reader:()=>p.before});
 assert.equal(result.status,'review-only');
 assert.equal(result.result.items[0].status,'proposed');
 assert.equal(result.result.sourceWriteAllowed,false);
});
test('end-to-end mock rejects new unauthorised patch',async()=>{
 const result=await runGated({env,ref,event:'workflow_dispatch',transport:response({...p,after:'inject arbitrary code'}),root:'/work',reader:()=>p.before});
 assert.equal(result.result.items[0].status,'rejected');
});
test('no model invocation if any gate condition fails',async()=>{
 let count=0;
 const transport=async()=>{count++;throw Error('must never call')};
 for(const changes of [{event:'push'},{ref:'refs/heads/main'},{env:{...env,AIEO_ENABLE_LIVE_AI:'false'}},{env:{...env,AI_GATEWAY_API_KEY:''}}]){
  const result=await runGated({env,ref,event:'workflow_dispatch',transport,...changes});
  assert.equal(result.status,'blocked');
 }
 assert.equal(count,0);
});
