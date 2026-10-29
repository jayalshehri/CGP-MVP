import test from 'node:test';
import assert from 'node:assert/strict';
import {probe} from './aieo-openrouter-v13.mjs';
const env={AIEO_FREE_LIVE_ENABLED:'true',OPENROUTER_API_KEY:'synthetic',AIEO_FREE_MODEL_ID:'nvidia/nemotron-3.5-lightning:free'};
const ref='refs/heads/aieo/openrouter-free-v13';
test('no network on push, missing key, or paid model',async()=>{
 let calls=0;const transport=()=>{calls++;throw Error('network forbidden')};
 for(const options of [{event:'push'},{event:'workflow_dispatch',env:{...env,OPENROUTER_API_KEY:''}},{event:'workflow_dispatch',env:{...env,AIEO_FREE_MODEL_ID:'provider/paid'}}]){
  const r=await probe({env,ref,transport,...options});assert.equal(r.status,'blocked');
 }
 assert.equal(calls,0);
});
test('manual free model sends only bounded synthetic prompt',async()=>{
 let count=0;
 const transport=async(url,opt)=>{count++;assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');const body=JSON.parse(opt.body);assert.equal(body.model,env.AIEO_FREE_MODEL_ID);assert.ok(!JSON.stringify(body).includes('CGP-MVP'));return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:'42'}}]})}};
 const r=await probe({env,ref,event:'workflow_dispatch',transport});assert.equal(r.status,'passed');assert.equal(count,1);
});
test('API errors fail closed',async()=>{const r=await probe({env,ref,event:'workflow_dispatch',transport:async()=>({ok:false})});assert.equal(r.status,'failed')});
