import test from 'node:test';
import assert from 'node:assert/strict';
import { consolidate } from './aieo-review-summary.mjs';
const digest='a'.repeat(64);
const one=(role, rule)=>({role,schemaVersion:1,mode:'read-only-static-review',sourceManifestHash:digest,
  filesReviewed:2, findingCount:1,ruleCounts:{[rule]:1},
  findings:[{rule,file:'app/login/page.tsx',line:4,severity:'review'}]});
test('Consolidates independent same-source verdicts into review-only queue',()=>{
 const r=consolidate(one('designer','UX-RTL-INPUT'),one('developer','DEV-CLIENT-QUERY'));
 assert.equal(r.totalReviewLeads,2);assert.equal(r.status,'human-triage-required');
 assert.equal(r.rulePriorities[0].priority,'P1-review');
 assert.equal(r.codeModified,false);assert.equal(r.deployPerformed,false);
});
test('Refuses mismatched source manifests',()=>{
 const d=one('designer','UX-RTL-INPUT'),v=one('developer','DEV-CLIENT-QUERY');
 v.sourceManifestHash='b'.repeat(64);assert.throws(()=>consolidate(d,v));
});
test('Refuses forged counts',()=>{
 const d=one('designer','UX-RTL-INPUT');d.findingCount=2;
 assert.throws(()=>consolidate(d,one('developer','DEV-CLIENT-QUERY')));
});
test('Refuses untrusted file paths and unknown rules',()=>{
 const d=one('designer','UX-RTL-INPUT');d.findings[0].file='app/../secrets.ts';
 assert.throws(()=>consolidate(d,one('developer','DEV-CLIENT-QUERY')));
 const x=one('developer','BAD-RULE');assert.throws(()=>consolidate(one('designer','UX-RTL-INPUT'),x));
});
test('Refuses incompatible role or zero-file reports',()=>{
 const d=one('designer','UX-RTL-INPUT');d.filesReviewed=0;
 assert.throws(()=>consolidate(d,one('developer','DEV-CLIENT-QUERY')));
});
