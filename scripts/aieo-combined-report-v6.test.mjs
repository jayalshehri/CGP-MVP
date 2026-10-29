import test from 'node:test';
import assert from 'node:assert/strict';
import {combine} from './aieo-combined-report-v6.mjs';
import {CATALOG} from './aieo-proposal-policy-v2.mjs';
const c=CATALOG[1], root='/work';
test('matched lint can surface allowlisted review suggestion',()=>{
 const lint=[{filePath:'/work/scripts/aieo-autonomous-v1.mjs',messages:[{ruleId:'@typescript-eslint/no-unused-vars',severity:1,line:3,message:'unused'}]}];
 const r=combine(lint,{candidates:[{...c}]},root,()=>c.before);
 assert.equal(r.summary.review,1);assert.equal(r.proposals[0].action,'review');
 assert.equal(r.requiresHumanApproval,true);
});
test('do not recommend unobserved change',()=>{
 const r=combine([],{candidates:[{...c}]},root,()=>c.before);
 assert.equal(r.summary.held,1);assert.equal(r.proposals[0].action,'hold');
});
test('reject untrusted model candidate',()=>{
 const r=combine([],{candidates:[{...c,path:'../../secrets'}]},root,()=>c.before);
 assert.equal(r.summary.rejected,1);
});
