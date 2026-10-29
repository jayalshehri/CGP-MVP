import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewCandidates} from './aieo-review-gate-v5.mjs';
import {CATALOG} from './aieo-proposal-policy-v2.mjs';
const c=CATALOG[1];
test('accept only catalog-pinned proposal',()=>{
 const x=reviewCandidates({candidates:[{...c}]},'/work',()=>c.before);
 assert.equal(x.candidates[0].status,'proposed');
 assert.equal(x.candidates[0].requiresHumanReview,true);
});
test('reject model-generated arbitrary change',()=>{
 const x=reviewCandidates({candidates:[{...c,after:'exec("rm -rf /")'}]},'/work',()=>c.before);
 assert.equal(x.candidates[0].status,'rejected');
});
test('reject external path and extra commands',()=>{
 const x=reviewCandidates({candidates:[{...c,path:'../../.env'},{...c,command:'bash'}]},'/work',()=>c.before);
 assert.deepEqual(x.candidates.map(y=>y.status),['rejected','rejected']);
});
test('source drift fails closed',()=>{
 const x=reviewCandidates({candidates:[{...c}]},'/work',()=> 'no matching content');
 assert.equal(x.candidates[0].status,'rejected');
});
test('candidate limit fails closed',()=>{
 assert.throws(()=>reviewCandidates({candidates:Array(11).fill(c)}),/Invalid candidate/);
});
