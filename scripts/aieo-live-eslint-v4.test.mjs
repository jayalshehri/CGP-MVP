import test from 'node:test';
import assert from 'node:assert/strict';
import {correlate} from './aieo-live-eslint-v4.mjs';
const file='/work/scripts/aieo-autonomous-v1.mjs';
const before="import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';";
test('matches real ESLint JSON warning to approved proposal',()=>{
 const r=correlate([{filePath:file,messages:[{ruleId:'@typescript-eslint/no-unused-vars',severity:1,line:3,column:36,message:'unused mkdirSync'}]}],'/work',()=>before);
 assert.equal(r.summary.proposed,1);
 assert.equal(r.proposals[0].id,'remove-unused-mkdir-import');
});
test('never generates arbitrary code changes',()=>{
 const r=correlate([{filePath:'/work/app/page.tsx',messages:[{ruleId:'react-hooks/set-state-in-effect',severity:2,message:'effect'}]}],'/work');
 assert.equal(r.diagnostics.length,1);assert.equal(r.proposals.length,0);
});
test('blocks traversal and unsupported rules',()=>{
 const r=correlate([{filePath:'/work/../secret.ts',messages:[{ruleId:'@typescript-eslint/no-unused-vars',severity:2}]},{filePath:file,messages:[{ruleId:'unknown-rule',severity:2}]}],'/work');
 assert.equal(r.diagnostics.length,0);
});
test('fails closed on source drift',()=>{
 const r=correlate([{filePath:file,messages:[{ruleId:'@typescript-eslint/no-unused-vars',severity:1}]}],'/work',()=> 'changed source');
 assert.equal(r.proposals[0].status,'blocked');
});
