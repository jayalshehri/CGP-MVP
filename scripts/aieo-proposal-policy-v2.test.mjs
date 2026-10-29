import test from 'node:test';
import assert from 'node:assert/strict';
import {CATALOG,checkProposal} from './aieo-proposal-policy-v2.mjs';
test('all catalog proposals produce read-only reports',()=>{
 for(const p of CATALOG){
  const r=checkProposal(p,'prefix\n'+p.before+'\nsuffix');
  assert.equal(r.status,'proposed');
  assert.equal(r.path,p.path);
  assert.equal(r.changed,true);
 }
});
test('reject unapproved path',()=>{
 assert.throws(()=>checkProposal({...CATALOG[0],path:'../.env'},CATALOG[0].before),/Not allowlisted/);
});
test('reject arbitrary replacement',()=>{
 assert.throws(()=>checkProposal({...CATALOG[0],after:'malicious'},CATALOG[0].before),/Not allowlisted/);
});
test('reject source drift and multiple matches',()=>{
 const p=CATALOG[0];
 assert.throws(()=>checkProposal(p,'other source'),/Source drift/);
 assert.throws(()=>checkProposal(p,p.before+p.before),/Source drift/);
});
test('allow already applied proposal',()=>{
 const p=CATALOG[1];
 assert.equal(checkProposal(p,p.after).status,'already-applied');
});
