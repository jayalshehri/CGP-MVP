import test from 'node:test';
import assert from 'node:assert/strict';
import {runGated} from './aieo-connected-gate-v10.mjs';
import {CATALOG} from './aieo-proposal-policy-v2.mjs';
const p=CATALOG[1], ref='refs/heads/aieo/qa-connected-gate-v10';
const env={AI_GATEWAY_API_KEY:'mock-secret',AIEO_MODEL_ID:'test/mock',AIEO_ENABLE_LIVE_AI:'true'};
test('push and invalid environment never call model',async()=>{
 let calls=0;
 const transport=()=>{calls++;throw Error('must not run')};
 const x=await runGated({env,ref,event:'push',transport});
 assert.equal(x.status,'blocked');
 const y=await runGated({env:{},ref,event:'workflow_dispatch',transport});
 assert.equal(y.status,'blocked');
 assert.equal(calls,0);
});
test('manual QA gate invokes mock transport and remains review only',async()=>{
 let calls=0;
 const transport=async()=>{calls++;return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({schema:1,candidates:[{...p}]})}}]})}};
 const x=await runGated({env,ref,event:'workflow_dispatch',transport,root:'/work',reader:()=>p.before,diagnostics:[]});
 assert.equal(calls,1);
 assert.equal(x.status,'review-only');
 assert.equal(x.result.sourceWriteAllowed,false);
});
test('wrong branch fails closed before transport',async()=>{
 const x=await runGated({env,ref:'refs/heads/main',event:'workflow_dispatch',transport:()=>{throw Error('unwanted call')}});
 assert.equal(x.status,'blocked');
});
