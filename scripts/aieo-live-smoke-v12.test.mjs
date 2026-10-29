import test from 'node:test';
import assert from 'node:assert/strict';
import {smoke} from './aieo-live-smoke-v12.mjs';
const env={AIEO_ENABLE_LIVE_AI:'true',AI_GATEWAY_API_KEY:'mock-secret',AIEO_MODEL_ID:'test/mock'};
const ref='refs/heads/aieo/live-smoke-v12';
test('denied by default, no network',async()=>{let called=0;const transport=()=>{called++;throw Error('unsafe')};const r=await smoke({env,ref,event:'push',transport});assert.equal(r.status,'blocked');assert.equal(called,0)});
test('authorized manual execution sends only synthetic question',async()=>{let count=0;const transport=async(u,o)=>{count++;assert.equal(u,'https://ai-gateway.vercel.sh/v1/chat/completions');assert.equal(o.method,'POST');assert.equal(o.headers.Authorization,'Bearer mock-secret');const body=JSON.stringify(JSON.parse(o.body));assert.ok(body.includes('six multiplied by seven'));assert.ok(!body.includes('CGP-MVP'));return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:'{"ok":true,"answer":42}'}}]})}};const r=await smoke({env,ref,event:'workflow_dispatch',transport});assert.equal(r.status,'passed');assert.equal(count,1)});
test('bad response rejects',async()=>{const r=await smoke({env,ref,event:'workflow_dispatch',transport:async()=>({ok:false})});assert.equal(r.status,'failed')});
