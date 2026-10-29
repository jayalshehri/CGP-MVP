import test from 'node:test';
import assert from 'node:assert/strict';
import {modelReview} from './aieo-gateway-v8.mjs';
import {CATALOG} from './aieo-proposal-policy-v2.mjs';
const p=CATALOG[1];
const fake=(candidate)=>async(url,options)=>{
 assert.equal(url,'https://ai-gateway.vercel.sh/v1/chat/completions');
 assert.equal(options.method,'POST');
 assert.equal(options.headers.Authorization,'Bearer test-key');
 return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({schema:1,candidates:[candidate]})}}]})};
};
const args={diagnostics:[{path:p.path,rule:'@typescript-eslint/no-unused-vars',message:'unused import'}],apiKey:'test-key',model:'test/mock',enabled:true,root:'/work',reader:()=>p.before};
test('mocked gateway produces review-only valid proposal',async()=>{
 const result=await modelReview({...args,transport:fake({...p})});
 assert.equal(result.items[0].status,'proposed');
 assert.equal(result.sourceWriteAllowed,false);
});
test('unapproved generated change is rejected',async()=>{
 const result=await modelReview({...args,transport:fake({...p,after:'dangerous modification'})});
 assert.equal(result.items[0].status,'rejected');
});
test('disabled or missing credential fails before request',async()=>{
 await assert.rejects(modelReview({...args,enabled:false,transport:()=>{throw Error('called')}}),/disabled/);
 await assert.rejects(modelReview({...args,apiKey:'',transport:()=>{throw Error('called')}}),/credential/);
});
test('gateway errors fail closed',async()=>{
 await assert.rejects(modelReview({...args,transport:async()=>({ok:false})}),/Gateway request failed/);
});
